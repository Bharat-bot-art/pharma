(function () {
  const { api, loadingBtn, showError, animateSuccess } = window.BIOSYM;
  const errorSlot = document.querySelector('#error-slot');
  const pwErrorSlot = document.querySelector('#pw-error-slot');

  // Profile
  document.querySelector('[data-profile-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('[data-save-profile]');
    loadingBtn(btn, true);
    const { ok, data } = await api('/api/account/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: form.fullName.value.trim(),
        dateOfBirth: form.dateOfBirth.value || undefined,
        gender: form.gender.value || undefined,
      }),
    });
    loadingBtn(btn, false);
    if (ok) {
      window.BIOSYM.toast.success('Profile updated.');
      setTimeout(() => location.reload(), 600);
    } else {
      showError(data.message || 'Could not update your profile.', errorSlot);
    }
  });

  // Change password
  document.querySelector('[data-password-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('[data-change-pw]');
    if (form.newPassword.value.length < 8) {
      return showError('New password must be at least 8 characters.', pwErrorSlot);
    }
    loadingBtn(btn, true);
    const { ok, data } = await api('/api/account/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: form.currentPassword.value, newPassword: form.newPassword.value }),
    });
    loadingBtn(btn, false);
    if (ok) {
      window.BIOSYM.toast.success('Password changed.');
      form.reset();
    } else {
      showError(data.message || 'Could not change password.', pwErrorSlot);
    }
  });

  // Verification flows — request OTP, then show inline OTP inputs
  document.querySelectorAll('[data-verify]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const channel = btn.dataset.verify;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      const { ok, data } = await api(`/api/account/verify/${channel}/request`, { method: 'POST' });
      btn.disabled = false;
      if (!ok) {
        btn.textContent = 'Verify';
        window.BIOSYM.toast.error(data.message || 'Could not send the verification code.');
        return;
      }
      window.BIOSYM.toast.success('Verification code sent.');

      const card = btn.closest('.cd-row');
      const existing = card.querySelector('[data-verify-box]');
      if (existing) existing.remove();

      const box = document.createElement('div');
      box.setAttribute('data-verify-box', '');
      box.style.marginTop = '12px';
      box.innerHTML = `
        <div class="otp-wrap" style="justify-content:flex-start;margin:10px 0">
          ${Array.from({ length: 6 }).map((_, i) => `<input class="otp-input" maxlength="1" inputmode="numeric" data-vin="${i}" style="width:42px;height:48px;font-size:18px">`).join('')}
        </div>
        <div class="row" style="gap:8px">
          <button class="btn btn-primary btn-sm" type="button" data-vsubmit>Verify Code</button>
          <button class="btn btn-ghost btn-sm" type="button" data-vcancel>Cancel</button>
        </div>`;
      card.appendChild(box);

      const ins = Array.from(box.querySelectorAll('[data-vin]'));
      ins.forEach((input, idx) => {
        input.addEventListener('input', () => {
          input.value = input.value.replace(/\D/g, '').slice(0, 1);
          if (input.value && ins[idx + 1]) ins[idx + 1].focus();
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !input.value && idx > 0) ins[idx - 1].focus();
        });
        input.addEventListener('paste', (e) => {
          e.preventDefault();
          const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
          ins.forEach((x, i) => { x.value = text[i] || ''; });
          (ins[Math.min(text.length, 5)] || ins[5]).focus();
        });
      });

      box.querySelector('[data-vsubmit]').addEventListener('click', async () => {
        const code = ins.map((i) => i.value).join('');
        if (code.length !== 6) return window.BIOSYM.toast.warning('Enter the full 6-digit code.');
        const vbtn = box.querySelector('[data-vsubmit]');
        loadingBtn(vbtn, true);
        const r = await api(`/api/account/verify/${channel}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        loadingBtn(vbtn, false);
        if (r.ok) {
          window.BIOSYM.toast.success('Verified successfully!');
          setTimeout(() => location.reload(), 800);
        } else {
          window.BIOSYM.toast.error(r.data.message || 'Verification failed.');
        }
      });
      box.querySelector('[data-vcancel]').addEventListener('click', () => box.remove());

      ins[0] && ins[0].focus();
    });
  });
})();
