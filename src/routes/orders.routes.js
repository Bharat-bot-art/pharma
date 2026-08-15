const express = require('express');
const crypto = require('crypto');
const { db } = require('../config/db');
const { env } = require('../config/env');
const { ApiError } = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth');
const { round2, randomToken } = require('../utils/helpers');
const { applyCoupon } = require('../services/coupons');
const notify = require('../services/notify');
const shiprocket = require('../services/shiprocket');

const router = express.Router();

const FREE_SHIPPING_ABOVE = 499;
const SHIPPING_FEE = 49;

function getCartRows(userId) {
  return db.prepare(
    `SELECT ci.id AS item_id, ci.qty, p.*
     FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = ? AND ci.is_saved = 0`
  ).all(userId);
}

function computeTotals(items, discount = 0) {
  const subtotal = round2(items.reduce((s, i) => s + i.price * i.qty, 0));
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_ABOVE ? 0 : SHIPPING_FEE;
  const tax = 0; // GST included in listed prices
  const total = round2(subtotal + shipping + tax - discount);
  return { subtotal, shipping, tax, discount: round2(discount), total };
}

function createOrder(user, body) {
  const items = getCartRows(user.id);
  if (items.length === 0) throw ApiError.badRequest('EMPTY_CART', 'Your cart is empty.');

  for (const item of items) {
    if (item.stock < item.qty) {
      throw ApiError.conflict('OUT_OF_STOCK', `${item.name} does not have enough stock.`);
    }
    if (item.is_prescription) {
      throw ApiError.conflict('RX_REQUIRED', `${item.name} is a prescription medicine. Upload a valid prescription at checkout.`);
    }
  }

  // Coupon validation (consume only once the order is successfully created)
  let coupon = null;
  if (body.couponCode) {
    coupon = applyCoupon(body.couponCode, items.reduce((s, i) => s + i.price * i.qty, 0), { consume: false });
  }

  const totals = computeTotals(items, coupon ? coupon.discount : 0);
  const orderNumber = `BIOSYM-${Date.now().toString(36).toUpperCase()}-${randomToken(3).toUpperCase()}`;

  const insertOrder = db.prepare(
    `INSERT INTO orders (
      user_id, order_number, status, payment_method, payment_status, razorpay_order_id,
      subtotal, discount, shipping, tax, total,
      shipping_name, shipping_mobile, shipping_address, shipping_city, shipping_state, shipping_pincode, notes,
      applied_coupon, coupon_discount, address_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const result = insertOrder.run(
    user.id, orderNumber, 'placed', body.paymentMethod, body.paymentMethod === 'cod' ? 'due' : 'pending',
    null,
    totals.subtotal, totals.discount, totals.shipping, totals.tax, totals.total,
    body.name, body.mobile, body.address, body.city, body.state, body.pincode, body.notes || null,
    coupon ? coupon.code : null, coupon ? coupon.discount : 0,
    body.addressId ? parseInt(body.addressId, 10) : null
  );

  const orderId = result.lastInsertRowid;
  const insertItem = db.prepare(
    `INSERT INTO order_items (order_id, product_id, product_name, qty, price, mrp, image_hue)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const item of items) {
    insertItem.run(orderId, item.id, item.name, item.qty, item.price, item.mrp, item.image_hue);
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.qty, item.id);
  }

  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND is_saved = 0').run(user.id);

  if (coupon) applyCoupon(body.couponCode, 0, { consume: true }); // mark usage

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  db.prepare(
    `INSERT INTO tracking_events (order_id, status, description) VALUES (?, 'placed', 'Order placed successfully.')`
  ).run(orderId);
  notify.sendOrderConfirmation(order).catch(() => {});
  return order;
}

