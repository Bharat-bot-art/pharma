(function () {
  const list = document.querySelector('[data-orders-list]');
  if (!list) return;

  const statusMeta = {
    placed: ['placed', 'info'], confirmed: ['confirmed', 'info'], packed: ['packed', 'warning'],
    shipped: ['shipped', 'success'], delivered: ['delivered', 'success'], cancelled: ['cancelled', 'danger'],
  };

  function money(n) { return '₹' + Number(n).toFixed(2).replace(/\.00$/, ''); }

  async function load() {
    const { ok, data } = await window.BIOSYM.api('/api/account/orders');
    if (!ok) return;
    if (data.orders.length === 0) {
      list.innerHTML = `<div class="empty-state card">
        <div class="art"><svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.3" style="color:var(--ink-300)"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z"/><path d="M3 7.5l9 4.5 9-4.5"/><path d="M12 12v9"/></svg></div>
        <h3 style="font-size:18px">No orders yet</h3>
        <p class="text-muted">When you place your first order, it will appear here.</p>
        <a class="btn btn-primary" href="/shop">Start Shopping</a>
      </div>`;
      return;
    }
    list.innerHTML = data.orders.map((o) => {
      const [label] = statusMeta[o.status] || [o.status];
      return `
      <div class="order-card">
        <div class="order-head">
          <div class="row" style="gap:14px;flex-wrap:wrap">
            <div>
              <div class="order-num">${o.order_number}</div>
              <div class="order-date">${new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${o.item_count} item${o.item_count !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <div class="row" style="gap:14px;flex-wrap:wrap">
            <span class="status ${label}">${o.status}</span>
            <strong style="font-size:17px">${money(o.total)}</strong>
            <a class="btn btn-outline btn-sm" href="/orders/${o.order_number}">View Details</a>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  load();
})();
