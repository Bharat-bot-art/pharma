(function () {
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.from(document.querySelectorAll(sel)); }

  // Mobile nav
  const mobileNav = q('[data-mobile-nav]');
  const openMobile = q('[data-open-mobile]');
  const closeMobile = q('[data-close-mobile]');
  if (mobileNav && openMobile) {
    openMobile.addEventListener('click', () => mobileNav.classList.add('open'));
    const close = () => mobileNav.classList.remove('open');
    if (closeMobile) closeMobile.addEventListener('click', close);
    mobileNav.addEventListener('click', (e) => { if (e.target === mobileNav) close(); });
  }

  // Account dropdown
  const dd = q('[data-dropdown]');
  if (dd) {
    const toggle = q('[data-dropdown-toggle]');
    if (toggle) {
      toggle.addEventListener('click', (e) => { e.stopPropagation(); dd.classList.toggle('open'); });
      document.addEventListener('click', (e) => {
        if (!dd.contains(e.target)) dd.classList.remove('open');
      });
    }
  }

  // Toggle password visibility
  qa('[data-toggle-pw]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.input-wrap').querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show
        ? '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.2A9.6 9.6 0 0 1 12 4c6.5 0 10 7 10 7a17 17 0 0 1-2.4 3.3M6.6 6.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.9-.8"/></svg>'
        : '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  });

  // Caps lock warnings
  qa('[data-caps-lock]').forEach((input) => {
    const warn = input.closest('.field').querySelector('[data-caps-warning]');
    if (!warn) return;
    const show = () => warn.classList.add('show');
    const hide = () => warn.classList.remove('show');
    input.addEventListener('keyup', (e) => {
      const isCaps = e.getModifierState && e.getModifierState('CapsLock');
      if (isCaps) show(); else hide();
    });
  });

  // Logout
  qa('[data-logout]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      location.href = '/login';
    });
  });

  // Newsletter
  q('[data-newsletter]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const input = form.querySelector('input[type="email"]');
    const email = input && input.value.trim();
    if (!email) return window.BIOSYM.toast.warning('Please enter your email.');
    const btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.classList.add('is-loading');
      btn.innerHTML = '<span class="spinner"></span>';
    }
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.ok) {
        window.BIOSYM.toast.success('Subscribed! We\'ll keep you posted.');
        form.reset();
      } else {
        window.BIOSYM.toast.error(data.message || 'Could not subscribe. Please try again.');
      }
    } catch (err) {
      window.BIOSYM.toast.error('Network error. Please try again.');
    }
    if (btn) {
      btn.classList.remove('is-loading');
      btn.innerHTML = '<span>Subscribe</span>';
    }
  });

  // Password strength meter (shared)
  const STRENGTHS = [
    { score: 2, label: 'Too weak', cls: 'weak' },
    { score: 3, label: 'Weak', cls: 'weak' },
    { score: 4, label: 'Fair', cls: 'fair' },
    { score: 5, label: 'Good', cls: 'good' },
    { score: 6, label: 'Strong', cls: 'strong' },
  ];
  window.BIOSYM.pwStrength = function (pw) {
    let s = 0;
    if (!pw) return { score: 0, label: 'Too weak', cls: 'weak' };
    if (pw.length >= 8) s += 1;
    if (pw.length >= 12) s += 1;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 1;
    if (/[0-9]/.test(pw)) s += 1;
    if (/[^A-Za-z0-9]/.test(pw)) s += 1;
    if (pw.length >= 16) s += 1;
    const found = STRENGTHS.find((x) => s <= x.score) || STRENGTHS[STRENGTHS.length - 1];
    return { score: s, label: found.label, cls: found.cls };
  };

  qa('[data-strength]').forEach((input) => {
    const field = input.closest('.field');
    const meter = field.querySelector('[data-pw-meter]');
    const label = field.querySelector('[data-pw-label]');
    const rules = field.querySelector('[data-pw-rules]');
    if (!meter) return;

    const setRules = (pw) => {
      if (!rules) return;
      rules.querySelector('[data-rule="length"] .no, [data-rule="length"] .ok').className = pw.length >= 8 ? 'ok' : 'no';
      rules.querySelector('[data-rule="case"] .no, [data-rule="case"] .ok').className = /[a-z]/.test(pw) && /[A-Z]/.test(pw) ? 'ok' : 'no';
      rules.querySelector('[data-rule="number"] .no, [data-rule="number"] .ok').className = /[0-9]/.test(pw) ? 'ok' : 'no';
      rules.querySelector('[data-rule="special"] .no, [data-rule="special"] .ok').className = /[^A-Za-z0-9]/.test(pw) ? 'ok' : 'no';
    };

    input.addEventListener('input', () => {
      const s = window.BIOSYM.pwStrength(input.value);
      meter.querySelectorAll('span').forEach((bar, i) => {
        bar.className = i < s.score && s.score > 0 ? `fill-${s.cls}` : '';
      });
      if (label) { label.textContent = s.label; label.className = `pw-label ${s.cls}`; }
      setRules(input.value);
    });
  });
})();
