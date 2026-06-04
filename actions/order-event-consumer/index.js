const { Core } = require('@adobe/aio-sdk');
const stateLib = require('@adobe/aio-lib-state');
const { getImsAccessToken } = require('../ims-token');

function isSaasCommerceBase(baseUrl) {
  return /api\.commerce\.adobe\.com/i.test(String(baseUrl));
}

/** Numeric store id for ACCS `?storeId=` — not the Magento store *code*. */
function resolveStoreId(p, eventData) {
  if (eventData?.store_id != null && String(eventData.store_id).trim()) {
    return String(eventData.store_id).trim();
  }
  if (p?.storeId != null && String(p.storeId).trim()) {
    return String(p.storeId).trim();
  }
  if (p?.COMMERCE_STORE_ID != null && String(p.COMMERCE_STORE_ID).trim()) {
    return String(p.COMMERCE_STORE_ID).trim();
  }
  return '';
}

/** REST path uses entity_id; increment_id in the URL usually returns 404. */
function resolveOrderEntityId(eventData) {
  if (eventData?.entity_id != null && String(eventData.entity_id).length > 0) {
    return String(eventData.entity_id);
  }
  if (eventData?.id != null && String(eventData.id).length > 0) {
    return String(eventData.id);
  }
  return null;
}

function commerceApiHeaders(params, accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'x-api-key': params.IMS_OAUTH_S2S_CLIENT_ID,
    'x-gw-ims-org-id': params.IMS_OAUTH_S2S_ORG_ID,
    'Content-Type': 'application/json',
  };
}

/** SaaS (ACCS) order path; on-prem uses `/rest/{store}/V1/orders/{id}`. */
function orderResourceUrl(baseUrl, orderId, p, eventData) {
  const b = String(baseUrl).replace(/\/$/, '');
  const id = encodeURIComponent(String(orderId));

  if (isSaasCommerceBase(b)) {
    let path = `${b}/V1/orders/${id}`;
    const storeId = resolveStoreId(p, eventData);
    if (storeId) {
      path += `?storeId=${encodeURIComponent(storeId)}`;
    }
    return path;
  }

  const storeCode = (p && p.COMMERCE_STORE_CODE) || 'default';
  return `${b}/rest/${encodeURIComponent(storeCode)}/V1/orders/${id}`;
}

function orderSearchUrl(baseUrl, p, eventData) {
  const b = String(baseUrl).replace(/\/$/, '');
  if (isSaasCommerceBase(b)) {
    let path = `${b}/V1/orders`;
    const storeId = resolveStoreId(p, eventData);
    if (storeId) {
      path += `?storeId=${encodeURIComponent(storeId)}`;
    }
    return path;
  }
  const storeCode = (p && p.COMMERCE_STORE_CODE) || 'default';
  return `${b}/rest/${encodeURIComponent(storeCode)}/V1/orders`;
}

function fetchErrorBody(status, orderId, orderUrl, incrementId) {
  const body = {
    error: `Failed to fetch order ${orderId}`,
    status,
    orderUrl,
  };
  if (status === 404) {
    body.hint =
      'Confirm the order exists and COMMERCE_API_BASE_URL / store scope are correct. '
      + 'REST GET /V1/orders/{id} requires entity_id (not increment_id). '
      + 'For ACCS, set COMMERCE_STORE_ID (numeric store id) or ensure the event includes store_id.';
    if (incrementId) {
      body.incrementId = String(incrementId);
    }
  } else if (status === 401 || status === 403) {
    body.hint =
      'Check IMS S2S credentials and that IMS_OAUTH_S2S_SCOPES includes Commerce API access for this tenant.';
  }
  return body;
}

async function searchOrderByIncrementId(
  baseUrl,
  incrementId,
  params,
  eventData,
  accessToken,
  logger
) {
  const listUrl = orderSearchUrl(baseUrl, params, eventData);
  const criteria = new URLSearchParams({
    'searchCriteria[filter_groups][0][filters][0][field]': 'increment_id',
    'searchCriteria[filter_groups][0][filters][0][value]': String(incrementId),
    'searchCriteria[filter_groups][0][filters][0][condition_type]': 'eq',
  });
  const separator = listUrl.includes('?') ? '&' : '?';
  const url = `${listUrl}${separator}${criteria.toString()}`;
  logger.info(`Searching order by increment_id: ${url}`);

  const res = await fetch(url, { headers: commerceApiHeaders(params, accessToken) });
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  const items = data.items || data;
  return Array.isArray(items) && items.length > 0 ? items[0] : null;
}

