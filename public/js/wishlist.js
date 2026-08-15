(function () {
  const grid = document.querySelector('[data-wishlist-grid]');
  if (!grid) return;

  function card(p) {
    const discount = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
    return `
    <article class="product-card" data-pid="${p.id}">
      <a class="product-media" href="/product/${p.slug}"><img src="/img/product/${p.image_hue}.svg" alt="${p.name}"></a>
      <button class="wish-btn active" data-wish="${p.id}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor" stroke-width="1.8"><path d="M12 20.5C7 16.5 3 13.2 3 9.3 3 6.4 5.3 4 8.2 4c1.6 0 3 .7 3.8 1.9C12.8 4.7 14.2 4 15.8 4 18.7 4 21 6.4 21 9.3c0 3.9-4 7.2-9 11.2z"/></svg>
      </button>
      <div class="product-body">
        <div class="product-cat">${p.category_name || ''}</div>
        <h3 class="product-name"><a href="/product/${p.slug}">${p.name}</a></h3>
        <div class="product-foot">
          <div class="price-line">
            <span class="price">₹${Number(p.price).toFixed(0)}</span>
            <span class="mrp">₹${Number(p.mrp).toFixed(0)}</span>
            ${discount ? `<span class="discount">${discount}% off</span>` : ''}
          </div>
          <button class="cart-btn" data-add-cart="${p.id}" data-name="${p.name}">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l1 13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L6 7Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>
            <span>Move to Cart</span>
          </button>
        </div>
      </div>
    </article>`;
  }

  async function load() {
    const { ok, data } = await window.BIOSYM.api('/api/wishlist');
    if (!ok) return;
    if (data.items.length === 0) {
      grid.innerHTML = `<div class="empty-state card">
        <div class="art"><svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.3" style="color:var(--ink-300)"><path d="M12 20.5C7 16.5 3 13.2 3 9.3 3 6.4 5.3 4 8.2 4c1.6 0 3 .7 3.8 1.9C12.8 4.7 14.2 4 15.8 4 18.7 4 21 6.4 21 9.3c0 3.9-4 7.2-9 11.2z"/></svg></div>
        <h3 style="font-size:18px">Your wishlist is empty</h3>
        <p class="text-muted">Tap the heart on any product to save it here.</p>
        <a class="btn btn-primary" href="/shop">Browse Products</a>
      </div>`;
      return;
    }
    grid.innerHTML = `<div class="product-grid-4">${data.items.map(card).join('')}</div>`;

    grid.querySelectorAll('[data-wish]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.wish;
        const { ok } = await window.BIOSYM.api(`/api/wishlist/${pid}`, { method: 'DELETE' });
        if (ok) { btn.closest('[data-pid]').remove(); window.BIOSYM.toast.info('Removed from wishlist'); }
      });
    });
    grid.querySelectorAll('[data-add-cart]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await window.BIOSYM.cart.addToCart(btn.dataset.addCart, 1, { name: btn.dataset.name });
        if (ok) {
          btn.classList.add('added');
          btn.querySelector('span').textContent = 'Added ✓';
          setTimeout(() => btn.classList.remove('added'), 1600);
        }
      });
    });
  }

  load();
})();
