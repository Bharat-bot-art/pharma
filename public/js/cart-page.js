(function () {
  const itemsEl = document.querySelector('[data-cart-page-items]');
  const summaryEl = document.querySelector('[data-cart-summary]');
  const emptyEl = document.querySelector('[data-cart-empty]');
  if (!itemsEl) return;

  const FREE_ABOVE = 499;
  const FEE = 49;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function money(n) { return '₹' + Number(n).toFixed(2).replace(/\.00$/, ''); }

  function render(data) {
    if (!data.items || data.items.length === 0) {
      itemsEl.innerHTML = '';
      summaryEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }
    emptyEl.style.display = 'none';
    summaryEl.style.display = '';
    const shipping = data.subtotal >= FREE_ABOVE ? 0 : FEE;
    const total = data.subtotal + shipping;

    itemsEl.innerHTML = data.items.map((i) => `
      <div class="cart-item">
        <a href="/product/${esc(i.product.slug)}"><img src="/img/product/${i.product.imageHue}.svg" alt="${esc(i.product.name)}"></a>
        <div>
          <div class="product-cat">${esc(i.product.category || '')}</div>
          <h3 class="product-name" style="margin:2px 0"><a href="/product/${esc(i.product.slug)}">${esc(i.product.name)}</a></h3>
          <div class="row" style="margin-top:6px;gap:6px">
            <span class="price" style="font-size:16px">${money(i.product.price)}</span>
            <span class="mrp">${money(i.product.mrp)}</span>
          </div>
          <div class="qty-selector" style="margin-top:10px">
            <button type="button" data-page-qty="${i.itemId}" data-delta="-1" aria-label="Decrease">−</button>
            <input type="text" value="${i.qty}" data-page-qty-val="${i.itemId}" readonly aria-label="Quantity">
            <button type="button" data-page-qty="${i.itemId}" data-delta="1" aria-label="Increase">+</button>
          </div>
        </div>
        <div style="text-align:right;display:grid;justify-items:end;gap:10px">
          <strong style="font-size:17px">${money(i.lineTotal)}</strong>
          <button class="btn btn-danger btn-sm" data-page-remove="${i.itemId}">Remove</button>
        </div>
      </div>`).join('');

    const count = data.count;
    const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val; };
    set('[data-summary-count]', count);
    set('[data-summary-subtotal]', money(data.subtotal));
    set('[data-summary-shipping]', shipping === 0 ? 'FREE' : money(shipping));
    set('[data-summary-total]', money(total));
    const hint = document.querySelector('[data-free-ship-hint]');
    if (hint) {
      hint.innerHTML = shipping > 0
        ? `Add ${money(FREE_ABOVE - data.subtotal)} more for FREE delivery`
        : '✓ You get FREE delivery on this order';
    }
  }

  async function load() {
    const { ok, data } = await window.BIOSYM.api('/api/cart');
    if (ok) render(data);
  }

  itemsEl.addEventListener('click', async (e) => {
    const qtyBtn = e.target.closest('[data-page-qty]');
    const rmBtn = e.target.closest('[data-page-remove]');
    if (qtyBtn) {
      const id = qtyBtn.dataset.pageQty;
      const valEl = itemsEl.querySelector(`[data-page-qty-val="${id}"]`);
      const next = Math.max(1, parseInt(valEl.value, 10) + parseInt(qtyBtn.dataset.delta, 10));
      const { ok, data } = await window.BIOSYM.api(`/api/cart/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty: next }),
      });
      if (ok) render(data);
      window.BIOSYM.cart && window.BIOSYM.cart.setCount && window.BIOSYM.cart.setCount(data.count);
    }
    if (rmBtn) {
      const id = rmBtn.dataset.pageRemove;
      const { ok, data } = await window.BIOSYM.api(`/api/cart/${id}`, { method: 'DELETE' });
      if (ok) render(data);
      window.BIOSYM.cart && window.BIOSYM.cart.setCount && window.BIOSYM.cart.setCount(data.count);
    }
  });

  load();
})();
