const { Core } = require('@adobe/aio-sdk');
const stateLib = require('@adobe/aio-lib-state');

async function main (params) {
  const logger = Core.Logger('get-enriched-orders', {
    level: params.LOG_LEVEL || 'info',
  });

  try {
    const state = await stateLib.init();
    const knownOrdersResult = await state.get('known-order-ids');
    let knownOrderIds = [];
    if (knownOrdersResult && knownOrdersResult.value) {
      try {
        knownOrderIds = JSON.parse(knownOrdersResult.value);
      } catch {
        knownOrderIds = [];
      }
    }

    const orders = [];
    for (const id of knownOrderIds) {
      const row = await state.get(`order-${id}`);
      if (row && row.value) {
        try {
          orders.push(JSON.parse(row.value));
        } catch {
          /* skip corrupt row */
        }
      }
    }

    orders.sort(
      (a, b) =>
        new Date(b.processedAt || 0) - new Date(a.processedAt || 0),
    );

    const totalRevenue = orders.reduce(
      (sum, o) => sum + parseFloat(o.grandTotal ?? 0),
      0,
    );
    const highValueCount = orders.filter((o) => o.enrichment?.isHighValue)
      .length;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        orders,
        summary: {
          totalOrders: orders.length,
          totalRevenue,
          highValueCount,
        },
      },
    };
  } catch (error) {
    logger.error('Failed to fetch enriched orders:', error.message);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: { error: 'Failed to fetch enriched orders' },
    };
  }
}

exports.main = main;