function signatureFor(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function getOwnedOrder(orderNumber, userId) {
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ? AND user_id = ?').get(orderNumber, userId);
  if (!order) throw ApiError.notFound('ORDER_NOT_FOUND', 'Order not found.');
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  return order;
}

router.get('/checkout/options', requireAuth, (req, res) => {
  res.json({
    ok: true,
    paymentMethods: [
      { id: 'cod', label: 'Cash on Delivery', enabled: true, note: 'Pay in cash when your order is delivered.' },
      ...(env.razorpay.keyId ? [{
        id: 'razorpay', label: 'Pay Online (UPI / Card / Netbanking)', enabled: true, note: 'Secure payments powered by Razorpay.',
      }] : []),
    ],
    freeShippingAbove: FREE_SHIPPING_ABOVE,
    shippingFee: SHIPPING_FEE,
  });
});

router.post('/orders', requireAuth, (req, res, next) => {
  try {
    const { name, mobile, address, city, state, pincode, paymentMethod, notes, couponCode, addressId } = req.body;
    const required = { name, mobile, address, city, state, pincode };
    for (const [k, v] of Object.entries(required)) {
      if (!v || !String(v).trim()) throw ApiError.badRequest('VALIDATION', `Please provide a valid ${k}.`);
    }
    if (!/^\d{6}$/.test(pincode)) throw ApiError.badRequest('VALIDATION', 'Please enter a valid 6-digit pincode.');
    if (paymentMethod === 'cod') {
      const order = createOrder(req.user, { ...required, notes, couponCode, addressId, paymentMethod: 'cod' });
      return res.status(201).json({ ok: true, order, requiresPayment: false });
    }
    if (paymentMethod === 'razorpay') {
      if (!env.razorpay.keyId || !env.razorpay.keySecret) {
        throw ApiError.badRequest('PAYMENT_UNAVAILABLE', 'Online payment is not available right now.');
      }
      const order = createOrder(req.user, { ...required, notes, couponCode, addressId, paymentMethod: 'razorpay' });
      res.status(201).json({ ok: true, order, requiresPayment: true });
    }
    throw ApiError.badRequest('VALIDATION', 'Unsupported payment method.');
  } catch (e) { next(e); }
});

router.post('/razorpay/order', requireAuth, async (req, res, next) => {
  try {
    const orderId = parseInt(req.body.orderId, 10);
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, req.user.id);
    if (!order) throw ApiError.notFound('ORDER_NOT_FOUND', 'Order not found.');
    if (order.payment_method !== 'razorpay' || order.payment_status !== 'pending') {
      throw ApiError.conflict('NOT_PENDING', 'This order is not awaiting payment.');
    }
    const razorRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(order.total * 100),
        currency: 'INR',
        receipt: order.order_number,
        notes: { orderId: String(order.id) },
      }),
    });
    const body = await razorRes.json().catch(() => ({}));
    if (!razorRes.ok) {
      throw ApiError.internal('PAYMENT_GATEWAY_ERROR', `Razorpay error: ${body.error?.description || razorRes.status}`);
    }
    db.prepare('UPDATE orders SET razorpay_order_id = ? WHERE id = ?').run(body.id, order.id);
    res.json({ ok: true, razorpayOrderId: body.id, amount: order.total, keyId: env.razorpay.keyId, order });
  } catch (e) { next(e); }
});

router.post('/razorpay/verify', requireAuth, (req, res, next) => {
  try {
    const { razorpayOrderId, paymentId, signature, orderId } = req.body;
    if (!env.razorpay.webhookSecret && !env.razorpay.keySecret) {
      throw ApiError.badRequest('PAYMENT_UNAVAILABLE', 'Payment verification is not configured.');
    }
    const secret = env.razorpay.webhookSecret || env.razorpay.keySecret;
    const expected = signatureFor(`${razorpayOrderId}|${paymentId}`, secret);
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      throw ApiError.forbidden('INVALID_SIGNATURE', 'Payment signature verification failed.');
    }
    db.prepare(
      `UPDATE orders SET payment_status = 'paid', status = 'confirmed', updated_at = datetime('now') WHERE id = ? AND user_id = ?`
    ).run(parseInt(orderId, 10), req.user.id);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(parseInt(orderId, 10));
    order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    db.prepare(
      `INSERT INTO tracking_events (order_id, status, description) VALUES (?, 'confirmed', 'Payment received. Order confirmed.')`
    ).run(order.id);
    notify.sendPaymentConfirmation(order).catch(() => {});
    res.json({ ok: true, order });
  } catch (e) { next(e); }
});

