const { Core } = require('@adobe/aio-sdk');
const stateLib = require('@adobe/aio-lib-state');
const { getImsAccessToken } = require('../ims-token');

/** SaaS (ACCS) order path; on-prem uses `/rest/{store}/V1/orders/{id}`. */
function orderResourceUrl(baseUrl, orderId, p) {
  const b = String(baseUrl).replace(/\/$/, '');
  const id = encodeURIComponent(String(orderId));

  if (/api\.commerce\.adobe\.com/i.test(b)) {
    let path = `${b}/V1/orders/${id}`;
    const storeId =
      (p && p.storeId != null && String(p.storeId).trim()) ||
      (p && p.COMMERCE_STORE_CODE && String(p.COMMERCE_STORE_CODE).trim()) ||
      '';
    if (storeId) {
      path += `?storeId=${encodeURIComponent(storeId)}`;
    }
    return path;
  }

  const storeCode = (p && p.COMMERCE_STORE_CODE) || 'default';
  return `${b}/rest/${encodeURIComponent(storeCode)}/V1/orders/${id}`;
}

async function main(params) {
  const logger = Core.Logger('order-event-consumer', {
    level: params.LOG_LEVEL || 'info',
  });

  try {
    const eventId = params.event_id;
    const eventData = params.data?.value || params.event?.data || {};
    const eventType = params.type || params.event_type || 'unknown';
    logger.info(`Event received: ${eventType}, ID: ${eventId}`);

    const eventKey =
      eventId !== undefined && eventId !== null && String(eventId).length > 0
        ? `event-${eventId}`
        : null;

    const state = await stateLib.init();

    if (eventKey) {
      const existing = await state.get(eventKey);
      if (existing && existing.value) {
        logger.info(`Event ${eventId} already processed, skipping`);
        return {
          statusCode: 200,
          body: { message: 'Event already processed', eventId },
        };
      }
    }

    const orderId =
      eventData.entity_id || eventData.increment_id || eventData.id;
    if (!orderId) {
      logger.warn('No order ID found in event payload');
      return {
        statusCode: 200,
        body: { message: 'No order ID in payload, skipping', eventId },
      };
    }

    logger.info(`Processing order: ${orderId}`);

    const rawBase = params.COMMERCE_API_BASE_URL;
    if (!rawBase || typeof rawBase !== 'string') {
      logger.error('Missing COMMERCE_API_BASE_URL');
      return {
        statusCode: 500,
        body: { error: 'Missing COMMERCE_API_BASE_URL' },
      };
    }

    const accessToken = await getImsAccessToken(params);
    const orderUrl = orderResourceUrl(rawBase, orderId, params);
    logger.info(`Fetching order from: ${orderUrl}`);

    const orderResponse = await fetch(orderUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': params.IMS_OAUTH_S2S_CLIENT_ID,
        'x-gw-ims-org-id': params.IMS_OAUTH_S2S_ORG_ID,
        'Content-Type': 'application/json',
      },
    });

    if (!orderResponse.ok) {
      const errText = await orderResponse.text();
      logger.error(
        `Commerce API returned ${orderResponse.status} for order ${orderId}: ${errText.slice(0, 500)}`
      );
      return {
        statusCode: 500,
        body: { error: `Failed to fetch order ${orderId}` },
      };
    }

    const order = await orderResponse.json();

    const enrichedOrder = {
      orderId: order.entity_id,
      incrementId: order.increment_id,
      status: order.status,
      customerEmail: order.customer_email,
      grandTotal: order.grand_total,
      currency: order.order_currency_code,
      itemCount: order.items?.length || 0,
      processedAt: new Date().toISOString(),
      enrichment: {
        orderTier: classifyOrderTier(order.grand_total),
        isHighValue: parseFloat(order.grand_total) >= 500,
        itemSummary: (order.items || []).map((item) => ({
          sku: item.sku,
          name: item.name,
          qty: item.qty_ordered,
        })),
      },
    };

    logger.info('Enriched order:', JSON.stringify(enrichedOrder));

    await state.put(`order-${orderId}`, JSON.stringify(enrichedOrder), {
      ttl: 604800,
    });

    if (eventKey) {
      await state.put(
        eventKey,
        JSON.stringify({ processedAt: new Date().toISOString() }),
        { ttl: 86400 }
      );
    }

    logger.info(`Successfully processed event ${eventId} for order ${orderId}`);
    return {
      statusCode: 200,
      body: {
        message: 'Event processed successfully',
        eventId,
        orderId,
        orderTier: enrichedOrder.enrichment.orderTier,
      },
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    logger.error('Event processing failed:', message, error && error.stack);
    return {
      statusCode: 500,
      body: {
        error: 'Event processing failed',
        detail: message,
      },
    };
  }
}

function classifyOrderTier(grandTotal) {
  const total = parseFloat(grandTotal);
  if (total >= 1000) return 'platinum';
  if (total >= 500) return 'gold';
  if (total >= 100) return 'silver';
  return 'bronze';
}

exports.main = main;
