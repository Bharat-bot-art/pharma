(function () {
  window.BIOSYM = window.BIOSYM || {};

  window.BIOSYM.api = async function (url, opts = {}) {
    const headers = { ...opts.headers };
    if (!(opts.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    } else if (opts.body instanceof FormData && headers['Content-Type'] === 'application/json') {
      delete headers['Content-Type'];
    }

    const res = await fetch(url, {
      ...opts,
      headers,
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    return { status: res.status, ok: res.ok, data };
  };

  window.BIOSYM.errMessage = function (d, fallback) {
    if (!d) return fallback || 'Something went wrong.';
    if (d.message) return d.message;
    if (d.extra && d.extra.issues && Array.isArray(d.extra.issues)) {
      return `Please fix: ${d.extra.issues.join(', ')}.`;
    }
    return fallback || 'Something went wrong.';
  };

  // Inline error slot helper
  window.BIOSYM.showError = function (msg, slot = '[data-error-slot]') {
    const el = typeof slot === 'string' ? document.querySelector(slot) : slot;
    if (!el) return window.BIOSYM.toast.error(msg);
    el.innerHTML = `<div style="display:flex;align-items:flex-start;gap:10px;background:var(--danger-bg);border:1px solid #fecaca;color:var(--danger);padding:12px 14px;border-radius:var(--r-md);margin-bottom:18px;font-size:13.5px;font-weight:500">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex:none;margin-top:1px"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/></svg>
      <span>${msg}</span></div>`;
  };

  window.BIOSYM.loadingBtn = function (btn, on) {
    if (on) {
      btn.dataset.original = btn.innerHTML;
      btn.classList.add('is-loading');
      btn.innerHTML = '<span class="spinner"></span> Please wait…';
    } else {
      btn.classList.remove('is-loading');
      if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
    }
  };

  // Success animation
  window.BIOSYM.animateSuccess = function (root) {
    const old = root.querySelector('.success-check');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'success-check';
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    root.prepend(el);
    setTimeout(() => el.remove(), 1800);
  };

  // Auto refresh cart count from API after page load
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.BIOSYM.cart?.loadCart === 'function' && document.querySelector('[data-cart-count]')) {
      window.BIOSYM.cart.loadCart();
    }
  });
})();
