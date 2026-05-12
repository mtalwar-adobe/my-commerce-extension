import { readBlockConfig } from '../../scripts/aem.js';

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const categoryId = config['category-id'] ?? '';
  const categoryPath = config['url-path'] ?? config.urlpath ?? '';
  const heading = config.heading ?? 'Featured Products';
  const maxProductsStr = config['max-products'] ?? config.maxproducts ?? '4';
 
  const maxProducts = parseInt(maxProductsStr, 10) || 4;
 
  block.innerHTML = `
    <div class="promo-banner__heading">
      <h2>${escapeHtml(heading)}</h2>
    </div>
    <div class="promo-banner__products">
      <p class="promo-banner__status">Loading products...</p>
    </div>
  `;
  }