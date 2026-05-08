const { Core } = require('@adobe/aio-sdk');
const { stringParameters } = require('../../../../../actions/utils');

function parseJsonIfString(value) {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getProductFromParams(params) {
  const candidates = [
    params.product,
    params.data?.product,
    params.event?.data?.product,
    params.body?.product,
    params.body?.data?.product,
  ];

  const body = params.__ow_body ?? params.body;
  const parsedBody = parseJsonIfString(body);
  if (parsedBody && typeof parsedBody === 'object') {
    candidates.push(
      parsedBody.product,
      parsedBody.data?.product,
      parsedBody.event?.data?.product,
    );
  }

  for (const c of candidates) {
    if (c && typeof c === 'object') {
      return c;
    }
  }
  return null;
}

async function main(params) {
  const logger = Core.Logger('validate-product', {
    level: params.LOG_LEVEL || 'info',
  });
  logger.info('Webhook received:', stringParameters(params));

  try {
    const product = getProductFromParams(params);

    if (!product) {
      logger.warn('No product object in webhook payload (paths checked)');
      return {
        statusCode: 200,
        body: { op: 'success' },
      };
    }

    const rawName = product.name;
    if (rawName == null || String(rawName).trim() === '') {
      return {
        statusCode: 200,
        body: { op: 'success' },
      };
    }

    const name = String(rawName);
    if (name.toLowerCase().includes('invalid')) {
      const message =
        'Product validation failed: product name must not contain the word "invalid".';
      logger.warn(message);
      return {
        statusCode: 200,
        body: {
          op: 'exception',
          message,
        },
      };
    }

    logger.info(`Product ${product.sku || 'unknown'} passed validation`);
    return {
      statusCode: 200,
      body: { op: 'success' },
    };
  } catch (error) {
    logger.error('Webhook handler failed:', error.message);
    return {
      statusCode: 200,
      body: { op: 'success' },
    };
  }
}

exports.main = main;
