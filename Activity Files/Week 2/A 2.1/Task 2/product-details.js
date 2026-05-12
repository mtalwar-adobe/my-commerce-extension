<div class="product-details__stock" role="status" aria-live="polite"></div>


const $stock = fragment.querySelector('.product-details__stock');


events.on('pdp/data', (product) => {
if (!product) return;
if (product.inStock) {
$stock.textContent = '● In Stock';
$stock.className = 'product-details__stock stock-badge stock-badge--in-stock';
} else {
$stock.textContent = '● Out of Stock';
$stock.className = 'product-details__stock stock-badge stock-badge--out-of-stock';
}
}, { eager: true });