async function fetchOrderFromCommerce(
  baseUrl,
  entityId,
  incrementId,
  params,
  eventData,
  accessToken,
  logger
) {
  const orderUrl = orderResourceUrl(baseUrl, entityId, params, eventData);
  logger.info(`Fetching order from: ${orderUrl}`);

  const orderResponse = await fetch(orderUrl, {
    headers: commerceApiHeaders(params, accessToken),
  });

  if (orderResponse.ok) {
    return orderResponse.json();
  }

  const status = orderResponse.status;
  const errText = await orderResponse.text();
  logger.error(
    `Commerce API returned ${status} for order ${entityId}: ${errText.slice(0, 500)}`
  );

  if (
    status === 404 &&
    incrementId &&
    String(incrementId) !== String(entityId)
  ) {
    const found = await searchOrderByIncrementId(
      baseUrl,
      incrementId,
      params,
      eventData,
      accessToken,
      logger
    );
    if (found) {
      return found;
    }
  }

  return {
    error: fetchErrorBody(status, entityId, orderUrl, incrementId),
    status,
  };
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

    const entityId = resolveOrderEntityId(eventData);
    const incrementId = eventData.increment_id;
    if (!entityId) {
      logger.warn('No order entity_id in event payload', {
        increment_id: incrementId,
        keys: Object.keys(eventData),
      });
      return {
        statusCode: 200,
        body: {
          message: 'No order entity_id in payload, skipping',
          eventId,
          increment_id: incrementId,
        },
      };
    }

    logger.info(`Processing order entity_id=${entityId}`, {
      increment_id: incrementId,
      store_id: eventData.store_id,
    });

    const rawBase = params.COMMERCE_API_BASE_URL;
    if (!rawBase || typeof rawBase !== 'string') {
      logger.error('Missing COMMERCE_API_BASE_URL');
      return {
        statusCode: 500,
        body: { error: 'Missing COMMERCE_API_BASE_URL' },
      };
    }

    const accessToken = await getImsAccessToken(params);
    const fetchResult = await fetchOrderFromCommerce(
      rawBase,
      entityId,
      incrementId,
      params,
      eventData,
      accessToken,
      logger
    );

    if (fetchResult.error) {
      return {
        statusCode: fetchResult.status >= 400 && fetchResult.status < 600
          ? fetchResult.status
          : 500,
        body: fetchResult.error,
      };
    }

    const order = fetchResult;
    const stateOrderId = String(order.entity_id || entityId);

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

    await state.put(`order-${stateOrderId}`, JSON.stringify(enrichedOrder), {
      ttl: 604800,
    });

    if (eventKey) {
      await state.put(
        eventKey,
        JSON.stringify({ processedAt: new Date().toISOString() }),
        { ttl: 86400 }
      );
    }

    const knownOrdersResult = await state.get('known-order-ids');
    let knownOrderIds = [];
    if (knownOrdersResult && knownOrdersResult.value) {
      try {
        knownOrderIds = JSON.parse(knownOrdersResult.value);
      } catch {
        knownOrderIds = [];
      }
    }
    if (!knownOrderIds.includes(stateOrderId)) {
      knownOrderIds.push(stateOrderId);
      if (knownOrderIds.length > 100) {
        knownOrderIds = knownOrderIds.slice(-100);
      }
      await state.put('known-order-ids', JSON.stringify(knownOrderIds), {
        ttl: 604800,
      });
    }

    logger.info(
      `Successfully processed event ${eventId} for order ${stateOrderId}`
    );
    return {
      statusCode: 200,
      body: {
        message: 'Event processed successfully',
        eventId,
        orderId: stateOrderId,
        incrementId: order.increment_id,
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
