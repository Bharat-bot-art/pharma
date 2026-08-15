const express = require('express');
const { db } = require('../config/db');
const { ApiError } = require('../utils/ApiError');
const { validate, isEmail, isMobile } = require('../utils/validate');
const catalog = require('../services/catalog');
const notify = require('../services/notify');

const router = express.Router();

router.get('/faqs', (req, res, next) => {
  try {
    const productId = req.query.productId ? parseInt(req.query.productId, 10) : null;
    let faqs;
    if (productId) {
      faqs = db.prepare(
        `SELECT * FROM faqs WHERE is_active = 1 AND (product_id = ? OR product_id IS NULL)
         ORDER BY (product_id = ?) DESC, sort_order, id LIMIT 30`
      ).all(productId, productId);
    } else {
      faqs = db.prepare('SELECT * FROM faqs WHERE is_active = 1 AND product_id IS NULL ORDER BY sort_order, id').all();
    }
    res.json({ ok: true, faqs });
  } catch (e) { next(e); }
});

router.get('/banners', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order, id LIMIT 6').all();
    res.json({ ok: true, banners: rows });
  } catch (e) { next(e); }
});

// Batch product lookup for recently-viewed etc.
router.get('/products/by-ids', (req, res, next) => {
  try {
    const ids = String(req.query.ids || '').split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0).slice(0, 12);
    if (!ids.length) return res.json({ ok: true, products: [] });
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(
      `${catalog.PRODUCT_SELECT} WHERE p.id IN (${ph}) ORDER BY p.rating_count DESC`
    ).all(...ids);
    res.json({ ok: true, products: rows.map(catalog.hydrate) });
  } catch (e) { next(e); }
});

router.post('/newsletter', validate({ email: 'email' }), (req, res, next) => {
  try {
    db.prepare(
      `INSERT INTO newsletter_subscribers (email, is_active) VALUES (?, 1)
       ON CONFLICT(email) DO UPDATE SET is_active = 1`
    ).run(req.body.email);
    res.status(201).json({ ok: true, message: 'Subscribed successfully!' });
  } catch (e) { next(e); }
});

router.post('/consultation', validate({
  name: 'required',
  mobile: 'mobile',
  email: ['string', { optional: true }],
  subject: ['string', { optional: true }],
  message: 'required',
}), (req, res, next) => {
  try {
    db.prepare(
      `INSERT INTO consultations (user_id, name, mobile, email, subject, message, status) VALUES (?, ?, ?, ?, ?, ?, 'new')`
    ).run(req.user ? req.user.id : null, req.body.name, req.body.mobile, req.body.email || null, req.body.subject || null, req.body.message);
    res.status(201).json({ ok: true, message: 'Request submitted. Our pharmacist will contact you shortly.' });
  } catch (e) { next(e); }
});

router.post('/contact', validate({
  name: 'required',
  email: 'email',
  subject: 'required',
  message: 'required',
}), (req, res, next) => {
  try {
    db.prepare(
      `INSERT INTO support_messages (user_id, name, email, subject, message, status) VALUES (?, ?, ?, ?, ?, 'new')`
    ).run(req.user ? req.user.id : null, req.body.name, req.body.email, req.body.subject, req.body.message);
    res.status(201).json({ ok: true, message: 'Message sent! We\'ll get back to you soon.' });
  } catch (e) { next(e); }
});

router.post('/promotions/send', (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') throw ApiError.forbidden('FORBIDDEN', 'Admin only.');
    const banner = db.prepare('SELECT * FROM banners WHERE id = ?').get(parseInt(req.body.bannerId, 10));
    if (!banner) throw ApiError.notFound('NOT_FOUND', 'Banner not found.');
    const subs = db.prepare('SELECT email FROM newsletter_subscribers WHERE is_active = 1 LIMIT 500').all();
    let sent = 0;
    for (const s of subs) {
      notify.sendPromotionalEmail(s, banner);
      sent += 1;
    }
    res.json({ ok: true, sent });
  } catch (e) { next(e); }
});

module.exports = router;
