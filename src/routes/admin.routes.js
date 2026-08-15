const express = require('express');
const { db } = require('../config/db');
const { ApiError } = require('../utils/ApiError');
const { requireAdmin } = require('../middleware/auth');
const { slugify } = require('../utils/helpers');
const shiprocket = require('../services/shiprocket');
const notify = require('../services/notify');
const { upload, getPublicPath, deleteFile } = require('../services/upload');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(requireAdmin);

router.get('/stats', (req, res, next) => {
  try {
    const stats = {
      users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
      products: db.prepare('SELECT COUNT(*) AS c FROM products').get().c,
      orders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
      revenue: db.prepare('SELECT COALESCE(SUM(total), 0) AS s FROM orders WHERE payment_status = \'paid\' OR status != \'cancelled\'').get().s,
      pendingOrders: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status IN ('placed','confirmed')").get().c,
      lowStock: db.prepare('SELECT COUNT(*) AS c FROM products WHERE stock <= 10').get().c,
      newConsultations: db.prepare("SELECT COUNT(*) AS c FROM consultations WHERE status = 'new'").get().c,
      newSupport: db.prepare("SELECT COUNT(*) AS c FROM support_messages WHERE status = 'new'").get().c,
      pendingReviews: db.prepare("SELECT COUNT(*) AS c FROM reviews WHERE status = 'pending'").get().c,
      subscribers: db.prepare('SELECT COUNT(*) AS c FROM newsletter_subscribers WHERE is_active = 1').get().c,
    };
    res.json({ ok: true, stats });
  } catch (e) { next(e); }
});

// ---------------- Users ----------------

router.get('/users', (req, res, next) => {
  try {
    const users = db.prepare('SELECT id, full_name, email, mobile, role, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 100').all();
    res.json({ ok: true, users });
  } catch (e) { next(e); }
});

router.patch('/users/:id/status', (req, res, next) => {
  try {
    const active = req.body.isActive ? 1 : 0;
    db.prepare('UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(active, parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------- Orders ----------------

router.get('/orders', (req, res, next) => {
  try {
    const status = req.query.status;
    const where = status && status !== 'all' ? 'WHERE status = ?' : '';
    const orders = db.prepare(
      `SELECT o.*, u.full_name AS customer_name FROM orders o LEFT JOIN users u ON u.id = o.user_id
       ${where} ORDER BY o.created_at DESC LIMIT 200`
    ).all(...(where ? [status] : []));
    res.json({ ok: true, orders });
  } catch (e) { next(e); }
});

router.get('/orders/:id', (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(parseInt(req.params.id, 10));
    if (!order) throw ApiError.notFound('ORDER_NOT_FOUND', 'Order not found.');
    order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    res.json({ ok: true, order });
  } catch (e) { next(e); }
});

router.patch('/orders/:id/status', (req, res, next) => {
  try {
    const allowed = ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
    const status = req.body.status;
    if (!allowed.includes(status)) throw ApiError.badRequest('VALIDATION', 'Invalid order status.');
    const id = parseInt(req.params.id, 10);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) throw ApiError.notFound('ORDER_NOT_FOUND', 'Order not found.');
    db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);

    if (req.body.trackingNumber) {
      db.prepare('UPDATE orders SET tracking_number = ?, carrier = COALESCE(carrier, ?) WHERE id = ?')
        .run(String(req.body.trackingNumber).trim(), 'Shiprocket', id);
    }

    const descMap = {
      confirmed: 'Order confirmed.',
      packed: 'Order packed and handed to courier partner.',
      shipped: 'Shipment picked up and in transit.',
      delivered: 'Order delivered successfully.',
      cancelled: 'Order cancelled.',
    };
    if (descMap[status]) {
      db.prepare('INSERT INTO tracking_events (order_id, status, description) VALUES (?, ?, ?)').run(id, status, descMap[status]);
    }

    const fresh = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    fresh.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    if (status === 'shipped') notify.sendShippingNotification(fresh).catch(() => {});
    if (status === 'delivered') notify.sendDeliveryNotification(fresh).catch(() => {});
    res.json({ ok: true, order: fresh });
  } catch (e) { next(e); }
});

// Create a real Shiprocket shipment for a shipped order (optional).
router.post('/orders/:id/ship', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) throw ApiError.notFound('ORDER_NOT_FOUND', 'Order not found.');
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    const result = await shiprocket.createShipment(order, items);
    db.prepare(
      'UPDATE orders SET tracking_number = ?, shiprocket_shipment_id = ?, carrier = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(result.awb || null, String(result.shipmentId || ''), 'Shiprocket', 'shipped', id);
    db.prepare(`INSERT INTO tracking_events (order_id, status, description) VALUES (?, 'shipped', 'Shipment created with courier partner.')`).run(id);
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

router.post('/orders/:id/refund', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) throw ApiError.notFound('ORDER_NOT_FOUND', 'Order not found.');
    db.prepare(
      `UPDATE orders SET refund_status = 'refunded', payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END, updated_at = datetime('now') WHERE id = ?`
    ).run(id);
    res.json({ ok: true, message: 'Refund marked as completed.' });
  } catch (e) { next(e); }
});

