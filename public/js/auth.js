(function () {
  function q(sel) { return document.querySelector(sel); }
  const { api, errMessage, loadingBtn, showError, animateSuccess } = window.BIOSYM;

  function redirectTo(next) {
    const target = next && !next.startsWith('http') ? next : '/account';
    location.href = target;
  }

  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
  const isMobile = (v) => /^[6-9]\d{9}$/.test(String(v).trim().replace(/[^\d]/g, ''));
  const normalize = (v) => (isEmail(v) ? String(v).trim().toLowerCase() : String(v).trim().replace(/[^\d]/g, '').slice(-10));

  function detectChannel(v) { return isEmail(v) ? 'email' : 'sms'; }

  // ---------------- LOGIN ----------------
  const passwordForm = q('[data-login-password]');
  const otpForm = q('[data-login-otp]');
  const toggle = q('#method-toggle');
  const switchMethodBtn = q('[data-switch-method]');

  function activate(method) {
    if (!toggle) return;
    const isOtp = method === 'otp';
    toggle.classList.toggle('panel-2', isOtp);
    toggle.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-selected', b.dataset.method === method ? 'true' : 'false');
    });
    if (passwordForm) passwordForm.hidden = isOtp;
    if (otpForm) otpForm.hidden = !isOtp;
    if (switchMethodBtn) {
      switchMethodBtn.textContent = isOtp ? 'Login with Password instead' : 'Login with OTP instead';
    }
  }

  toggle?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.dataset.method));
  });
  switchMethodBtn?.addEventListener('click', () => {
    const isOtp = toggle.classList.contains('panel-2');
    activate(isOtp ? 'password' : 'otp');
  });

  if (new URLSearchParams(location.search).get('registered') === '1') {
    window.BIOSYM.toast.success('Account created successfully. Please sign in.');
  }
  if (new URLSearchParams(location.search).get('reset') === '1') {
    window.BIOSYM.toast.success('Password updated. Please sign in with your new password.');
  }

  passwordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = q('[data-login-btn]');
    const id = passwordForm.identifier.value.trim();
    if (!id) return showError('Please enter your email or mobile number.');
    if (!passwordForm.password.value) return showError('Please enter your password.');

    loadingBtn(btn, true);
    const { ok, data } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: id, password: passwordForm.password.value }),
    });
    loadingBtn(btn, false);

    if (ok) {
      animateSuccess(document.querySelector('.auth-card'));
      window.BIOSYM.toast.success(`Welcome back, ${data.user.fullName.split(' ')[0]}!`);
      setTimeout(() => redirectTo(new URLSearchParams(location.search).get('redirect')), 500);
    } else {
      showError(errMessage(data, 'Unable to sign in.'));
      if (data.extra && data.extra.locked) {
        window.BIOSYM.toast.error('Too many attempts — your account is temporarily locked.');
      }
    }
  });

  otpForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = q('[data-send-otp-btn]');
    const id = otpForm.identifier.value.trim();
    if (!id) return showError('Please enter your email or mobile number.');
    const channel = detectChannel(id);
    const identifier = normalize(id);

    loadingBtn(btn, true);
    const { ok, data } = await api('/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ identifier, channel, purpose: 'login' }),
    });
    loadingBtn(btn, false);

    if (ok) {
      const redirect = new URLSearchParams(location.search).get('redirect') || '/account';
      location.href = `/otp-verify?identifier=${encodeURIComponent(identifier)}&channel=${channel}&purpose=login&redirect=${encodeURIComponent(redirect)}`;
    } else {
      showError(errMessage(data, 'Could not send OTP.'));
    }
  });

  // ---------------- REGISTER ----------------
  q('[data-register-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fullName = form.fullName.value.trim();
    const email = form.email.value.trim().toLowerCase();
    const mobile = form.mobile.value.trim();
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;
    const dateOfBirth = form.dateOfBirth.value || undefined;
    const gender = form.gender.value || undefined;

    let firstErr = null;
    const errs = {
      fullName: fullName.length < 3,
      email: !isEmail(email),
      mobile: !isMobile(mobile),
      confirmPassword: password !== confirmPassword,
    };
    for (const [k, bad] of Object.entries(errs)) {
      const el = form.querySelector(`[data-err="${k}"]`);
      if (el) el.classList.toggle('show', bad);
      if (bad && !firstErr) firstErr = k;
    }
    if (!password) { showError('Please create a password.'); return; }
    if (firstErr) {
      showError(firstErr === 'confirmPassword' ? 'Passwords do not match.' : 'Please check the highlighted fields.');
      return;
    }

    const btn = q('[data-register-btn]');
    loadingBtn(btn, true);
    const { ok, data } = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, mobile, password, dateOfBirth, gender }),
    });
    loadingBtn(btn, false);
    if (ok) {
      animateSuccess(document.querySelector('.auth-card'));
      window.BIOSYM.toast.success('Account created! Please sign in to continue.');
      setTimeout(() => {
        const redirect = new URLSearchParams(location.search).get('redirect');
        location.href = `/login?registered=1${redirect ? `&redirect=${encodeURIComponent(redirect)}` : ''}`;
      }, 900);
    } else {
      showError(errMessage(data, 'Could not create your account.'));
    }
  });

  // ---------------- FORGOT ----------------
  q('[data-forgot-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const id = form.identifier.value.trim();
    if (!id) return showError('Please enter your email or mobile number.');
    const channel = form.channel.value;
    const identifier = normalize(id);
    if (!isEmail(id) && !isMobile(id)) return showError('Please enter a valid email or mobile number.');

    const btn = q('[data-send-btn]');
    loadingBtn(btn, true);
    const { ok, data } = await api('/api/auth/forgot/request', {
      method: 'POST',
      body: JSON.stringify({ identifier, channel, purpose: 'forgot' }),
    });
    loadingBtn(btn, false);
    if (ok) {
      location.href = `/otp-verify?identifier=${encodeURIComponent(identifier)}&channel=${channel}&purpose=forgot`;
    } else {
      showError(errMessage(data, 'Could not send the verification code.'));
    }
  });

  // ---------------- RESET ----------------
  q('[data-reset-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const password = form.password.value;
    if (form.password.value !== form.confirmPassword.value) {
      return showError('Passwords do not match.');
    }
    const btn = q('[data-reset-btn]');
    loadingBtn(btn, true);
    const { ok, data } = await api('/api/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ token: form.token.value, password }),
    });
    loadingBtn(btn, false);
    if (ok) {
      animateSuccess(document.querySelector('.auth-card'));
      window.BIOSYM.toast.success('Password updated successfully.');
      setTimeout(() => location.href = '/login?reset=1', 900);
    } else {
      showError(errMessage(data, 'Unable to update password.'));
    }
  });
})();
