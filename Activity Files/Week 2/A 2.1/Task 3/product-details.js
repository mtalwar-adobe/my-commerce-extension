<div class="product-details__custom-attribute"></div>

const $customAttribute = fragment.querySelector('.product-details__custom-attribute');


  events.on('pdp/data', (product) => {
    if (!product) return;
    if (product.inStock) {
      $stock.textContent = '● In Stock';
      $stock.className = 'product-details__stock stock-badge stock-badge--in-stock';
    } else {
      $stock.textContent = '● Out of Stock';
      $stock.className = 'product-details__stock stock-badge stock-badge--out-of-stock';
    }
    const value = product.metaTitle;
    if (value) {
      $customAttribute.innerHTML = `
      <div class="custom-attribute">
      <dt>Custom Attribute Label</dt>
      <dd>${value}</dd>
      </div>
      `;
    }
  }, { eager: true });
 
 