// ---- Customer order actions ----

router.post('/orders/:orderNumber/cancel', requireAuth, (req, res, next) => {
  try {
    const order = getOwnedOrder(req.params.orderNumber, req.user.id);
    if (!['placed', 'confirmed', 'packed'].includes(order.status)) {
      throw ApiError.conflict('CANNOT_CANCEL', 'This order can no longer be cancelled.');
    }
    const reason = String(req.body.reason || 'Other').slice(0, 300);
    db.prepare(
      `UPDATE orders SET status = 'cancelled', cancel_reason = ?, cancelled_at = datetime('now'),
       refund_status = CASE WHEN payment_status = 'paid' THEN 'processing' ELSE refund_status END,
       updated_at = datetime('now') WHERE id = ?`
    ).run(reason, order.id);
    for (const item of order.items) {
      db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.qty, item.product_id);
    }
    db.prepare(
      `INSERT INTO tracking_events (order_id, status, description) VALUES (?, 'cancelled', 'Order cancelled.')`
    ).run(order.id);
    res.json({ ok: true, message: 'Order cancelled.' });
  } catch (e) { next(e); }
});

router.post('/orders/:orderNumber/reorder', requireAuth, (req, res, next) => {
  try {
    const order = getOwnedOrder(req.params.orderNumber, req.user.id);
    let added = 0;
    for (const item of order.items) {
      if (!item.product_id) continue;
      const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
      if (!product || product.stock < 1) continue;
      const qty = Math.min(item.qty, product.stock);
      const existing = db.prepare('SELECT id, qty, is_saved FROM cart_items WHERE user_id = ? AND product_id = ?')
        .get(req.user.id, item.product_id);
      if (existing) {
        db.prepare('UPDATE cart_items SET qty = ?, is_saved = 0 WHERE id = ?')
          .run(Math.min(existing.qty + qty, product.stock), existing.id);
      } else {
        db.prepare('INSERT INTO cart_items (user_id, product_id, qty, is_saved) VALUES (?, ?, ?, 0)')
          .run(req.user.id, item.product_id, qty);
      }
      added += 1;
    }
    if (!added) throw ApiError.conflict('OUT_OF_STOCK', 'Items from this order are currently out of stock.');
    res.json({ ok: true, message: 'Items added back to your cart.' });
  } catch (e) { next(e); }
});

router.post('/orders/:orderNumber/return', requireAuth, (req, res, next) => {
  try {
    const order = getOwnedOrder(req.params.orderNumber, req.user.id);
    if (order.status !== 'delivered') {
      throw ApiError.conflict('CANNOT_RETURN', 'Only delivered orders can be returned.');
    }
    if (order.return_requested_at) {
      throw ApiError.conflict('RETURN_ALREADY', 'A return request already exists for this order.');
    }
    const reason = String(req.body.reason || '').slice(0, 500);
    if (!reason) throw ApiError.badRequest('VALIDATION', 'Please provide a reason for the return.');
    db.prepare(
      `UPDATE orders SET return_reason = ?, return_requested_at = datetime('now'),
       refund_status = CASE WHEN payment_status = 'paid' THEN 'processing' ELSE refund_status END,
       updated_at = datetime('now') WHERE id = ?`
    ).run(reason, order.id);
    db.prepare(
      `INSERT INTO tracking_events (order_id, status, description) VALUES (?, 'return_requested', 'Return requested.')`
    ).run(order.id);
    res.json({ ok: true, message: 'Return request submitted. We\'ll reach out within 24 hours.' });
  } catch (e) { next(e); }
});

router.get('/orders/:orderNumber/track', requireAuth, async (req, res, next) => {
  try {
    const order = getOwnedOrder(req.params.orderNumber, req.user.id);
    const events = db.prepare('SELECT * FROM tracking_events WHERE order_id = ? ORDER BY id').all(order.id);
    let shipment = null;
    if (order.tracking_number) {
      shipment = await shiprocket.track(order);
    }
    res.json({ ok: true, order, events, shipment, shiprocketConfigured: shiprocket.isConfigured() });
  } catch (e) { next(e); }
});

module.exports = router;
