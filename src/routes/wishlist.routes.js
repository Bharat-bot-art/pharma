const express = require('express');
const { db } = require('../config/db');
const { ApiError } = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/wishlist', requireAuth, (req, res, next) => {
  try {
    const rows = db.prepare(
      `SELECT w.id AS wish_id, p.*, c.name AS category_name
       FROM wishlist w JOIN products p ON p.id = w.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE w.user_id = ? ORDER BY w.created_at DESC`
    ).all(req.user.id);
    res.json({ ok: true, items: rows });
  } catch (e) { next(e); }
});

router.post('/wishlist/:productId', requireAuth, (req, res, next) => {
  try {
    const productId = parseInt(req.params.productId, 10);
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if (!product) throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found.');
    const existing = db.prepare('SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?').get(req.user.id, productId);
    if (existing) {
      db.prepare('DELETE FROM wishlist WHERE id = ?').run(existing.id);
      return res.json({ ok: true, inWishlist: false });
    }
    db.prepare('INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)').run(req.user.id, productId);
    res.status(201).json({ ok: true, inWishlist: true });
  } catch (e) { next(e); }
});

router.delete('/wishlist/:productId', requireAuth, (req, res, next) => {
  try {
    db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?').run(req.user.id, parseInt(req.params.productId, 10));
    res.json({ ok: true, inWishlist: false });
  } catch (e) { next(e); }
});

module.exports = router;
