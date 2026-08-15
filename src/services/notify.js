const { db } = require('../config/db');
const { env } = require('../config/env');
const email = require('./email');

const BASE = env.baseUrl;

function lookupOrderContext(order) {
  const items = order.items || db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const user = db.prepare('SELECT full_name, email FROM users WHERE id = ?').get(order.user_id);
  return { items, user };
}

function nameOf(user, order) {
  if (user && user.full_name) return user.full_name.split(' ')[0];
  return order.shipping_name ? order.shipping_name.split(' ')[0] : 'there';
}

// Non-blocking: never fail an order because email delivery failed.
async function deliver(to, subject, html) {
  if (!to) return;
  if (!env.resend.apiKey) {
    console.warn(`[EMAIL] RESEND_API_KEY not configured — skipped "${subject}" to ${to}`);
    return;
  }
  try {
    await email.sendEmail({ to, subject, html });
  } catch (e) {
    console.error('[EMAIL] send failed:', e.message);
  }
}

function sendOrderConfirmation(order) {
  const { items, user } = lookupOrderContext(order);
  const html = email.orderShell({
    title: `Thank you${nameOf(user, order) ? ', ' + nameOf(user, order) : ''}! Your order is confirmed.`,
    eyebrow: 'ORDER CONFIRMED',
    intro: `Your order <strong>${order.order_number}</strong> was placed successfully. We'll keep you posted on every step of the journey.`,
    rowsHtml: email.orderRowsHtml(items),
    totalsHtml: email.totalsHtml({
      subtotal: order.subtotal, discount: order.discount, appliedCoupon: order.applied_coupon,
      shipping: order.shipping, total: order.total,
    }),
    ctaLabel: 'View Order',
    ctaUrl: `${BASE}/orders/${order.order_number}`,
    note: order.payment_method === 'cod'
      ? 'Payment method: Cash on Delivery — please keep the exact amount ready at delivery.'
      : `Payment method: Online (Razorpay) · Status: ${order.payment_status}.`,
  });
  return deliver(user && user.email, `Order confirmed — ${order.order_number}`, html);
}

function sendPaymentConfirmation(order) {
  const { items, user } = lookupOrderContext(order);
  const html = email.orderShell({
    title: 'Payment received',
    eyebrow: 'PAYMENT CONFIRMED',
    intro: `We've received your payment of <strong>₹${Number(order.total).toFixed(2).replace(/\.00$/, '')}</strong> for order <strong>${order.order_number}</strong>.`,
    rowsHtml: email.orderRowsHtml(items),
    totalsHtml: email.totalsHtml({
      subtotal: order.subtotal, discount: order.discount, appliedCoupon: order.applied_coupon,
      shipping: order.shipping, total: order.total,
    }),
    ctaLabel: 'View Order',
    ctaUrl: `${BASE}/orders/${order.order_number}`,
  });
  return deliver(user && user.email, `Payment confirmed — ${order.order_number}`, html);
}

function sendShippingNotification(order) {
  const { items, user } = lookupOrderContext(order);
  const html = email.orderShell({
    title: 'Your order is on the way!',
    eyebrow: 'SHIPPED',
    intro: `Great news — your order <strong>${order.order_number}</strong> has been shipped${order.tracking_number ? ` and can be tracked with AWB <strong>${order.tracking_number}</strong>` : ''}.`,
    rowsHtml: email.orderRowsHtml(items),
    ctaLabel: 'Track Order',
    ctaUrl: `${BASE}/orders/${order.order_number}`,
  });
  return deliver(user && user.email, `Your order has shipped — ${order.order_number}`, html);
}

function sendDeliveryNotification(order) {
  const { items, user } = lookupOrderContext(order);
  const html = email.orderShell({
    title: 'Delivered!',
    eyebrow: 'DELIVERED',
    intro: `Your order <strong>${order.order_number}</strong> has been delivered. We hope everything is perfect — if there's anything wrong, raise a return from your account within 7 days.`,
    rowsHtml: email.orderRowsHtml(items),
    ctaLabel: 'Review Your Order',
    ctaUrl: `${BASE}/orders/${order.order_number}`,
    note: 'Loved a product? Leave a review — verified buyers help others shop with confidence.',
  });
  return deliver(user && user.email, `Order delivered — ${order.order_number}`, html);
}

function sendPromotionalEmail(subscriber, banner) {
  const html = email.orderShell({
    title: banner.subtitle ? `${banner.title} — ${banner.subtitle}` : banner.title,
    eyebrow: 'SPECIAL OFFER',
    intro: 'A special offer just for you from BIOSYM Pharma. Shop genuine medicines and wellness essentials at great prices.',
    rowsHtml: '',
    ctaLabel: banner.cta_label || 'Shop Now',
    ctaUrl: banner.cta_link || `${BASE}/shop`,
  });
  return deliver(subscriber.email, `${banner.title} — BIOSYM Pharma`, html);
}

module.exports = {
  sendOrderConfirmation,
  sendPaymentConfirmation,
  sendShippingNotification,
  sendDeliveryNotification,
  sendPromotionalEmail,
};
