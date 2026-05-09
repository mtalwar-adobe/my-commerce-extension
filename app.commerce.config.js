'use strict';

const { defineConfig } = require('@adobe/aio-commerce-lib-app/config');

module.exports = defineConfig({
  metadata: {
    id: 'order-enrichment-admin',
    displayName: 'Order enrichment admin',
    description:
      'Commerce extensibility and Admin UI SDK lab — product enrichment and admin dashboard.',
    version: '1.0.0',
  },
  adminUiSdk: {
    registration: {
      menuItems: [
        {
          id: 'order_enrichment_admin::apps',
          title: 'Order Enrichment',
          isSection: true,
          sortOrder: 100,
        },
        {
          id: 'order_enrichment_admin::enriched_orders',
          title: 'Enriched Orders',
          parent: 'order_enrichment_admin::apps',
          sortOrder: 1,
        },
      ],
      page: {
        title: 'Enriched Orders Dashboard',
      },
    },
  },
});
