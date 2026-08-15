(function () {
  const list = document.querySelector('[data-addresses-list]');
  if (!list) return;

  const modal = document.querySelector('[data-address-modal]');
  const form = document.querySelector('[data-address-form]');
  const errorSlot = document.querySelector('#addr-error-slot');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render(addresses) {
    if (addresses.length === 0) {
      list.innerHTML = `<div class="empty-state card">
        <div class="art"><svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.4" style="color:var(--ink-300)"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>
        <h3 style="font-size:18px">No saved addresses</h3>
        <p class="text-muted">Add a delivery address to speed up checkout.</p>
        <button class="btn btn-primary" data-open-address-modal>Add Address</button>
      </div>`;
      list.querySelector('[data-open-address-modal]').addEventListener('click', openModal);
      return;
    }
    list.innerHTML = `<div style="display:grid;gap:16px">${addresses.map((a) => `
      <div class="card" style="padding:20px;position:relative">
        ${a.is_default ? '<span class="chip chip-green" style="position:absolute;top:16px;right:16px">Default</span>' : ''}
        <div class="row" style="gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
          <span class="chip chip-blue">${esc(a.label || 'Address')}</span>
          <strong>${esc(a.name)}</strong>
          <span class="text-sm" style="color:var(--ink-400)">+91 ${esc(a.mobile)}</span>
        </div>
        <p class="text-sm" style="margin:0 0 14px;color:var(--ink-500);max-width:520px">${esc(a.address)}, ${esc(a.city)}, ${esc(a.state)} — ${esc(a.pincode)}</p>
        <div class="row" style="gap:8px">
          <button class="btn btn-outline btn-sm" data-edit-address="${a.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-del-address="${a.id}">Delete</button>
        </div>
      </div>`).join('')}</div>`;
  }

  async function load() {
    const { ok, data } = await window.BIOSYM.api('/api/account/addresses');
    if (ok) render(data.addresses || []);
  }

  function openModal(a) {
    if (!modal || !form) return;
    form.reset();
    form.elements.id.value = a ? a.id : '';
    form.elements.label.value = a ? a.label || 'Home' : 'Home';
    form.elements.name.value = a ? a.name : '';
    form.elements.mobile.value = a ? a.mobile : '';
    form.elements.address.value = a ? a.address : '';
    form.elements.city.value = a ? a.city : '';
    form.elements.state.value = a ? a.state : '';
    form.elements.pincode.value = a ? a.pincode : '';
    form.elements.isDefault.checked = a ? !!a.is_default : false;
    document.querySelector('[data-address-modal-title]').textContent = a ? 'Edit Address' : 'Add Address';
    if (errorSlot) errorSlot.innerHTML = '';
    modal.style.display = 'grid';
  }

  document.querySelector('[data-open-address-modal]')?.addEventListener('click', () => openModal(null));
  document.querySelectorAll('[data-close-address-modal]').forEach((b) =>
    b.addEventListener('click', () => { if (modal) modal.style.display = 'none'; }));

  list.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit-address]');
    const del = e.target.closest('[data-del-address]');
    if (edit) {
      const { ok, data } = await window.BIOSYM.api('/api/account/addresses');
      if (ok) openModal((data.addresses || []).find((a) => a.id === parseInt(edit.dataset.editAddress, 10)));
    }
    if (del) {
      if (!confirm('Delete this address?')) return;
      const r = await window.BIOSYM.api(`/api/account/addresses/${del.dataset.delAddress}`, { method: 'DELETE' });
      if (r.ok) { window.BIOSYM.toast.success('Address deleted.'); load(); }
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorSlot) errorSlot.innerHTML = '';
    const f = e.target;
    const id = f.elements.id.value;
    const body = {
      label: f.elements.label.value.trim(),
      name: f.elements.name.value.trim(),
      mobile: f.elements.mobile.value.trim(),
      address: f.elements.address.value.trim(),
      city: f.elements.city.value.trim(),
      state: f.elements.state.value.trim(),
      pincode: f.elements.pincode.value.trim(),
      isDefault: f.elements.isDefault.checked,
    };
    if (!/^[6-9]\d{9}$/.test(body.mobile.replace(/\D/g, ''))) {
      return window.BIOSYM.showError('Enter a valid 10-digit mobile number.', errorSlot);
    }
    if (!/^\d{6}$/.test(body.pincode)) {
      return window.BIOSYM.showError('Pincode must be 6 digits.', errorSlot);
    }
    const btn = f.querySelector('[data-save-address]');
    window.BIOSYM.loadingBtn(btn, true);
    const r = await window.BIOSYM.api(id ? `/api/account/addresses/${id}` : '/api/account/addresses', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    window.BIOSYM.loadingBtn(btn, false);
    if (r.ok) {
      window.BIOSYM.toast.success(id ? 'Address updated.' : 'Address added.');
      modal.style.display = 'none';
      load();
    } else {
      window.BIOSYM.showError(r.data.message || 'Could not save address.', errorSlot);
    }
  });

  load();
})();