// ---------------- Categories (incl. subcategories) ----------------

router.get('/categories', (req, res, next) => {
  try {
    const rows = db.prepare(
      `SELECT c.*, p.name AS parent_name FROM categories c LEFT JOIN categories p ON p.id = c.parent_id ORDER BY c.parent_id IS NOT NULL, c.name`
    ).all();
    res.json({ ok: true, categories: rows });
  } catch (e) { next(e); }
});

router.post('/categories', (req, res, next) => {
  try {
    const { name, description, imageColor, icon, parentId } = req.body;
    if (!name) throw ApiError.badRequest('VALIDATION', 'Name is required.');
    let slug = slugify(name);
    let base = slug;
    let n = 1;
    while (db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug)) {
      slug = `${base}-${n++}`;
    }
    db.prepare('INSERT INTO categories (name, slug, description, image_color, icon, parent_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, slug, description || '', imageColor || '#0e7a5f', icon || 'pill', parentId ? parseInt(parentId, 10) : null);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

router.patch('/categories/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const c = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!c) throw ApiError.notFound('CATEGORY_NOT_FOUND', 'Category not found.');
    const b = req.body;
    db.prepare(
      `UPDATE categories SET name = ?, description = ?, image_color = ?, icon = ?, parent_id = ? WHERE id = ?`
    ).run(
      b.name !== undefined ? b.name : c.name,
      b.description !== undefined ? b.description : c.description,
      b.imageColor !== undefined ? b.imageColor : c.image_color,
      b.icon !== undefined ? b.icon : c.icon,
      b.parentId !== undefined ? (b.parentId ? parseInt(b.parentId, 10) : null) : c.parent_id,
      id
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/categories/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const count = db.prepare('SELECT COUNT(*) AS c FROM products WHERE category_id = ?').get(id).c;
    if (count > 0) throw ApiError.conflict('CATEGORY_IN_USE', 'This category still has products. Reassign them first.');
    db.prepare('UPDATE categories SET parent_id = NULL WHERE parent_id = ?').run(id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------- Products / inventory ----------------

router.post('/products', (req, res, next) => {
  try {
    const { categoryId, name, shortDescription, description, mrp, price, stock, isPrescription, featured, rating, ratingCount, imageHue, tags, brand } = req.body;
    if (!name || !mrp || !price) throw ApiError.badRequest('VALIDATION', 'Name, MRP and selling price are required.');
    const slug = slugify(name) + '-' + Date.now().toString(36);
    const result = db.prepare(
      `INSERT INTO products (category_id, name, slug, short_description, description, mrp, price, stock, is_prescription, featured, rating, rating_count, image_hue, tags, brand)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      categoryId || null, name, slug, shortDescription || '', description || '',
      Number(mrp), Number(price), parseInt(stock || '0', 10),
      isPrescription ? 1 : 0, featured ? 1 : 0,
      rating ? Number(rating) : 0, ratingCount ? parseInt(ratingCount, 10) : 0,
      imageHue ? parseInt(imageHue, 10) : 0, tags || '', brand || ''
    );
    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (e) { next(e); }
});

router.patch('/products/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!p) throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found.');
    const b = req.body;
    const fields = {
      category_id: b.categoryId !== undefined ? b.categoryId : p.category_id,
      name: b.name !== undefined ? b.name : p.name,
      short_description: b.shortDescription !== undefined ? b.shortDescription : p.short_description,
      description: b.description !== undefined ? b.description : p.description,
      mrp: b.mrp !== undefined ? Number(b.mrp) : p.mrp,
      price: b.price !== undefined ? Number(b.price) : p.price,
      stock: b.stock !== undefined ? parseInt(b.stock, 10) : p.stock,
      is_prescription: b.isPrescription !== undefined ? (b.isPrescription ? 1 : 0) : p.is_prescription,
      featured: b.featured !== undefined ? (b.featured ? 1 : 0) : p.featured,
      rating: b.rating !== undefined ? Number(b.rating) : p.rating,
      rating_count: b.ratingCount !== undefined ? parseInt(b.ratingCount, 10) : p.rating_count,
      image_hue: b.imageHue !== undefined ? parseInt(b.imageHue, 10) : p.image_hue,
      tags: b.tags !== undefined ? b.tags : p.tags,
      brand: b.brand !== undefined ? b.brand : p.brand,
      gallery_hues: b.galleryHues !== undefined ? b.galleryHues : p.gallery_hues,
    };
    db.prepare(
      `UPDATE products SET category_id = ?, name = ?, short_description = ?, description = ?, mrp = ?, price = ?,
       stock = ?, is_prescription = ?, featured = ?, rating = ?, rating_count = ?, image_hue = ?, tags = ?, brand = ?, gallery_hues = ?,
       updated_at = datetime('now') WHERE id = ?`
    ).run(fields.category_id, fields.name, fields.short_description, fields.description, fields.mrp, fields.price,
      fields.stock, fields.is_prescription, fields.featured, fields.rating, fields.rating_count, fields.image_hue, fields.tags, fields.brand, fields.gallery_hues, id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/products/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleteTx = db.transaction((pid) => {
      db.prepare('DELETE FROM cart_items WHERE product_id = ?').run(pid);
      db.prepare('DELETE FROM wishlist WHERE product_id = ?').run(pid);
      db.prepare('DELETE FROM reviews WHERE product_id = ?').run(pid);
      db.prepare('DELETE FROM combo_items WHERE product_id = ?').run(pid);
      db.prepare('DELETE FROM faqs WHERE product_id = ?').run(pid);
      db.prepare('DELETE FROM products WHERE id = ?').run(pid);
    });
    deleteTx(id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Quick inventory update (admin inventory management)
router.post('/products/:id/inventory', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const delta = parseInt(req.body.delta, 10);
    if (Number.isNaN(delta) || delta === 0) throw ApiError.badRequest('VALIDATION', 'Provide a non-zero stock change.');
    const p = db.prepare('SELECT stock FROM products WHERE id = ?').get(id);
    if (!p) throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found.');
    const next = Math.max(0, p.stock + delta);
    db.prepare('UPDATE products SET stock = ?, updated_at = datetime(\'now\') WHERE id = ?').run(next, id);
    res.json({ ok: true, stock: next });
  } catch (e) { next(e); }
});

// Product image upload
router.post('/products/:id/image', upload.single('image'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!p) throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found.');
    if (!req.file) throw ApiError.badRequest('VALIDATION', 'No image file provided.');
    if (p.image) deleteFile('products', p.image);
    const imageUrl = getPublicPath('products', req.file.filename);
    db.prepare('UPDATE products SET image = ?, updated_at = datetime(\'now\') WHERE id = ?').run(req.file.filename, id);
    res.json({ ok: true, image: imageUrl });
  } catch (e) { next(e); }
});

router.delete('/products/:id/image', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!p) throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found.');
    if (p.image) {
      deleteFile('products', p.image);
      db.prepare('UPDATE products SET image = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(id);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------- Coupons ----------------

router.get('/coupons', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM coupons ORDER BY id DESC').all();
    res.json({ ok: true, coupons: rows });
  } catch (e) { next(e); }
});

router.post('/coupons', (req, res, next) => {
  try {
    const b = req.body;
    if (!b.code || !b.type || b.value === undefined) throw ApiError.badRequest('VALIDATION', 'Code, type and value are required.');
    if (!['percent', 'fixed'].includes(b.type)) throw ApiError.badRequest('VALIDATION', 'Type must be percent or fixed.');
    db.prepare(
      `INSERT INTO coupons (code, type, value, min_subtotal, max_discount, starts_at, expires_at, usage_limit, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      String(b.code).trim().toUpperCase(),
      b.type, Number(b.value),
      b.minSubtotal ? Number(b.minSubtotal) : 0,
      b.maxDiscount ? Number(b.maxDiscount) : null,
      b.startsAt || null, b.expiresAt || null,
      b.usageLimit ? parseInt(b.usageLimit, 10) : null,
      b.isActive !== undefined ? (b.isActive ? 1 : 0) : 1
    );
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

router.patch('/coupons/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const c = db.prepare('SELECT * FROM coupons WHERE id = ?').get(id);
    if (!c) throw ApiError.notFound('COUPON_NOT_FOUND', 'Coupon not found.');
    const b = req.body;
    db.prepare(
      `UPDATE coupons SET code = ?, type = ?, value = ?, min_subtotal = ?, max_discount = ?, starts_at = ?, expires_at = ?, usage_limit = ?, is_active = ? WHERE id = ?`
    ).run(
      b.code !== undefined ? String(b.code).trim().toUpperCase() : c.code,
      b.type !== undefined ? b.type : c.type,
      b.value !== undefined ? Number(b.value) : c.value,
      b.minSubtotal !== undefined ? Number(b.minSubtotal) : c.min_subtotal,
      b.maxDiscount !== undefined ? (b.maxDiscount ? Number(b.maxDiscount) : null) : c.max_discount,
      b.startsAt !== undefined ? b.startsAt : c.starts_at,
      b.expiresAt !== undefined ? b.expiresAt : c.expires_at,
      b.usageLimit !== undefined ? (b.usageLimit ? parseInt(b.usageLimit, 10) : null) : c.usage_limit,
      b.isActive !== undefined ? (b.isActive ? 1 : 0) : c.is_active,
      id
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/coupons/:id', (req, res, next) => {
  try {
    db.prepare('DELETE FROM coupons WHERE id = ?').run(parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------- Reviews moderation ----------------

router.get('/reviews', (req, res, next) => {
  try {
    const status = req.query.status && req.query.status !== 'all' ? req.query.status : null;
    const where = status ? 'WHERE r.status = ?' : '';
    const rows = db.prepare(
      `SELECT r.*, u.full_name, p.name AS product_name FROM reviews r
       JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id
       ${where} ORDER BY r.created_at DESC LIMIT 200`
    ).all(...(status ? [status] : []));
    res.json({ ok: true, reviews: rows });
  } catch (e) { next(e); }
});

router.patch('/reviews/:id/status', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = req.body.status;
    if (!['approved', 'rejected'].includes(status)) throw ApiError.badRequest('VALIDATION', 'Invalid status.');
    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
    if (!review) throw ApiError.notFound('REVIEW_NOT_FOUND', 'Review not found.');
    db.prepare("UPDATE reviews SET status = ? WHERE id = ?").run(status, id);
    if (status === 'approved') {
      const agg = db.prepare(
        `SELECT COUNT(*) AS c, COALESCE(AVG(rating),0) AS avg FROM reviews WHERE product_id = ? AND status = 'approved'`
      ).get(review.product_id);
      db.prepare('UPDATE products SET rating = ?, rating_count = ? WHERE id = ?')
        .run(Number(agg.avg).toFixed(1), agg.c, review.product_id);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------- Banners ----------------

router.get('/banners', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM banners ORDER BY sort_order, id').all();
    res.json({ ok: true, banners: rows });
  } catch (e) { next(e); }
});

router.post('/banners', (req, res, next) => {
  try {
    const b = req.body;
    if (!b.title) throw ApiError.badRequest('VALIDATION', 'Title is required.');
    db.prepare(
      `INSERT INTO banners (title, subtitle, cta_label, cta_link, image_hue, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(b.title, b.subtitle || '', b.ctaLabel || '', b.ctaLink || '', b.imageHue ? parseInt(b.imageHue, 10) : 160,
      b.sortOrder ? parseInt(b.sortOrder, 10) : 0, b.isActive !== undefined ? (b.isActive ? 1 : 0) : 1);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

router.patch('/banners/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const c = db.prepare('SELECT * FROM banners WHERE id = ?').get(id);
    if (!c) throw ApiError.notFound('BANNER_NOT_FOUND', 'Banner not found.');
    const b = req.body;
    db.prepare(
      `UPDATE banners SET title = ?, subtitle = ?, cta_label = ?, cta_link = ?, image_hue = ?, sort_order = ?, is_active = ? WHERE id = ?`
    ).run(
      b.title !== undefined ? b.title : c.title,
      b.subtitle !== undefined ? b.subtitle : c.subtitle,
      b.ctaLabel !== undefined ? b.ctaLabel : c.cta_label,
      b.ctaLink !== undefined ? b.ctaLink : c.cta_link,
      b.imageHue !== undefined ? parseInt(b.imageHue, 10) : c.image_hue,
      b.sortOrder !== undefined ? parseInt(b.sortOrder, 10) : c.sort_order,
      b.isActive !== undefined ? (b.isActive ? 1 : 0) : c.is_active,
      id
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/banners/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = db.prepare('SELECT * FROM banners WHERE id = ?').get(id);
    if (b && b.image) deleteFile('banners', b.image);
    db.prepare('DELETE FROM banners WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Banner image upload
router.post('/banners/:id/image', upload.single('image'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = db.prepare('SELECT * FROM banners WHERE id = ?').get(id);
    if (!b) throw ApiError.notFound('BANNER_NOT_FOUND', 'Banner not found.');
    if (!req.file) throw ApiError.badRequest('VALIDATION', 'No image file provided.');
    if (b.image) deleteFile('banners', b.image);
    const imageUrl = getPublicPath('banners', req.file.filename);
    db.prepare('UPDATE banners SET image = ?, updated_at = datetime(\'now\') WHERE id = ?').run(req.file.filename, id);
    res.json({ ok: true, image: imageUrl });
  } catch (e) { next(e); }
});

router.delete('/banners/:id/image', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = db.prepare('SELECT * FROM banners WHERE id = ?').get(id);
    if (!b) throw ApiError.notFound('BANNER_NOT_FOUND', 'Banner not found.');
    if (b.image) {
      deleteFile('banners', b.image);
      db.prepare('UPDATE banners SET image = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(id);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------- Consultations ----------------

router.get('/consultations', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM consultations ORDER BY created_at DESC LIMIT 200').all();
    res.json({ ok: true, consultations: rows });
  } catch (e) { next(e); }
});

router.patch('/consultations/:id/status', (req, res, next) => {
  try {
    const status = String(req.body.status || 'new');
    db.prepare('UPDATE consultations SET status = ? WHERE id = ?').run(status, parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------- Support messages ----------------

router.get('/support', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM support_messages ORDER BY created_at DESC LIMIT 200').all();
    res.json({ ok: true, messages: rows });
  } catch (e) { next(e); }
});

router.patch('/support/:id/status', (req, res, next) => {
  try {
    const status = String(req.body.status || 'new');
    db.prepare('UPDATE support_messages SET status = ? WHERE id = ?').run(status, parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/newsletter/subscribers', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT id, email, is_active, created_at FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 500').all();
    res.json({ ok: true, subscribers: rows });
  } catch (e) { next(e); }
});

// ---------------- Reports ----------------

router.get('/reports', (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 90);
    const statuses = db.prepare('SELECT status, COUNT(*) AS c, SUM(total) AS revenue FROM orders GROUP BY status').all();
    const payments = db.prepare(
      'SELECT payment_method, COUNT(*) AS c, SUM(total) AS revenue FROM orders GROUP BY payment_method'
    ).all();
    const topProducts = db.prepare(
      `SELECT oi.product_name, SUM(oi.qty) AS qty, SUM(oi.price * oi.qty) AS revenue
       FROM order_items oi GROUP BY oi.product_name ORDER BY qty DESC LIMIT 10`
    ).all();
    const daily = db.prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS orders, SUM(total) AS revenue
       FROM orders WHERE created_at >= datetime('now', ?) GROUP BY date(created_at) ORDER BY day`
    ).all(`-${days} days`);
    const totals = {
      orders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
      revenue: db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'cancelled'").get().s,
      paid: db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE payment_status = 'paid'").get().s,
      codDue: db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE payment_method = 'cod' AND payment_status = 'due'").get().s,
      cancelled: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'cancelled'").get().c,
      refunds: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE refund_status = 'refunded'").get().c,
    };
    res.json({ ok: true, reports: { statuses, payments, topProducts, daily, totals, days } });
  } catch (e) { next(e); }
});

// ---------------- Settings ----------------

router.get('/settings', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json({ ok: true, settings });
  } catch (e) { next(e); }
});

router.post('/settings', (req, res, next) => {
  req.uploadType = 'banners';
  next();
}, upload.any(), (req, res, next) => {
  try {
    const b = { ...req.body };
    
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        b[file.fieldname] = getPublicPath('banners', file.filename);
      }
    }

    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    const transaction = db.transaction((settingsObj) => {
      for (const [key, value] of Object.entries(settingsObj)) {
        // Don't overwrite existing images if the new upload is empty
        if (value || value === '') {
          stmt.run(key, String(value));
        }
      }
    });
    transaction(b);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------- Coupons ----------------

router.get('/coupons', (req, res, next) => {
  try {
    const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
    res.json({ ok: true, coupons });
  } catch (e) { next(e); }
});

router.post('/coupons', audit('create', 'coupon', (req, res) => res.locals.insertedId), (req, res, next) => {
  try {
    const { code, type, value, min_subtotal, max_discount, starts_at, expires_at, usage_limit, is_active } = req.body;
    if (!code || !value) throw ApiError.badRequest('VALIDATION', 'Code and value are required.');
    
    const result = db.prepare(
      `INSERT INTO coupons (code, type, value, min_subtotal, max_discount, starts_at, expires_at, usage_limit, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      String(code).trim().toUpperCase(), type || 'percent', Number(value), Number(min_subtotal || 0), 
      max_discount ? Number(max_discount) : null, starts_at || null, expires_at || null, 
      usage_limit ? parseInt(usage_limit, 10) : null, is_active !== undefined ? (is_active ? 1 : 0) : 1
    );
    res.locals.insertedId = result.lastInsertRowid;
    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE constraint')) next(ApiError.badRequest('DUPLICATE', 'Coupon code already exists.'));
    else next(e);
  }
});

router.patch('/coupons/:id', audit('update', 'coupon'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const c = db.prepare('SELECT * FROM coupons WHERE id = ?').get(id);
    if (!c) throw ApiError.notFound('NOT_FOUND', 'Coupon not found.');
    
    const b = req.body;
    const fields = {
      code: b.code !== undefined ? String(b.code).trim().toUpperCase() : c.code,
      type: b.type !== undefined ? b.type : c.type,
      value: b.value !== undefined ? Number(b.value) : c.value,
      min_subtotal: b.min_subtotal !== undefined ? Number(b.min_subtotal) : c.min_subtotal,
      max_discount: b.max_discount !== undefined ? (b.max_discount ? Number(b.max_discount) : null) : c.max_discount,
      starts_at: b.starts_at !== undefined ? (b.starts_at || null) : c.starts_at,
      expires_at: b.expires_at !== undefined ? (b.expires_at || null) : c.expires_at,
      usage_limit: b.usage_limit !== undefined ? (b.usage_limit ? parseInt(b.usage_limit, 10) : null) : c.usage_limit,
      is_active: b.is_active !== undefined ? (b.is_active ? 1 : 0) : c.is_active
    };
    
    db.prepare(
      `UPDATE coupons SET code = ?, type = ?, value = ?, min_subtotal = ?, max_discount = ?, starts_at = ?, expires_at = ?, usage_limit = ?, is_active = ?
       WHERE id = ?`
    ).run(fields.code, fields.type, fields.value, fields.min_subtotal, fields.max_discount, fields.starts_at, fields.expires_at, fields.usage_limit, fields.is_active, id);
    
    res.json({ ok: true });
  } catch (e) { 
    if (e.message.includes('UNIQUE constraint')) next(ApiError.badRequest('DUPLICATE', 'Coupon code already exists.'));
    else next(e);
  }
});

router.delete('/coupons/:id', audit('delete', 'coupon'), (req, res, next) => {
  try {
    db.prepare('DELETE FROM coupons WHERE id = ?').run(parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------- Audit Logs ----------------

router.get('/audit_logs', (req, res, next) => {
  try {
    const logs = db.prepare(`
      SELECT a.*, u.full_name as admin_name 
      FROM audit_logs a
      LEFT JOIN users u ON a.admin_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 100
    `).all();
    res.json({ ok: true, logs });
  } catch (e) { next(e); }
});

module.exports = router;
