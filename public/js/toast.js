(function () {
  const ICONS = {
    success: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5M12 17.5h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/></svg>',
  };

  const wrap = () => document.querySelector('[data-toasts]');

  function show(type, message, opts = {}) {
    let container = wrap();
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-wrap';
      container.setAttribute('data-toasts', '');
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-ico">${ICONS[type] || ICONS.info}</span>
      <span class="toast-body"></span>
      <button class="toast-close" aria-label="Dismiss"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
    t.querySelector('.toast-body').textContent = message;
    t.querySelector('.toast-close').addEventListener('click', () => dismiss(t));
    container.appendChild(t);

    const duration = opts.duration || 4200;
    const timer = setTimeout(() => dismiss(t), duration);
    t.addEventListener('mouseenter', () => clearTimeout(timer));
    return t;
  }

  function dismiss(t) {
    if (!t || t.classList.contains('leave')) return;
    t.classList.add('leave');
    setTimeout(() => t.remove(), 260);
  }

  window.BIOSYM = window.BIOSYM || {};
  window.BIOSYM.toast = {
    success: (m, o) => show('success', m, o),
    error: (m, o) => show('error', m, o),
    warning: (m, o) => show('warning', m, o),
    info: (m, o) => show('info', m, o),
  };
})();
