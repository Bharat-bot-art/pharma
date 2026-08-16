(function () {
  const { api, loadingBtn } = window.BIOSYM;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function money(n) { return '₹' + Number(n).toFixed(2).replace(/\.00$/, ''); }

  // ---------- DASHBOARD ----------
  const statsEl = document.querySelector('[data-stats]');
  if (statsEl) {
    (async () => {
      const { ok, data } = await api('/api/admin/stats');
      if (!ok) return;
      const s = {
        revenue: money(data.stats.revenue),
        orders: data.stats.orders,
        products: data.stats.products,
        users: data.stats.users,
      };
      statsEl.querySelectorAll('[data-s]').forEach((el) => {
        el.textContent = s[el.dataset.s];
      });
      const pending = await api('/api/admin/orders?status=placed');
      const el = document.querySelector('[data-pending-orders]');
      if (pending.ok) {
        el.innerHTML = pending.data.orders.length === 0
          ? '<p class="text-muted" style="margin:0">No pending orders — you\'re all caught up!</p>'
          : pending.data.orders.slice(0, 5).map((o) => `
            <div class="cd-row" style="padding:10px 0;border-bottom:1px solid var(--ink-100)">
              <div class="cd-info">
                <div class="cd-name">${o.order_number}</div>
                <div class="text-xs" style="color:var(--ink-400)">${esc(o.customer_name || 'Guest')} · ${new Date(o.created_at).toLocaleDateString('en-IN')}</div>
              </div>
              <strong>${money(o.total)}</strong>
              <a class="btn btn-outline btn-sm" href="/admin/orders">Handle</a>
            </div>`).join('');
      }
    })();
  }

  // ---------- PRODUCTS ----------
  const productsBody = document.querySelector('[data-products-body]');
  const modal = document.querySelector('[data-product-modal]');
  const form = document.querySelector('[data-product-form]');
  const catSelect = document.querySelector('[data-cat-select]');
  const productImageInput = document.querySelector('[name="productImage"]');
  const productImagePreview = document.getElementById('product-image-preview');
  const productImagePreviewImg = productImagePreview?.querySelector('img');
  const removeProductImageBtn = document.getElementById('remove-product-image');

  if (productsBody) {
    (async () => {
      const cats = await api('/api/categories');
      if (cats.ok && catSelect) {
        catSelect.innerHTML = '<option value="">— Select category —</option>' +
          cats.data.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
      }
      const r = await api('/api/products?limit=100');
      if (!r.ok) return;
      productsBody.innerHTML = r.data.products.map((p) => `
        <tr>
          <td style="display:flex;align-items:center;gap:12px">
            <div class="table-img"><img src="${p.image ? (p.image.startsWith('data:') ? p.image : '/uploads/products/' + p.image) : '/img/product/' + p.imageHue + '.svg'}" alt=""></div>
            <div style="line-height:1.3">
              <a href="/product/${p.slug}" target="_blank" style="font-weight:600;color:var(--ink-700)">${esc(p.name)}</a>
              <div class="text-xs" style="color:var(--ink-400)">${p.isPrescription ? '<span style="color:var(--danger)">Rx</span> · ' : ''}${esc(p.shortDescription)}</div>
            </div>
          </td>
          <td>${esc(p.category || '—')}</td>
          <td><strong>${money(p.price)}</strong></td>
          <td class="text-muted">${money(p.mrp)}</td>
          <td><span class="chip ${p.stock <= 10 ? 'chip-warn' : 'chip-green'}">${p.stock}</span></td>
          <td>${p.rating} <span class="text-xs" style="color:var(--ink-400)">(${p.ratingCount})</span></td>
          <td>
            <div class="row" style="gap:6px">
              <button class="btn btn-outline btn-sm" data-edit="${p.id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-del="${p.id}">Delete</button>
            </div>
          </td>
        </tr>`).join('');

      productsBody.addEventListener('click', async (e) => {
        const edit = e.target.closest('[data-edit]');
        const del = e.target.closest('[data-del]');
        if (edit) {
          const pid = edit.dataset.edit;
          const detail = await api(`/api/products/${pid}`);
          if (detail.ok) openProductModal(detail.data.product);
        }
        if (del) {
          if (!confirm('Delete this product permanently?')) return;
          const res = await api(`/api/admin/products/${del.dataset.del}`, { method: 'DELETE' });
          if (res.ok) { window.BIOSYM.toast.success('Product deleted.'); del.closest('tr').remove(); }
        }
      });
    })();
  }

  function showProductImagePreview(fileOrUrl) {
    if (!productImagePreview || !productImagePreviewImg || !removeProductImageBtn) return;
    if (fileOrUrl) {
      productImagePreviewImg.src = fileOrUrl instanceof File ? URL.createObjectURL(fileOrUrl) : fileOrUrl;
      productImagePreview.style.display = 'block';
      removeProductImageBtn.style.display = 'inline-flex';
    } else {
      productImagePreview.style.display = 'none';
      removeProductImageBtn.style.display = 'none';
      productImagePreviewImg.src = '';
    }
  }

  productImageInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) showProductImagePreview(file);
  });

  removeProductImageBtn?.addEventListener('click', () => {
    if (productImageInput) productImageInput.value = '';
    showProductImagePreview(null);
  });

  function openProductModal(p) {
    if (!modal || !form) return;
    form.reset();
    form.elements.id.value = p ? p.id : '';
    form.elements.name.value = p ? p.name : '';
    form.elements.categoryId.value = p ? p.categoryId || '' : '';
    form.elements.stock.value = p ? p.stock : 0;
    form.elements.mrp.value = p ? p.mrp : '';
    form.elements.price.value = p ? p.price : '';
    form.elements.rating.value = p ? p.rating : '';
    form.elements.ratingCount.value = p ? p.ratingCount : '';
    form.elements.imageHue.value = p ? p.imageHue : 0;
    form.elements.tags.value = p ? (p.tags || []).join(', ') : '';
    form.elements.shortDescription.value = p ? p.shortDescription || '' : '';
    form.elements.description.value = p ? p.description || '' : '';
    form.elements.isPrescription.checked = p ? p.isPrescription : false;
    form.elements.featured.checked = p ? p.featured : false;
    document.querySelector('[data-product-modal-title]').textContent = p ? 'Edit Product' : 'Add Product';
    showProductImagePreview(p && p.image ? (p.image.startsWith('data:') ? p.image : '/uploads/products/' + p.image) : null);
    modal.style.display = 'grid';
  }

  document.querySelector('[data-open-product-modal]')?.addEventListener('click', () => openProductModal(null));
  document.querySelectorAll('[data-close-product-modal]').forEach((b) =>
    b.addEventListener('click', () => { if (modal) modal.style.display = 'none'; }));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const id = f.elements.id.value;
    let imageBase64 = null;
    if (productImageInput?.files[0]) {
      const file = productImageInput.files[0];
      imageBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    }

    const body = {
      name: f.elements.name.value.trim(),
      categoryId: f.elements.categoryId.value ? parseInt(f.elements.categoryId.value, 10) : null,
      stock: parseInt(f.elements.stock.value || '0', 10),
      mrp: Number(f.elements.mrp.value),
      price: Number(f.elements.price.value),
      rating: f.elements.rating.value ? Number(f.elements.rating.value) : 0,
      ratingCount: parseInt(f.elements.ratingCount.value || '0', 10),
      imageHue: parseInt(f.elements.imageHue.value || '0', 10),
      tags: f.elements.tags.value.trim(),
      shortDescription: f.elements.shortDescription.value.trim(),
      description: f.elements.description.value.trim(),
      isPrescription: f.elements.isPrescription.checked,
      featured: f.elements.featured.checked,
    };
    if (imageBase64) body.imageBase64 = imageBase64;

    const btn = f.querySelector('[data-save-product]');
    loadingBtn(btn, true);
    const res = await api(id ? `/api/admin/products/${id}` : '/api/admin/products', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    loadingBtn(btn, false);
    if (res.ok) {
      window.BIOSYM.toast.success(id ? 'Product updated.' : 'Product added.');
      setTimeout(() => location.reload(), 600);
    } else {
      window.BIOSYM.toast.error(res.data.message || 'Could not save product.');
    }
  });

  // ---------- ORDERS ----------
  const ordersBody = document.querySelector('[data-orders-body]');
  const orderFilter = document.querySelector('[data-order-filter]');
  const orderCount = document.querySelector('[data-order-count]');
  const statuses = ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

  if (ordersBody) {
    async function loadOrders(status) {
      const url = status && status !== 'all' ? `/api/admin/orders?status=${status}` : '/api/admin/orders';
      const { ok, data } = await api(url);
      if (!ok) return;
      if (orderCount) orderCount.textContent = `${data.orders.length} order${data.orders.length !== 1 ? 's' : ''}`;
      ordersBody.innerHTML = data.orders.length === 0
        ? '<tr><td colspan="7" style="text-align:center;color:var(--ink-400);padding:30px">No orders found.</td></tr>'
        : data.orders.map((o) => `
          <tr>
            <td><strong style="font-size:12.5px">${o.order_number}</strong></td>
            <td>${esc(o.customer_name || '—')}<div class="text-xs" style="color:var(--ink-400)">${o.shipping_city}</div></td>
            <td class="text-xs">${new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
            <td><strong>${money(o.total)}</strong></td>
            <td><span class="status ${o.payment_status}">${o.payment_status}</span></td>
            <td><span class="status ${o.status}">${o.status}</span></td>
            <td>
              <select class="input" data-status="${o.id}" style="padding:7px 30px 7px 10px;font-size:13px">
                ${statuses.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </td>
          </tr>`).join('');
    }

    orderFilter?.addEventListener('change', () => loadOrders(orderFilter.value));
    ordersBody.addEventListener('change', async (e) => {
      const sel = e.target.closest('[data-status]');
      if (!sel) return;
      const r = await api(`/api/admin/orders/${sel.dataset.status}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: sel.value }),
      });
      if (r.ok) {
        window.BIOSYM.toast.success(`Order marked as ${sel.value}.`);
        const chip = sel.closest('tr').querySelector('.status');
        chip.className = `status ${sel.value}`;
        chip.textContent = sel.value;
      }
    });
    loadOrders('all');
  }

  // ---------- USERS ----------
  const usersBody = document.querySelector('[data-users-body]');
  if (usersBody) {
    (async () => {
      const { ok, data } = await api('/api/admin/users');
      if (!ok) return;
      usersBody.innerHTML = data.users.map((u) => `
        <tr>
          <td><strong>${esc(u.full_name)}</strong></td>
          <td>${esc(u.email || '—')}</td>
          <td>${u.mobile ? '+91 ' + u.mobile : '—'}</td>
          <td><span class="chip ${u.role === 'admin' ? 'chip-blue' : 'chip-green'}">${u.role}</span></td>
          <td class="text-xs">${new Date(u.created_at).toLocaleDateString('en-IN')}</td>
          <td><span class="status ${u.is_active ? 'delivered' : 'cancelled'}">${u.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>
            <button class="btn ${u.is_active ? 'btn-danger' : 'btn-outline'} btn-sm" data-user-status="${u.id}" data-active="${u.is_active ? 1 : 0}">
              ${u.is_active ? 'Disable' : 'Enable'}
            </button>
          </td>
        </tr>`).join('');
      usersBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-user-status]');
        if (!btn) return;
        const next = !(parseInt(btn.dataset.active, 10) === 1);
        const r = await api(`/api/admin/users/${btn.dataset.userStatus}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: next }),
        });
        if (r.ok) location.reload();
      });
    })();
  }

  // ---------- CATEGORIES ----------
  const categoriesBody = document.querySelector('[data-categories-body]');
  const catModal = document.querySelector('[data-category-modal]');
  const catForm = document.querySelector('[data-category-form]');
  const catParent = document.querySelector('[data-cat-parent]');

  if (categoriesBody) {
    async function loadCategories() {
      const { ok, data } = await api('/api/admin/categories');
      if (!ok) return;
      if (catParent) {
        catParent.innerHTML = '<option value="">— None —</option>' +
          data.categories.filter((c) => !c.parent_id).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
      }
      categoriesBody.innerHTML = data.categories.length === 0
        ? '<tr><td colspan="5" style="text-align:center;color:var(--ink-400);padding:30px">No categories yet.</td></tr>'
        : data.categories.map((c) => `
          <tr>
            <td><div class="cd-row" style="align-items:center"><span class="cd-thumb" style="width:34px;height:34px;background:${esc(c.image_color || '#0e7a5f')}"></span><strong style="font-size:13.5px">${esc(c.name)}</strong>${c.parent_id ? ' <span class="chip chip-blue" style="padding:1px 7px;font-size:10px">Sub</span>' : ''}</div></td>
            <td class="text-xs">${esc(c.slug)}</td>
            <td class="text-xs">${esc(c.parent_name || '—')}</td>
            <td><span class="chip chip-green" style="background:${esc(c.image_color || '#0e7a5f')};color:#fff">●</span></td>
            <td>
              <div class="row" style="gap:6px">
                <button class="btn btn-outline btn-sm" data-edit-cat="${c.id}">Edit</button>
                <button class="btn btn-danger btn-sm" data-del-cat="${c.id}">Delete</button>
              </div>
            </td>
          </tr>`).join('');
    }

    function openCategoryModal(c) {
      if (!catModal || !catForm) return;
      catForm.reset();
      catForm.elements.id.value = c ? c.id : '';
      catForm.elements.name.value = c ? c.name : '';
      catForm.elements.parentId.value = c && c.parent_id ? c.parent_id : '';
      catForm.elements.icon.value = c ? (c.icon || '') : '';
      catForm.elements.imageColor.value = c ? (c.image_color || '#0e7a5f') : '#0e7a5f';
      catForm.elements.description.value = c ? (c.description || '') : '';
      document.querySelector('[data-category-modal-title]').textContent = c ? 'Edit Category' : 'Add Category';
      const slot = document.querySelector('#cat-error-slot');
      if (slot) slot.innerHTML = '';
      catModal.style.display = 'grid';
    }

    document.querySelector('[data-open-category-modal]')?.addEventListener('click', () => openCategoryModal(null));
    document.querySelectorAll('[data-close-category-modal]').forEach((b) =>
      b.addEventListener('click', () => { if (catModal) catModal.style.display = 'none'; }));

    categoriesBody.addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit-cat]');
      const del = e.target.closest('[data-del-cat]');
      if (edit) {
        const { ok, data } = await api('/api/admin/categories');
        if (ok) openCategoryModal(data.categories.find((c) => c.id === parseInt(edit.dataset.editCat, 10)));
      }
      if (del) {
        if (!confirm('Delete this category? Products must be reassigned first.')) return;
        const r = await api(`/api/admin/categories/${del.dataset.delCat}`, { method: 'DELETE' });
        if (r.ok) { window.BIOSYM.toast.success('Category deleted.'); loadCategories(); }
        else window.BIOSYM.toast.error(r.data.message || 'Could not delete category.');
      }
    });

    catForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const id = f.elements.id.value;
      const body = {
        name: f.elements.name.value.trim(),
        parentId: f.elements.parentId.value ? parseInt(f.elements.parentId.value, 10) : undefined,
        icon: f.elements.icon.value.trim() || undefined,
        imageColor: f.elements.imageColor.value || undefined,
        description: f.elements.description.value.trim() || undefined,
      };
      const btn = f.querySelector('[data-save-category]');
      loadingBtn(btn, true);
      const r = await api(id ? `/api/admin/categories/${id}` : '/api/admin/categories', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      loadingBtn(btn, false);
      if (r.ok) {
        window.BIOSYM.toast.success(id ? 'Category updated.' : 'Category added.');
        catModal.style.display = 'none';
        loadCategories();
      } else {
        window.BIOSYM.showError(r.data.message || 'Could not save category.', '#cat-error-slot');
      }
    });

    loadCategories();
  }

  // ---------- COUPONS ----------
  const couponsBody = document.querySelector('[data-coupons-body]');
  const couponModal = document.querySelector('[data-coupon-modal]');
  const couponForm = document.querySelector('[data-coupon-form]');

  if (couponsBody) {
    async function loadCoupons() {
      const { ok, data } = await api('/api/admin/coupons');
      if (!ok) return;
      couponsBody.innerHTML = data.coupons.length === 0
        ? '<tr><td colspan="8" style="text-align:center;color:var(--ink-400);padding:30px">No coupons yet.</td></tr>'
        : data.coupons.map((c) => `
          <tr>
            <td><strong style="font-size:13px">${esc(c.code)}</strong></td>
            <td><span class="chip ${c.type === 'percent' ? 'chip-blue' : 'chip-warn'}">${esc(c.type)}</span></td>
            <td><strong>${c.type === 'percent' ? c.value + '%' : money(c.value)}</strong></td>
            <td class="text-xs">${money(c.min_subtotal || 0)}</td>
            <td class="text-xs">${c.used_count || 0}${c.usage_limit ? ' / ' + c.usage_limit : ''}</td>
            <td class="text-xs">${c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-IN') : '—'}</td>
            <td><span class="status ${c.is_active ? 'delivered' : 'cancelled'}">${c.is_active ? 'Active' : 'Inactive'}</span></td>
            <td>
              <div class="row" style="gap:6px">
                <button class="btn btn-outline btn-sm" data-edit-coupon="${c.id}">Edit</button>
                <button class="btn btn-danger btn-sm" data-del-coupon="${c.id}">Delete</button>
              </div>
            </td>
          </tr>`).join('');
    }

    function openCouponModal(c) {
      if (!couponModal || !couponForm) return;
      couponForm.reset();
      couponForm.elements.id.value = c ? c.id : '';
      couponForm.elements.code.value = c ? c.code : '';
      couponForm.elements.type.value = c ? c.type : 'percent';
      couponForm.elements.value.value = c ? c.value : '';
      couponForm.elements.minSubtotal.value = c ? c.min_subtotal : '';
      couponForm.elements.maxDiscount.value = c ? (c.max_discount || '') : '';
      couponForm.elements.usageLimit.value = c ? (c.usage_limit || '') : '';
      couponForm.elements.expiresAt.value = c && c.expires_at ? c.expires_at.replace(' ', 'T').slice(0, 16) : '';
      couponForm.elements.isActive.checked = c ? !!c.is_active : true;
      document.querySelector('[data-coupon-modal-title]').textContent = c ? 'Edit Coupon' : 'Add Coupon';
      const slot = document.querySelector('#coupon-error-slot');
      if (slot) slot.innerHTML = '';
      couponModal.style.display = 'grid';
    }

    document.querySelector('[data-open-coupon-modal]')?.addEventListener('click', () => openCouponModal(null));
    document.querySelectorAll('[data-close-coupon-modal]').forEach((b) =>
      b.addEventListener('click', () => { if (couponModal) couponModal.style.display = 'none'; }));

    couponsBody.addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit-coupon]');
      const del = e.target.closest('[data-del-coupon]');
      if (edit) {
        const { ok, data } = await api('/api/admin/coupons');
        if (ok) openCouponModal(data.coupons.find((c) => c.id === parseInt(edit.dataset.editCoupon, 10)));
      }
      if (del) {
        if (!confirm('Delete this coupon?')) return;
        const r = await api(`/api/admin/coupons/${del.dataset.delCoupon}`, { method: 'DELETE' });
        if (r.ok) { window.BIOSYM.toast.success('Coupon deleted.'); loadCoupons(); }
      }
    });

    couponForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const id = f.elements.id.value;
      const body = {
        code: f.elements.code.value.trim(),
        type: f.elements.type.value,
        value: Number(f.elements.value.value),
        minSubtotal: f.elements.minSubtotal.value ? Number(f.elements.minSubtotal.value) : undefined,
        maxDiscount: f.elements.maxDiscount.value ? Number(f.elements.maxDiscount.value) : undefined,
        usageLimit: f.elements.usageLimit.value ? parseInt(f.elements.usageLimit.value, 10) : undefined,
        expiresAt: f.elements.expiresAt.value ? new Date(f.elements.expiresAt.value).toISOString().slice(0, 19).replace('T', ' ') : undefined,
        isActive: f.elements.isActive.checked,
      };
      const btn = f.querySelector('[data-save-coupon]');
      loadingBtn(btn, true);
      const r = await api(id ? `/api/admin/coupons/${id}` : '/api/admin/coupons', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      loadingBtn(btn, false);
      if (r.ok) {
        window.BIOSYM.toast.success(id ? 'Coupon updated.' : 'Coupon added.');
        couponModal.style.display = 'none';
        loadCoupons();
      } else {
        window.BIOSYM.showError(r.data.message || 'Could not save coupon.', '#coupon-error-slot');
      }
    });

    loadCoupons();
  }

  // ---------- REVIEWS ----------
  const reviewsBody = document.querySelector('[data-reviews-body]');
  const reviewFilter = document.querySelector('[data-review-filter]');
  const reviewCount = document.querySelector('[data-review-count]');

  if (reviewsBody) {
    async function loadReviews(status) {
      const url = status && status !== 'all' ? `/api/admin/reviews?status=${status}` : '/api/admin/reviews';
      const { ok, data } = await api(url);
      if (!ok) return;
      if (reviewCount) reviewCount.textContent = `${data.reviews.length} review${data.reviews.length !== 1 ? 's' : ''}`;
      reviewsBody.innerHTML = data.reviews.length === 0
        ? '<tr><td colspan="6" style="text-align:center;color:var(--ink-400);padding:30px">No reviews found.</td></tr>'
        : data.reviews.map((r) => `
          <tr>
            <td><strong style="font-size:13px">${esc(r.product_name)}</strong></td>
            <td>${esc(r.full_name)}</td>
            <td>${'★'.repeat(r.rating)}<span class="text-xs" style="color:var(--ink-400)"> ${r.rating}/5</span></td>
            <td style="max-width:280px"><div class="text-xs">${esc(r.title || '')} ${esc(r.comment || '')}</div>${r.is_verified ? ' <span class="chip chip-green" style="padding:1px 7px;font-size:10px">Verified</span>' : ''}</td>
            <td><span class="status ${r.status}">${r.status}</span></td>
            <td>
              <div class="row" style="gap:6px">
                <button class="btn btn-outline btn-sm" data-approve-review="${r.id}">Approve</button>
                <button class="btn btn-danger btn-sm" data-reject-review="${r.id}">Reject</button>
              </div>
            </td>
          </tr>`).join('');
    }

    reviewFilter?.addEventListener('change', () => loadReviews(reviewFilter.value));
    reviewsBody.addEventListener('click', async (e) => {
      const appr = e.target.closest('[data-approve-review]');
      const rej = e.target.closest('[data-reject-review]');
      if (appr || rej) {
        const id = (appr || rej).dataset.approveReview || (appr || rej).dataset.rejectReview;
        const status = appr ? 'approved' : 'rejected';
        const r = await api(`/api/admin/reviews/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (r.ok) { window.BIOSYM.toast.success(`Review ${status}.`); loadReviews(reviewFilter ? reviewFilter.value : 'all'); }
      }
    });
    loadReviews('all');
  }

  // ---------- BANNERS ----------
  const bannersBody = document.querySelector('[data-banners-body]');
  const bannerModal = document.querySelector('[data-banner-modal]');
  const bannerForm = document.querySelector('[data-banner-form]');
  const bannerImageInput = document.querySelector('[name="bannerImage"]');
  const bannerImagePreview = document.getElementById('banner-image-preview');
  const bannerImagePreviewImg = bannerImagePreview?.querySelector('img');
  const removeBannerImageBtn = document.getElementById('remove-banner-image');

  if (bannersBody) {
    async function loadBanners() {
      const { ok, data } = await api('/api/admin/banners');
      if (!ok) return;
      bannersBody.innerHTML = data.banners.length === 0
        ? '<tr><td colspan="6" style="text-align:center;color:var(--ink-400);padding:30px">No banners yet.</td></tr>'
        : data.banners.map((b) => `
          <tr>
            <td><strong style="font-size:13.5px">${esc(b.title)}</strong></td>
            <td class="text-xs">${esc(b.subtitle || '—')}</td>
            <td class="text-xs">${esc(b.cta_label || '—')} ${b.cta_link ? '(' + esc(b.cta_link) + ')' : ''}</td>
            <td class="text-xs">${b.sort_order || 0}</td>
            <td><span class="status ${b.is_active ? 'delivered' : 'cancelled'}">${b.is_active ? 'Active' : 'Inactive'}</span></td>
            <td>
              <div class="row" style="gap:6px">
                <button class="btn btn-outline btn-sm" data-edit-banner="${b.id}">Edit</button>
                <button class="btn btn-danger btn-sm" data-del-banner="${b.id}">Delete</button>
              </div>
            </td>
          </tr>`).join('');
    }

    function showBannerImagePreview(fileOrUrl) {
      if (!bannerImagePreview || !bannerImagePreviewImg || !removeBannerImageBtn) return;
      if (fileOrUrl) {
        bannerImagePreviewImg.src = fileOrUrl instanceof File ? URL.createObjectURL(fileOrUrl) : fileOrUrl;
        bannerImagePreview.style.display = 'block';
        removeBannerImageBtn.style.display = 'inline-flex';
      } else {
        bannerImagePreview.style.display = 'none';
        removeBannerImageBtn.style.display = 'none';
        bannerImagePreviewImg.src = '';
      }
    }

    bannerImageInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) showBannerImagePreview(file);
    });

    removeBannerImageBtn?.addEventListener('click', () => {
      if (bannerImageInput) bannerImageInput.value = '';
      showBannerImagePreview(null);
    });

    function openBannerModal(b) {
      if (!bannerModal || !bannerForm) return;
      bannerForm.reset();
      bannerForm.elements.id.value = b ? b.id : '';
      bannerForm.elements.title.value = b ? b.title : '';
      bannerForm.elements.subtitle.value = b ? (b.subtitle || '') : '';
      bannerForm.elements.ctaLabel.value = b ? (b.cta_label || '') : '';
      bannerForm.elements.ctaLink.value = b ? (b.cta_link || '') : '';
      bannerForm.elements.sortOrder.value = b ? b.sort_order : 0;
      bannerForm.elements.imageHue.value = b ? '#' + String((b.image_hue || 160).toString(16)).padStart(6, '0') : '#0e7a5f';
      bannerForm.elements.isActive.checked = b ? !!b.is_active : true;
      document.querySelector('[data-banner-modal-title]').textContent = b ? 'Edit Banner' : 'Add Banner';
      const slot = document.querySelector('#banner-error-slot');
      if (slot) slot.innerHTML = '';
      showBannerImagePreview(b && b.image ? b.image : null);
      bannerModal.style.display = 'grid';
    }

    document.querySelector('[data-open-banner-modal]')?.addEventListener('click', () => openBannerModal(null));
    document.querySelectorAll('[data-close-banner-modal]').forEach((b) =>
      b.addEventListener('click', () => { if (bannerModal) bannerModal.style.display = 'none'; }));

    bannersBody.addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit-banner]');
      const del = e.target.closest('[data-del-banner]');
      if (edit) {
        const { ok, data } = await api('/api/admin/banners');
        if (ok) openBannerModal(data.banners.find((b) => b.id === parseInt(edit.dataset.editBanner, 10)));
      }
      if (del) {
        if (!confirm('Delete this banner?')) return;
        const r = await api(`/api/admin/banners/${del.dataset.delBanner}`, { method: 'DELETE' });
        if (r.ok) { window.BIOSYM.toast.success('Banner deleted.'); loadBanners(); }
      }
    });

    bannerForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const id = f.elements.id.value;
      const hueVal = f.elements.imageHue.value;
      const hue = parseInt(hueVal.replace('#', ''), 16);
      const body = {
        title: f.elements.title.value.trim(),
        subtitle: f.elements.subtitle.value.trim() || undefined,
        ctaLabel: f.elements.ctaLabel.value.trim() || undefined,
        ctaLink: f.elements.ctaLink.value.trim() || undefined,
        sortOrder: parseInt(f.elements.sortOrder.value || '0', 10),
        imageHue: Number.isNaN(hue) ? 160 : hue,
        isActive: f.elements.isActive.checked,
      };
      const btn = f.querySelector('[data-save-banner]');
      loadingBtn(btn, true);
      const r = await api(id ? `/api/admin/banners/${id}` : '/api/admin/banners', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      loadingBtn(btn, false);
      if (r.ok) {
        window.BIOSYM.toast.success(id ? 'Banner updated.' : 'Banner added.');
        const newId = id || (r.data && r.data.id);
        if (bannerImageInput?.files[0] && newId) {
          const formData = new FormData();
          formData.append('image', bannerImageInput.files[0]);
          await api(`/api/admin/banners/${newId}/image`, { method: 'POST', body: formData });
        }
        bannerModal.style.display = 'none';
        loadBanners();
      } else {
        window.BIOSYM.showError(r.data.message || 'Could not save banner.', '#banner-error-slot');
      }
    });

    loadBanners();
  }

  // ---------- CONSULTATIONS ----------
  const consultList = document.querySelector('[data-consult-list]');
  const consultFilter = document.querySelector('[data-consult-filter]');
  const consultCount = document.querySelector('[data-consult-count]');
  const consultStatuses = ['new', 'contacted', 'resolved'];

  if (consultList) {
    async function loadConsultations(status) {
      const { ok, data } = await api('/api/admin/consultations');
      if (!ok) return;
      const list = status && status !== 'all' ? data.consultations.filter((c) => c.status === status) : data.consultations;
      if (consultCount) consultCount.textContent = `${list.length} request${list.length !== 1 ? 's' : ''}`;
      consultList.innerHTML = list.length === 0
        ? '<p class="text-muted" style="padding:30px 0;margin:0">No consultation requests.</p>'
        : list.map((c) => `
          <div class="card" style="padding:18px;margin-bottom:12px">
            <div class="row" style="justify-content:space-between;gap:12px;flex-wrap:wrap">
              <div>
                <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
                  <strong>${esc(c.name)}</strong>
                  <span class="text-xs" style="color:var(--ink-400)">+91 ${esc(c.mobile)} ${c.email ? '· ' + esc(c.email) : ''}</span>
                  <span class="status ${c.status}">${c.status}</span>
                </div>
                ${c.subject ? '<div class="text-sm" style="margin-top:4px;font-weight:600">' + esc(c.subject) + '</div>' : ''}
                <p class="text-sm" style="margin:6px 0 0;color:var(--ink-500)">${esc(c.message)}</p>
                <div class="text-xs" style="color:var(--ink-400);margin-top:6px">${new Date(c.created_at).toLocaleString('en-IN')}</div>
              </div>
              <div>
                <select class="input" data-consult-status="${c.id}" style="padding:7px 30px 7px 10px;font-size:13px">
                  ${consultStatuses.map((s) => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>`).join('');
    }

    consultFilter?.addEventListener('change', () => loadConsultations(consultFilter.value));
    consultList.addEventListener('change', async (e) => {
      const sel = e.target.closest('[data-consult-status]');
      if (!sel) return;
      const r = await api(`/api/admin/consultations/${sel.dataset.consultStatus}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: sel.value }),
      });
      if (r.ok) { window.BIOSYM.toast.success('Status updated.'); loadConsultations(consultFilter ? consultFilter.value : 'all'); }
    });
    loadConsultations('all');
  }

  // ---------- SUPPORT MESSAGES ----------
  const supportList = document.querySelector('[data-support-list]');
  const supportFilter = document.querySelector('[data-support-filter]');
  const supportCount = document.querySelector('[data-support-count]');
  const supportStatuses = ['new', 'replied', 'closed'];

  if (supportList) {
    async function loadSupport(status) {
      const { ok, data } = await api('/api/admin/support');
      if (!ok) return;
      const list = status && status !== 'all' ? data.messages.filter((m) => m.status === status) : data.messages;
      if (supportCount) supportCount.textContent = `${list.length} message${list.length !== 1 ? 's' : ''}`;
      supportList.innerHTML = list.length === 0
        ? '<p class="text-muted" style="padding:30px 0;margin:0">No support messages.</p>'
        : list.map((m) => `
          <div class="card" style="padding:18px;margin-bottom:12px">
            <div class="row" style="justify-content:space-between;gap:12px;flex-wrap:wrap">
              <div>
                <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
                  <strong>${esc(m.name)}</strong>
                  <span class="text-xs" style="color:var(--ink-400)">${esc(m.email)}</span>
                  <span class="status ${m.status}">${m.status}</span>
                </div>
                <div class="text-sm" style="margin-top:4px;font-weight:600">${esc(m.subject)}</div>
                <p class="text-sm" style="margin:6px 0 0;color:var(--ink-500)">${esc(m.message)}</p>
                <div class="text-xs" style="color:var(--ink-400);margin-top:6px">${new Date(m.created_at).toLocaleString('en-IN')}</div>
              </div>
              <div>
                <select class="input" data-support-status="${m.id}" style="padding:7px 30px 7px 10px;font-size:13px">
                  ${supportStatuses.map((s) => `<option ${s === m.status ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>`).join('');
    }

    supportFilter?.addEventListener('change', () => loadSupport(supportFilter.value));
    supportList.addEventListener('change', async (e) => {
      const sel = e.target.closest('[data-support-status]');
      if (!sel) return;
      const r = await api(`/api/admin/support/${sel.dataset.supportStatus}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: sel.value }),
      });
      if (r.ok) { window.BIOSYM.toast.success('Status updated.'); loadSupport(supportFilter ? supportFilter.value : 'all'); }
    });
    loadSupport('all');
  }

  // ---------- REPORTS ----------
  const reportsRoot = document.querySelector('[data-reports-root]');
  const reportRange = document.querySelector('[data-report-range]');

  if (reportsRoot) {
    async function loadReports(days) {
      const { ok, data } = await api(`/api/admin/reports?days=${days}`);
      if (!ok) return;
      const r = data.reports;
      const t = r.totals;
      reportsRoot.querySelectorAll('[data-t]').forEach((el) => {
        const v = t[el.dataset.t];
        el.textContent = el.dataset.t === 'revenue' || el.dataset.t === 'codDue' ? money(v) : v;
      });
      const dailyBody = reportsRoot.querySelector('[data-daily-body]');
      dailyBody.innerHTML = r.daily.length === 0
        ? '<tr><td colspan="3" style="text-align:center;color:var(--ink-400);padding:20px">No orders in this period.</td></tr>'
        : r.daily.map((d) => `
          <tr>
            <td class="text-xs">${new Date(d.day + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
            <td>${d.orders}</td>
            <td><strong>${money(d.revenue || 0)}</strong></td>
          </tr>`).join('');
      const topBody = reportsRoot.querySelector('[data-top-body]');
      topBody.innerHTML = r.topProducts.length === 0
        ? '<tr><td colspan="3" style="text-align:center;color:var(--ink-400);padding:20px">No product sales yet.</td></tr>'
        : r.topProducts.map((p) => `
          <tr>
            <td><strong style="font-size:13px">${esc(p.product_name)}</strong></td>
            <td>${p.qty}</td>
            <td><strong>${money(p.revenue || 0)}</strong></td>
          </tr>`).join('');
      const payBody = reportsRoot.querySelector('[data-payments-body]');
      payBody.innerHTML = r.payments.length === 0
        ? '<tr><td colspan="3" style="text-align:center;color:var(--ink-400);padding:20px">No payment data yet.</td></tr>'
        : r.payments.map((p) => `
          <tr>
            <td><span class="chip ${p.payment_method === 'cod' ? 'chip-warn' : 'chip-green'}" style="text-transform:uppercase">${esc(p.payment_method)}</span></td>
            <td>${p.c}</td>
            <td><strong>${money(p.revenue || 0)}</strong></td>
          </tr>`).join('');
    }

    reportRange?.addEventListener('change', () => loadReports(reportRange.value));
    loadReports(reportRange ? reportRange.value : 14);
  }

  // ---------- AUDIT LOGS ----------
  const auditBody = document.querySelector('[data-audit-body]');
  if (auditBody) {
    (async () => {
      const { ok, data } = await api('/api/admin/audit_logs');
      if (!ok) return;
      
      auditBody.innerHTML = data.logs.length === 0
        ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--ink-400)">No audit logs found.</td></tr>'
        : data.logs.map(l => {
          const actionClass = l.action.includes('delete') ? 'chip-danger' : (l.action.includes('create') ? 'chip-green' : 'chip-info');
          return `
            <tr>
              <td class="text-xs text-muted" style="white-space:nowrap">${new Date(l.created_at).toLocaleString('en-IN')}</td>
              <td>${esc(l.admin_name || 'System')}</td>
              <td><span class="chip ${actionClass}" style="text-transform:uppercase;font-size:10px">${esc(l.action)}</span></td>
              <td>${esc(l.entity)} ${l.entity_id ? '#' + l.entity_id : ''}</td>
              <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis">${esc(l.details || '—')}</td>
              <td class="text-muted">${esc(l.ip_address || '—')}</td>
            </tr>
          `;
        }).join('');
    })();
  }
})();
