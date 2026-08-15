(function () {
  const form = document.querySelector('[data-checkout-form]');
  if (!form) return;

  const itemsEl = form.querySelector('[data-checkout-items]');
  const payOptionsEl = form.querySelector('[data-pay-options]');
  const placeBtn = form.querySelector('[data-place-order]');
  const FREE_ABOVE = 499;
  const FEE = 49;

  let cart = { items: [], subtotal: 0 };
  let methods = [];
  let selectedMethod = 'cod';
  let currentOrder = null;
  let razorpayOrder = null;

  function money(n) { return '₹' + Number(n).toFixed(2).replace(/\.00$/, ''); }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function renderItems() {
    if (cart.items.length === 0) {
      itemsEl.innerHTML = '<p class="text-muted">Your cart is empty.</p>';
      return;
    }
    itemsEl.innerHTML = cart.items.map((i) => `
      <div class="cd-row">
        <div class="cd-thumb"><img src="/img/product/${i.product.imageHue}.svg" alt=""></div>
        <div class="cd-info">
          <div class="cd-name">${esc(i.product.name)}</div>
          <div class="text-xs" style="color:var(--ink-400)">Qty ${i.qty}</div>
        </div>
        <div class="strong">${money(i.lineTotal)}</div>
      </div>`).join('');
  }

  function renderTotals() {
    const shipping = cart.subtotal >= FREE_ABOVE ? 0 : FEE;
    const total = cart.subtotal + shipping;
    const set = (sel, val) => { const el = form.querySelector(sel); if (el) el.textContent = val; };
    set('[data-summary-subtotal]', money(cart.subtotal));
    set('[data-summary-shipping]', shipping === 0 ? 'FREE' : money(shipping));
    set('[data-summary-total]', money(total));
    return total;
  }

  function renderPayMethods() {
    payOptionsEl.innerHTML = methods.map((m) => `
      <label class="pay-option ${m.id === selectedMethod ? 'selected' : ''}" data-pay="${m.id}">
        <span class="radio">
          <input type="radio" name="pay" value="${m.id}" ${m.id === selectedMethod ? 'checked' : ''} style="accent-color:var(--green-600)">
        </span>
        <span>
          <span class="t">${m.label}</span>
          <span class="s" style="display:block">${m.note}</span>
        </span>
      </label>`).join('');
    payOptionsEl.querySelectorAll('[data-pay]').forEach((opt) => {
      opt.addEventListener('click', () => {
        selectedMethod = opt.dataset.pay;
        payOptionsEl.querySelectorAll('[data-pay]').forEach((o) => o.classList.toggle('selected', o === opt));
        opt.querySelector('input').checked = true;
        placeBtn.innerHTML = `<span>Place Order${selectedMethod === 'cod' ? ' · COD' : ''}</span>`;
      });
    });
  }

  async function load() {
    const c = await window.BIOSYM.api('/api/cart');
    if (c.ok) { cart = c.data; renderItems(); renderTotals(); }
    const o = await window.BIOSYM.api('/api/checkout/options');
    if (o.ok) {
      methods = o.data.paymentMethods.filter((m) => m.enabled);
      if (methods.length === 0) methods = [{ id: 'cod', label: 'Cash on Delivery', note: '' }];
      if (!methods.some((m) => m.id === selectedMethod)) selectedMethod = methods[0].id;
      renderPayMethods();
    }
    if (cart.items.length === 0) {
      placeBtn.disabled = true;
      placeBtn.innerHTML = '<span>Your cart is empty</span>';
    }
  }

  async function placeOrder() {
    const body = {
      name: form.name.value.trim(),
      mobile: form.mobile.value.trim(),
      address: form.address.value.trim(),
      city: form.city.value.trim(),
      state: form.state.value.trim(),
      pincode: form.pincode.value.trim(),
      paymentMethod: selectedMethod,
    };

    const empty = Object.entries(body).filter(([, v]) => !v).map(([k]) => k);
    if (empty.length) { window.BIOSYM.toast.error('Please fill in all delivery details.'); return; }
    if (!/^\d{6}$/.test(body.pincode)) { window.BIOSYM.toast.error('Pincode must be 6 digits.'); return; }
    if (!/^[6-9]\d{9}$/.test(body.mobile.replace(/\D/g, ''))) { window.BIOSYM.toast.error('Enter a valid mobile number.'); return; }

    window.BIOSYM.loadingBtn(placeBtn, true);
    const { ok, data } = await window.BIOSYM.api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    window.BIOSYM.loadingBtn(placeBtn, false);

    if (!ok) {
      window.BIOSYM.toast.error(data.message || 'Could not place your order.');
      return false;
    }
    currentOrder = data.order;
    if (!data.requiresPayment) return true;
    return data.order;
  }

  async function payWithRazorpay() {
    const { ok, data } = await window.BIOSYM.api('/api/orders/razorpay/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: currentOrder.id }),
    });
    if (!ok) { window.BIOSYM.toast.error(data.message || 'Could not initiate payment.'); return false; }

    razorpayOrder = data.razorpayOrderId;
    return new Promise((resolve) => {
      const opts = {
        key: data.keyId,
        amount: Math.round(data.amount * 100),
        currency: 'INR',
        name: 'BIOSYM Pharma',
        description: `Order ${data.order.order_number}`,
        order_id: data.razorpayOrderId,
        handler: async (resp) => {
          const v = await window.BIOSYM.api('/api/orders/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpayOrderId: resp.razorpay_order_id,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
              orderId: currentOrder.id,
            }),
          });
          resolve(v.ok);
        },
        modal: { ondismiss: () => resolve(false) },
        theme: { color: '#0e7a5f' },
      };
      const rzp = new window.Razorpay(opts);
      rzp.open();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const result = await placeOrder();
    if (result === false) return;

    if (result === true) {
      // COD placed
      window.BIOSYM.cart && window.BIOSYM.cart.setCount && window.BIOSYM.cart.setCount(0);
      location.href = `/order/${currentOrder.order_number}/success`;
      return;
    }
    if (result && selectedMethod === 'razorpay') {
      const paid = await payWithRazorpay();
      if (paid) {
        window.BIOSYM.cart && window.BIOSYM.cart.setCount && window.BIOSYM.cart.setCount(0);
        window.BIOSYM.toast.success('Payment successful!');
        location.href = `/order/${currentOrder.order_number}/success`;
      } else {
        window.BIOSYM.toast.warning('Payment pending. You can retry or use Cash on Delivery.');
      }
    }
  });

  load();
})();
