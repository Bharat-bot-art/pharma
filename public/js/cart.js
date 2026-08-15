(function () {
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.from(document.querySelectorAll(sel)); }

  const drawer = q('[data-cart-drawer]');
  const backdrop = q('[data-cart-backdrop]');
  const itemsEl = q('[data-cart-items]');
  const footEl = q('[data-cart-foot]');
  const countEl = q('[data-cart-count]');

  function setCount(n) {
    if (countEl) {
      countEl.textContent = n;
      countEl.style.display = n > 0 ? '' : 'none';
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function loadCart() {
    try {
      const res = await fetch('/api/cart');
      const data = await res.json();
      if (data.ok) {
        setCount(data.count);
        renderItems(data.items, data.subtotal);
      }
    } catch (e) { /* ignore */ }
  }

  function renderItems(items, subtotal) {
    if (!itemsEl || !footEl) return;
    if (items.length === 0) {
      itemsEl.innerHTML = `<div style="text-align:center;padding:48px 0;color:var(--ink-400)">
        <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.3" style="margin:0 auto 12px"><path d="M6 7h12l1 13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L6 7Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>
        <p style="margin:0">Your cart is empty.</p>
        <a href="/shop" class="btn btn-primary btn-sm" style="margin-top:14px">Start Shopping</a>
      </div>`;
      footEl.style.display = 'none';
      return;
    }
    itemsEl.innerHTML = items.map((i) => `
      <div class="cd-row">
        <a class="cd-thumb" href="/product/${esc(i.product.slug)}"><img src="/img/product/${i.product.imageHue}.svg" alt="${esc(i.product.name)}"></a>
        <div class="cd-info">
          <div class="cd-name"><a href="/product/${esc(i.product.slug)}">${esc(i.product.name)}</a></div>
          <div class="text-xs" style="color:var(--ink-400)">₹${i.product.price.toFixed(2).replace(/\.00$/, '')} each</div>
          <div class="cd-qty">
            <button class="qty-btn" data-qty="${i.itemId}" data-delta="-1" aria-label="Decrease">−</button>
            <span style="font-weight:700;min-width:20px;text-align:center">${i.qty}</span>
            <button class="qty-btn" data-qty="${i.itemId}" data-delta="1" aria-label="Increase">+</button>
          </div>
        </div>
        <div style="text-align:right;display:grid;justify-items:end;gap:4px">
          <div class="cd-price">₹${i.lineTotal.toFixed(2).replace(/\.00$/, '')}</div>
          <button class="cd-remove" data-remove="${i.itemId}" aria-label="Remove">${svgTrash()}</button>
        </div>
      </div>`).join('');
    footEl.style.display = '';
    const sub = q('[data-cart-subtotal]');
    if (sub) sub.textContent = '₹' + subtotal.toFixed(2).replace(/\.00$/, '');
  }

  function svgTrash() {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
  }

  async function openCart() {
    if (drawer) drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    await loadCart();
  }
  function closeCart() {
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }

  q('[data-open-cart]')?.addEventListener('click', openCart);
  q('[data-close-cart]')?.addEventListener('click', closeCart);
  backdrop?.addEventListener('click', closeCart);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });

  async function addToCart(productId, qty, opts = {}) {
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, qty: qty || 1 }),
      });
      const data = await res.json();
      if (!data.ok) {
        window.BIOSYM.toast.error(data.message || 'Could not add to cart.');
        return false;
      }
      setCount(data.count);
      if (!opts.silent) {
        window.BIOSYM.toast.success(`${opts.name || 'Product'} added to cart`);
        await openCart();
      } else {
        window.BIOSYM.toast.success(`${opts.name || 'Product'} added to cart`);
      }
      return true;
    } catch (e) {
      window.BIOSYM.toast.error('Network error. Please try again.');
      return false;
    }
  }

  itemsEl?.addEventListener('click', async (e) => {
    const qtyBtn = e.target.closest('[data-qty]');
    const removeBtn = e.target.closest('[data-remove]');
    if (qtyBtn) {
      const id = qtyBtn.dataset.qty;
      const delta = parseInt(qtyBtn.dataset.delta, 10);
      const row = qtyBtn.closest('.cd-row');
      const current = parseInt(row.querySelector('.cd-qty span').textContent, 10);
      const next = Math.max(1, current + delta);
      const res = await fetch(`/api/cart/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty: next }),
      });
      const data = await res.json();
      if (data.ok) { setCount(data.count); renderItems(data.items, data.subtotal); }
    }
    if (removeBtn) {
      const res = await fetch(`/api/cart/${removeBtn.dataset.remove}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { setCount(data.count); renderItems(data.items, data.subtotal); }
    }
  });

  // Wishlist toggle
  qa('[data-wish]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const pid = btn.dataset.wish;
      if (!window.BIOSYM.user) {
        window.BIOSYM.toast.info('Please sign in to save items to your wishlist.');
        location.href = `/login?redirect=${encodeURIComponent(location.pathname)}`;
        return;
      }
      const inList = btn.classList.contains('active');
      const res = await fetch(`/api/wishlist/${pid}`, {
        method: inList ? 'DELETE' : 'POST',
      });
      const data = await res.json();
      if (data.ok) {
        btn.classList.toggle('active', data.inWishlist);
        window.BIOSYM.toast[data.inWishlist ? 'success' : 'info'](data.inWishlist ? 'Saved to wishlist' : 'Removed from wishlist');
      }
    });
  });

  // Add to cart buttons (static)
  qa('[data-add-cart]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pid = btn.dataset.addCart;
      const name = btn.dataset.name || 'Product';
      const scope = btn.closest('.pd-info') || btn.closest('.product-card');
      let qty = 1;
      const qtyInput = scope ? scope.querySelector('[data-qty]') : null;
      if (qtyInput) qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);

      btn.classList.add('is-loading');
      const original = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span>';
      const ok = await addToCart(pid, qty, { name });
      btn.classList.remove('is-loading');
      btn.innerHTML = original;
      if (ok) {
        btn.classList.add('added');
        const label = btn.querySelector('span');
        if (label) {
          label.textContent = 'Added ✓';
          setTimeout(() => { btn.classList.remove('added'); if (btn.querySelector('span')) btn.querySelector('span').textContent = 'Add to Cart'; }, 1800);
        }
      }
    });
  });

  // Quantity steppers on product page
  qa('[data-qty-plus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.qty-selector').querySelector('[data-qty]');
      const max = parseInt(input.max || '99', 10);
      input.value = Math.min(max, (parseInt(input.value, 10) || 1) + 1);
    });
  });
  qa('[data-qty-minus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.qty-selector').querySelector('[data-qty]');
      input.value = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
    });
  });

  window.BIOSYM.cart = { addToCart, loadCart, openCart, closeCart, setCount };
})();
