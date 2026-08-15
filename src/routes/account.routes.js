const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../config/db');
const { ApiError } = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth');
const { passwordIssues } = require('../utils/password');
const { validate } = require('../utils/validate');
const authService = require('../services/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/me', (req, res) => {
  res.json({ ok: true, user: authService.publicUser(req.user) });
});

router.patch('/me', validate({
  fullName: 'required',
  dateOfBirth: ['string', { optional: true }],
  gender: ['string', { optional: true }],
}), (req, res, next) => {
  try {
    db.prepare(
      `UPDATE users SET full_name = ?, date_of_birth = ?, gender = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(req.body.fullName, req.body.dateOfBirth || null, req.body.gender || null, req.user.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ ok: true, user: authService.publicUser(user) });
  } catch (e) { next(e); }
});

router.post('/change-password', validate({ currentPassword: 'required', newPassword: 'required' }), (req, res, next) => {
  try {
    const issues = passwordIssues(req.body.newPassword);
    if (issues.length) throw ApiError.badRequest('WEAK_PASSWORD', 'New password is not strong enough.', { issues });
    if (!req.user.password_hash) {
      throw ApiError.badRequest('NO_PASSWORD', 'This account does not use a password.');
    }
    if (!bcrypt.compareSync(req.body.currentPassword, req.user.password_hash)) {
      throw ApiError.badRequest('WRONG_PASSWORD', 'Your current password is incorrect.');
    }
    const hash = bcrypt.hashSync(req.body.newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/verify/:channel/request', (req, res, next) => {
  const { channel } = req.params;
  if (!['email', 'sms'].includes(channel)) return next(ApiError.badRequest('VALIDATION', 'Invalid channel.'));
  authService.sendVerificationOtp(req.user, channel).then((r) => res.json({ ok: true, ...r })).catch(next);
});

router.post('/verify/:channel', validate({ code: 'otp' }), (req, res, next) => {
  const { channel } = req.params;
  if (!['email', 'sms'].includes(channel)) return next(ApiError.badRequest('VALIDATION', 'Invalid channel.'));
  authService.verifyVerificationOtp(req.user, channel, req.body.code)
    .then((user) => res.json({ ok: true, user }))
    .catch(next);
});

router.get('/orders', (req, res, next) => {
  try {
    const orders = db.prepare(
      `SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC`
    ).all(req.user.id);
    res.json({ ok: true, orders });
  } catch (e) { next(e); }
});

router.get('/orders/:orderNumber', (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE order_number = ? AND user_id = ?').get(req.params.orderNumber, req.user.id);
    if (!order) throw ApiError.notFound('ORDER_NOT_FOUND', 'Order not found.');
    order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    res.json({ ok: true, order });
  } catch (e) { next(e); }
});

// ---------------- Saved addresses ----------------

router.get('/addresses', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(req.user.id);
    res.json({ ok: true, addresses: rows });
  } catch (e) { next(e); }
});

router.post('/addresses', validate({
  label: ['string', { optional: true }],
  name: 'required',
  mobile: 'mobile',
  address: 'required',
  city: 'required',
  state: 'required',
  pincode: 'required',
  isDefault: ['boolean', { optional: true }],
}), (req, res, next) => {
  try {
    const b = req.body;
    if (!/^\d{6}$/.test(b.pincode)) throw ApiError.badRequest('VALIDATION', 'Please enter a valid 6-digit pincode.');
    const setDefault = !!b.isDefault;
    if (setDefault) db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    const result = db.prepare(
      `INSERT INTO addresses (user_id, label, name, mobile, address, city, state, pincode, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, b.label || 'Home', b.name, b.mobile, b.address, b.city, b.state, b.pincode, setDefault ? 1 : 0);
    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (e) { next(e); }
});

router.patch('/addresses/:id', validate({
  label: ['string', { optional: true }],
  name: ['string', { optional: true }],
  mobile: ['mobile', { optional: true }],
  address: ['string', { optional: true }],
  city: ['string', { optional: true }],
  state: ['string', { optional: true }],
  pincode: ['string', { optional: true }],
  isDefault: ['boolean', { optional: true }],
}), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!existing) throw ApiError.notFound('ADDRESS_NOT_FOUND', 'Address not found.');
    const b = req.body;
    if (b.pincode !== undefined && !/^\d{6}$/.test(b.pincode)) {
      throw ApiError.badRequest('VALIDATION', 'Please enter a valid 6-digit pincode.');
    }
    if (b.isDefault) db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare(
      `UPDATE addresses SET label = ?, name = ?, mobile = ?, address = ?, city = ?, state = ?, pincode = ?, is_default = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      b.label !== undefined ? b.label : existing.label,
      b.name !== undefined ? b.name : existing.name,
      b.mobile !== undefined ? b.mobile : existing.mobile,
      b.address !== undefined ? b.address : existing.address,
      b.city !== undefined ? b.city : existing.city,
      b.state !== undefined ? b.state : existing.state,
      b.pincode !== undefined ? b.pincode : existing.pincode,
      b.isDefault ? 1 : existing.is_default,
      id
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/addresses/:id', (req, res, next) => {
  try {
    db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(parseInt(req.params.id, 10), req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------- My reviews ----------------

router.get('/reviews', (req, res, next) => {
  try {
    const rows = db.prepare(
      `SELECT r.*, p.name AS product_name, p.slug AS product_slug FROM reviews r
       JOIN products p ON p.id = r.product_id
       WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 100`
    ).all(req.user.id);
    res.json({ ok: true, reviews: rows });
  } catch (e) { next(e); }
});

module.exports = router;
