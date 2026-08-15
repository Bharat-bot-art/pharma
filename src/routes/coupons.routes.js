const express = require('express');
const { applyCoupon } = require('../services/coupons');
const { ApiError } = require('../utils/ApiError');
const { validate } = require('../utils/validate');

const router = express.Router();

router.post('/coupons/validate', validate({ code: 'required', subtotal: 'required' }), (req, res, next) => {
  try {
    const result = applyCoupon(req.body.code, Number(req.body.subtotal), { consume: false });
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e.status && e.code && e.code.startsWith('COUPON')) return next(e);
    next(ApiError.badRequest('INVALID_COUPON', e.message));
  }
});

module.exports = router;
