(function () {
  const { api, errMessage, loadingBtn, animateSuccess } = window.BIOSYM;
  const init = window.OTP_INIT || {};
  const form = document.querySelector('[data-otp-form]');
  if (!form) return;

  const inputs = Array.from(form.querySelectorAll('[data-otp-input]'));
  const wrap = form.querySelector('[data-otp-wrap]');
  const countdown = form.querySelector('[data-otp-countdown]');
  const timerRow = form.querySelector('[data-otp-timer]');
  const resendBtn = form.querySelector('[data-resend]');
  const verifyBtn = form.querySelector('[data-verify-btn]');
  const attemptsEl = form.querySelector('[data-otp-attempts]');
  const errorSlot = document.querySelector('#error-slot');

  let resendAt = Date.now() + (init.resendAfter || 30) * 1000;
  let expiresAt = Date.now() + (init.expiresIn || 300) * 1000;
  let attemptsLeft = null;
  const maxAttempts = init.maxAttempts || 5;
  let interval = null;

  function code() { return inputs.map((i) => i.value).join(''); }
  function setCode(v) {
    const digits = String(v || '').replace(/\D/g, '').slice(0, 6);
    inputs.forEach((i, idx) => { i.value = digits[idx] || ''; i.classList.toggle('filled', !!digits[idx]); });
    focusAt(Math.min(digits.length, 5));
  }

  function focusAt(idx) {
    if (inputs[idx]) inputs[idx].focus();
  }

  // Input handling
  inputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      const v = input.value.replace(/\D/g, '').slice(0, 1);
      input.value = v;
      input.classList.toggle('filled', !!v);
      if (v) focusAt(idx + 1);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (input.value === '' && idx > 0) focusAt(idx - 1);
        else input.value = '';
        input.classList.remove('filled');
      }
      if (e.key === 'ArrowLeft' && idx > 0) focusAt(idx - 1);
      if (e.key === 'ArrowRight' && idx < 5) focusAt(idx + 1);
      if (e.key === 'Enter' && code().length === 6) verifyBtn.click();
    });
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      setCode(text);
    });
    input.addEventListener('focus', () => input.select());
  });

  function shake() {
    wrap.classList.remove('shake');
    void wrap.offsetWidth;
    wrap.classList.add('shake');
    setTimeout(() => wrap.classList.remove('shake'), 500);
  }

  // Countdown + resend
  function tick() {
    const now = Date.now();
    const remain = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    const m = String(Math.floor(remain / 60)).padStart(2, '0');
    const s = String(remain % 60).padStart(2, '0');
    if (countdown) countdown.textContent = `${m}:${s}`;
    if (remain <= 0) {
      clearInterval(interval);
      if (timerRow) {
        timerRow.classList.add('expired');
        countdown.textContent = 'expired';
      }
      resendBtn.disabled = false;
      window.BIOSYM.showError('This OTP has expired. Please request a new one.', errorSlot);
    }
  }
  interval = setInterval(tick, 250);
  tick();

  const resendTick = setInterval(() => {
    const wait = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    if (wait > 0) {
      resendBtn.disabled = true;
      resendBtn.textContent = `Resend OTP in 0:${String(wait).padStart(2, '0')}`;
    } else {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend OTP';
      clearInterval(resendTick);
    }
  }, 250);

  resendBtn.addEventListener('click', async () => {
    resendBtn.disabled = true;
    resendBtn.textContent = 'Sending…';
    const { ok, data } = await api('/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ identifier: init.identifier, channel: init.channel, purpose: init.purpose }),
    });
    if (ok) {
      window.BIOSYM.toast.success('A new OTP has been sent.');
      expiresAt = Date.now() + (data.expiresInSeconds || 300) * 1000;
      resendAt = Date.now() + (data.resendAfterSeconds || 30) * 1000;
      attemptsLeft = null;
      if (attemptsEl) attemptsEl.textContent = '';
      timerRow.classList.remove('expired');
      interval = setInterval(tick, 250);
      setCode('');
      focusAt(0);
      const rt = setInterval(() => {
        const wait = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
        if (wait > 0) { resendBtn.disabled = true; resendBtn.textContent = `Resend OTP in 0:${String(wait).padStart(2, '0')}`; }
        else { resendBtn.disabled = false; resendBtn.textContent = 'Resend OTP'; clearInterval(rt); }
      }, 250);
    } else {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend OTP';
      window.BIOSYM.showError(errMessage(data, 'Could not resend the OTP.'), errorSlot);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (code().length !== 6) {
      shake();
      window.BIOSYM.showError('Please enter all 6 digits of the code.', errorSlot);
      return;
    }

    loadingBtn(verifyBtn, true);
    const endpoint = init.purpose === 'forgot' ? '/api/auth/forgot/verify' : '/api/auth/otp/verify';
    const { ok, data } = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify({ identifier: init.identifier, channel: init.channel, code: code() }),
    });
    loadingBtn(verifyBtn, false);

    if (ok) {
      setCode('');
      animateSuccess(document.querySelector('.auth-card'));
      if (init.purpose === 'forgot') {
        window.BIOSYM.toast.success('Code verified! Set your new password.');
        setTimeout(() => location.href = `/reset-password?token=${data.token}`, 800);
      } else {
        window.BIOSYM.toast.success('Signed in successfully.');
        setTimeout(() => location.href = init.redirect || '/account', 800);
      }
      return;
    }

    // Error states
    shake();
    if (data.code === 'EXPIRED') {
      window.BIOSYM.showError('This OTP has expired. Please request a new one.', errorSlot);
    } else if (data.code === 'INVALID') {
      attemptsLeft = (data.extra && data.extra.remainingAttempts) != null ? data.extra.remainingAttempts : null;
      if (attemptsEl) {
        attemptsEl.textContent = attemptsLeft > 0
          ? `${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining`
          : 'Too many incorrect attempts — request a new OTP.';
        attemptsEl.style.color = attemptsLeft <= 2 ? 'var(--danger)' : 'var(--ink-400)';
      }
      window.BIOSYM.showError(data.message || 'Incorrect OTP entered. Please try again.', errorSlot);
    } else if (data.code === 'MAX_ATTEMPTS' || data.code === 'USED') {
      window.BIOSYM.showError(data.message, errorSlot);
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend OTP';
    } else if (data.code === 'NO_REQUEST') {
      window.BIOSYM.showError('No active OTP found. Please request a new one.', errorSlot);
    } else if (!ok) {
      window.BIOSYM.showError(errMessage(data, 'Verification failed. Please try again.'), errorSlot);
    }
  });
})();
