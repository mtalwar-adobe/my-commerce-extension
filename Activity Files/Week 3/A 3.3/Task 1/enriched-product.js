import { readBlockConfig } from '../../scripts/aem.js';
import { CS_FETCH_GRAPHQL } from '../../scripts/commerce.js';

/** Catalog Service query (same shape as PDP / promo-banner), not legacy Mesh. */
const PRODUCT_CARD_QUERY = `
  query EnrichedProductCard($skus: [String]) {
    products(skus: $skus) {
      __typename
      sku
      name
      images(roles: []) {
        url
        label
      }
      ... on SimpleProductView {
        price {
          final {
            amount {
              value
              currency
            }
          }
        }
      }
      ... on ComplexProductView {
        priceRange {
          minimum {
            final {
              amount {
                value
                currency
              }
            }
          }
        }
      }
    }
  }
`;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function imageSrc(url) {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (/^https?:/i.test(url)) return url;
  return `https://${url.replace(/^\/+/, '')}`;
}

function extractDisplayPrice(product) {
  if (!product) return null;
  const simple = product.price?.final?.amount;
  if (simple?.value != null) return simple;
  const range = product.priceRange?.minimum?.final?.amount;
  if (range?.value != null) return range;
  return null;
}

async function fetchProductCard(sku) {
  const { data, errors } = await CS_FETCH_GRAPHQL.fetchGraphQl(PRODUCT_CARD_QUERY, {
    method: 'GET',
    variables: { skus: [sku] },
  });

  if (errors?.length) {
    const message = errors.map((e) => e.message).join('; ');
    throw new Error(message || 'GraphQL error');
  }

  const list = data?.products;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[0];
}

export default async function decorate(block) {
  const { sku: rawSku } = readBlockConfig(block);
  const sku = rawSku != null ? String(rawSku).trim() : '';

  if (!sku) {
    block.innerHTML = '<p>No SKU configured for this block.</p>';
    return;
  }

  block.innerHTML = '<p>Loading product details...</p>';

  try {
    const product = await fetchProductCard(sku);

    if (!product) {
      block.innerHTML = '<p>Product not found.</p>';
      return;
    }

    const price = extractDisplayPrice(product);
    const image = product.images?.[0];
    const imgUrl = image ? imageSrc(image.url) : '';
    const imgAlt = escapeHtml(image?.label || product.name || '');

    block.innerHTML = `
      <div class="enriched-product__card">
        ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="${imgAlt}" loading="lazy" width="400" height="400" />` : ''}
        <div class="enriched-product__info">
          <h3>${escapeHtml(product.name || '')}</h3>
          <p class="enriched-product__sku">SKU: ${escapeHtml(product.sku || sku)}</p>
          ${price ? `<p class="enriched-product__price">${escapeHtml(price.currency)} ${Number(price.value).toFixed(2)}</p>` : ''}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Enriched product block failed:', error);
    block.innerHTML = '<p>Unable to load product data.</p>';
  }
}
