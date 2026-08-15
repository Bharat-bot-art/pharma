const express = require('express');
const { db } = require('../config/db');
const { ApiError } = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../utils/validate');

const router = express.Router();

// Public: approved reviews for a product
router.get('/reviews/:productId', (req, res, next) => {
  try {
    const pid = parseInt(req.params.productId, 10);
    const rows = db.prepare(
      `SELECT r.id, r.rating, r.title, r.comment, r.is_verified, r.created_at, u.full_name
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ? AND r.status = 'approved'
       ORDER BY r.created_at DESC LIMIT 50`
    ).all(pid);
    const agg = db.prepare(
      `SELECT COUNT(*) AS total, COALESCE(AVG(rating),0) AS average FROM reviews WHERE product_id = ? AND status = 'approved'`
    ).get(pid);
    res.json({ ok: true, reviews: rows, summary: { total: agg.total, average: +Number(agg.average).toFixed(1) } });
  } catch (e) { next(e); }
});

// Submit a review. Verified only if the user has a non-cancelled order containing the product.
router.post('/reviews', requireAuth, validate({
  productId: 'required',
  rating: 'required',
  title: ['string', { optional: true }],
  comment: ['string', { optional: true }],
}), (req, res, next) => {
  try {
    const productId = parseInt(req.body.productId, 10);
    const rating = Math.min(5, Math.max(1, parseInt(req.body.rating, 10)));
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if (!product) throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found.');

    const existing = db.prepare('SELECT id FROM reviews WHERE user_id = ? AND product_id = ?').get(req.user.id, productId);
    if (existing) throw ApiError.conflict('ALREADY_REVIEWED', 'You have already reviewed this product.');

    const purchased = db.prepare(
      `SELECT oi.id FROM order_items oi
       JOIN orders o ON o.id = oi.order_id AND o.user_id = ? AND o.status != 'cancelled'
       WHERE oi.product_id = ? LIMIT 1`
    ).get(req.user.id, productId);

    db.prepare(
      `INSERT INTO reviews (product_id, user_id, order_item_id, rating, title, comment, is_verified, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(productId, req.user.id, purchased ? purchased.id : null, rating, req.body.title || null, req.body.comment || null, purchased ? 1 : 0, 'pending');

    res.status(201).json({ ok: true, message: 'Thank you! Your review is awaiting moderation.' });
  } catch (e) { next(e); }
});

module.exports = router;
