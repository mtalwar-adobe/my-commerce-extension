const { Core } = require('@adobe/aio-sdk');

async function main(params) {
  const logger = Core.Logger('order-event-consumer', {
    level: params.LOG_LEVEL || 'info',
  });
  logger.info('Event received:', JSON.stringify(params));
  try {
    const eventType = params.type || params.event_type;
    const eventId = params.event_id;
    const eventData = params.data?.value || params.event?.data || {};
    logger.info(`Processing event: ${eventType}, ID: ${eventId}`);
    logger.info('Event data:', JSON.stringify(eventData));
    return {
      ok: true,
      message: 'Event received and logged',
      eventId,
      eventType,
    };
  } catch (error) {
    logger.error('Event processing failed:', error.message);
    throw error;
  }
}

exports.main = main;
