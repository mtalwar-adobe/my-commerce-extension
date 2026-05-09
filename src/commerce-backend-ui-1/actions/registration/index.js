'use strict';

const extensionId = 'order_enrichment_admin';
const menuSectionId = `${extensionId}::apps`;
const menuItemId = `${extensionId}::enriched_orders`;

async function main () {
  return {
    statusCode: 200,
    body: {
      registration: {
        menuItems: [
          {
            id: menuSectionId,
            title: 'Order Enrichment',
            isSection: true,
            sortOrder: 100,
          },
          {
            id: menuItemId,
            title: 'Enriched Orders',
            parent: menuSectionId,
            sortOrder: 1,
          },
        ],
        page: {
          title: 'Enriched Orders Dashboard',
        },
      },
    },
  };
}

exports.main = main;
