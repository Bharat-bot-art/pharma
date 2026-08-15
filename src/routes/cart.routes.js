const express = require('express');
const crypto = require('crypto');
const { db } = require('../config/db');
const { ApiError } = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth');
const { discountPercent } = require('../utils/helpers');

const router = express.Router();

const CART_COOKIE = 'biosym_cart';

function getSessionId(req, res) {
  if (req._cartSid) return req._cartSid;
  let sid = req.cookies[CART_COOKIE];
  if (!sid) {
    sid = crypto.randomUUID();
    res.cookie(CART_COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
  req._cartSid = sid;
  return sid;
}

function key(req, res) {
  const sid = getSessionId(req, res);
  if (req.user) return { user_id: req.user.id, session_id: null };
  return { user_id: null, session_id: sid };
}

function cartQuery(req, res, opts = {}) {
  const k = key(req, res);
  const rows = db.prepare(
    `SELECT ci.id AS item_id, ci.qty, ci.is_saved, p.*, c.name AS category_name, c.slug AS category_slug
     FROM cart_items ci JOIN products p ON p.id = ci.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${k.user_id ? 'ci.user_id = ?' : 'ci.session_id = ?'}
       AND ci.is_saved = ${opts.saved ? '1' : '0'}`
  ).all(k.user_id || k.session_id);
  return rows.map((r) => ({
    itemId: r.item_id,
    product: {
      id: r.id, name: r.name, slug: r.slug, price: r.price, mrp: r.mrp,
      imageHue: r.image_hue, image_hue: r.image_hue, stock: r.stock,
      stockStatus: r.stock <= 0 ? 'out_of_stock' : r.stock <= 10 ? 'low_stock' : 'in_stock',
      isPrescription: !!r.is_prescription,
      discount: discountPercent(r.mrp, r.price), category: r.category_name,
      brand: r.brand || '',
    },
    qty: r.qty,
    saved: !!r.is_saved,
    lineTotal: +(r.price * r.qty).toFixed(2),
  }));
}

// Transfer guest (session) cart items into a user's cart after login.
function mergeGuestCart(userId, sessionId) {
  if (!userId || !sessionId) return;
  const guestItems = db.prepare('SELECT * FROM cart_items WHERE session_id = ? AND user_id IS NULL').all(sessionId);
  if (!guestItems.length) return;
  const stockOf = db.prepare('SELECT stock FROM products WHERE id = ?');
  for (const item of guestItems) {
    const product = stockOf.get(item.product_id);
    const stock = product && product.stock > 0 ? product.stock : item.qty;
    const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(userId, item.product_id);
    if (existing) {
      db.prepare('UPDATE cart_items SET qty = ?, is_saved = 0 WHERE id = ?').run(
        Math.min(existing.qty + item.qty, stock),
        existing.id
      );
    } else {
      db.prepare('INSERT INTO cart_items (user_id, product_id, qty, is_saved) VALUES (?, ?, ?, 0)').run(
        userId,
        item.product_id,
        Math.min(item.qty, stock)
      );
    }
  }
  db.prepare('DELETE FROM cart_items WHERE session_id = ? AND user_id IS NULL').run(sessionId);
}

router.get('/cart', (req, res, next) => {
  try {
    const items = cartQuery(req, res);
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    res.json({ ok: true, items, count: items.reduce((s, i) => s + i.qty, 0), subtotal: +subtotal.toFixed(2) });
  } catch (e) { next(e); }
});

// Save for later / move back to cart
router.post('/cart/:itemId/save', (req, res, next) => {
  try {
    const k = key(req, res);
    const col = k.user_id ? 'user_id' : 'session_id';
    const val = k.user_id || k.session_id;
    const saved = req.body.saved ? 1 : 0;
    const item = db.prepare(`SELECT * FROM cart_items WHERE ${col} = ? AND id = ?`).get(val, parseInt(req.params.itemId, 10));
    if (!item) throw ApiError.notFound('ITEM_NOT_FOUND', 'Cart item not found.');
    db.prepare('UPDATE cart_items SET is_saved = ? WHERE id = ?').run(saved, item.id);
    const items = cartQuery(req, res);
    const savedItems = cartQuery(req, res, { saved: true });
    res.json({
      ok: true,
      items,
      savedItems,
      count: items.reduce((s, i) => s + i.qty, 0),
      subtotal: +items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2),
    });
  } catch (e) { next(e); }
});

// Saved-for-later list
router.get('/cart/saved', (req, res, next) => {
  try {
    const items = cartQuery(req, res, { saved: true });
    res.json({ ok: true, items });
  } catch (e) { next(e); }
});

// Cart recommendations: products in same categories as cart items, excluding cart items
router.get('/cart/recommendations', (req, res, next) => {
  try {
    const items = cartQuery(req, res);
    const ids = items.map((i) => i.product.id);
    const catIds = [...new Set(items.map((i) => i.product.category || '').filter(Boolean))];
    if (!catIds.length) return res.json({ ok: true, items: [] });
    const placeholders = catIds.map(() => '?').join(',');
    const exclude = ids.length ? `AND p.id NOT IN (${ids.map(() => '?').join(',')})` : '';
    const rows = db.prepare(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
              (SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi WHERE oi.product_id = p.id) AS sold_count
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE c.name IN (${placeholders}) ${exclude} AND p.stock > 0
       ORDER BY p.rating_count DESC LIMIT 4`
    ).all(...catIds, ...ids);
    res.json({ ok: true, items: rows.map((r) => ({
      id: r.id, name: r.name, slug: r.slug, price: r.price, mrp: r.mrp,
      imageHue: r.image_hue, discount: discountPercent(r.mrp, r.price), category: r.category_name,
    })) });
  } catch (e) { next(e); }
});

router.post('/cart', (req, res, next) => {
  try {
    const productId = parseInt(req.body.productId, 10);
    const qty = Math.max(1, parseInt(req.body.qty || '1', 10));
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found.');
    if (product.stock < qty) throw ApiError.conflict('OUT_OF_STOCK', 'Not enough stock available.');

    const k = key(req, res);
    const col = k.user_id ? 'user_id' : 'session_id';
    const val = k.user_id || k.session_id;

    const existing = db.prepare(`SELECT * FROM cart_items WHERE ${col} = ? AND product_id = ?`).get(val, productId);
    if (existing) {
      db.prepare(`UPDATE cart_items SET qty = ?, is_saved = 0 WHERE id = ?`).run(Math.min(existing.qty + qty, product.stock), existing.id);
    } else {
      db.prepare(`INSERT INTO cart_items (user_id, session_id, product_id, qty) VALUES (?, ?, ?, ?)`)
        .run(k.user_id, k.session_id, productId, qty);
    }
    const items = cartQuery(req, res);
    res.status(201).json({
      ok: true,
      count: items.reduce((s, i) => s + i.qty, 0),
      item: items.find((i) => i.product.id === productId),
    });
  } catch (e) { next(e); }
});

router.patch('/cart/:itemId', (req, res, next) => {
  try {
    const qty = parseInt(req.body.qty, 10);
    if (!qty || qty < 1) throw ApiError.badRequest('VALIDATION', 'Quantity must be at least 1.');
    const k = key(req, res);
    const col = k.user_id ? 'user_id' : 'session_id';
    const val = k.user_id || k.session_id;
    const item = db.prepare(`SELECT * FROM cart_items WHERE ${col} = ? AND id = ?`).get(val, parseInt(req.params.itemId, 10));
    if (!item) throw ApiError.notFound('ITEM_NOT_FOUND', 'Cart item not found.');
    const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
    if (product && qty > product.stock) throw ApiError.conflict('OUT_OF_STOCK', 'Not enough stock available.');
    db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').run(qty, item.id);
    const items = cartQuery(req, res);
    res.json({ ok: true, items, count: items.reduce((s, i) => s + i.qty, 0), subtotal: +items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2) });
  } catch (e) { next(e); }
});

router.delete('/cart/:itemId', (req, res, next) => {
  try {
    const k = key(req, res);
    const col = k.user_id ? 'user_id' : 'session_id';
    const val = k.user_id || k.session_id;
    db.prepare(`DELETE FROM cart_items WHERE ${col} = ? AND id = ?`).run(val, parseInt(req.params.itemId, 10));
    const items = cartQuery(req, res);
    res.json({ ok: true, items, count: items.reduce((s, i) => s + i.qty, 0), subtotal: +items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2) });
  } catch (e) { next(e); }
});

router.delete('/cart', (req, res, next) => {
  try {
    const k = key(req, res);
    const col = k.user_id ? 'user_id' : 'session_id';
    const val = k.user_id || k.session_id;
    db.prepare(`DELETE FROM cart_items WHERE ${col} = ?`).run(val);
    res.json({ ok: true, items: [], count: 0, subtotal: 0 });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.mergeGuestCart = mergeGuestCart;
