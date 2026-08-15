const { db } = require('../config/db');
const { ApiError } = require('../utils/ApiError');
const { round2 } = require('../utils/helpers');

function nowIso() {
  return new Date().toISOString();
}

// Validates a coupon and returns { coupon, code, discount, message } or throws.
function applyCoupon(code, subtotal, opts = {}) {
  if (!code) throw ApiError.badRequest('COUPON_REQUIRED', 'Enter a coupon code.');
  const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE').get(String(code).trim());
  if (!coupon) throw ApiError.badRequest('INVALID_COUPON', 'This coupon code is invalid.');
  if (!coupon.is_active) throw ApiError.badRequest('INVALID_COUPON', 'This coupon code is no longer active.');
  if (coupon.starts_at && nowIso() < new Date(coupon.starts_at).toISOString()) {
    throw ApiError.badRequest('INVALID_COUPON', 'This coupon is not yet active.');
  }
  if (coupon.expires_at && nowIso() > new Date(coupon.expires_at).toISOString()) {
    throw ApiError.badRequest('INVALID_COUPON', 'This coupon code has expired.');
  }
  if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
    throw ApiError.badRequest('INVALID_COUPON', 'This coupon has reached its usage limit.');
  }
  const subtotalNum = Number(subtotal) || 0;
  if (subtotalNum < Number(coupon.min_subtotal)) {
    throw ApiError.badRequest('MIN_NOT_MET', `Add ${'₹' + Number(coupon.min_subtotal - subtotalNum).toFixed(2)} more to use this coupon.`);
  }

  let discount = 0;
  if (coupon.type === 'percent') {
    discount = round2(subtotalNum * (Number(coupon.value) / 100));
    if (coupon.max_discount) discount = Math.min(discount, Number(coupon.max_discount));
  } else {
    discount = Math.min(Number(coupon.value), subtotalNum);
  }
  discount = round2(discount);

  if (opts.consume) {
    db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(coupon.id);
  }

  return {
    coupon,
    code: coupon.code.toUpperCase(),
    type: coupon.type,
    discount,
    label: coupon.type === 'percent'
      ? `${coupon.value}% OFF${coupon.max_discount ? ` (up to ₹${coupon.max_discount})` : ''}`
      : `₹${coupon.value} OFF`,
  };
}

module.exports = { applyCoupon };
