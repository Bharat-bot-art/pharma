const { env } = require('../config/env');
const { ApiError } = require('../utils/ApiError');

const BASE = 'https://apiv2.shiprocket.in/v1/external';

let cachedToken = null;
let tokenExpiresAt = 0;

function isConfigured() {
  return !!(env.shiprocket.token || (env.shiprocket.email && env.shiprocket.password));
}

async function getToken() {
  if (env.shiprocket.token) return env.shiprocket.token;
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.shiprocket.email, password: env.shiprocket.password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) {
    throw ApiError.internal('SHIPROCKET_AUTH', `Shiprocket auth failed: ${body.message || res.status}`);
  }
  cachedToken = body.token;
  tokenExpiresAt = Date.now() + 30 * 60 * 1000;
  return body.token;
}

async function request(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || body.error || `Shiprocket error ${res.status}`);
    err.status = 502;
    throw err;
  }
  return body;
}

// Creates a real adhoc shipment for a delivered order.
async function createShipment(order, items) {
  if (!isConfigured()) throw ApiError.badRequest('SHIPROCKET_NOT_CONFIGURED', 'Shiprocket is not configured.');
  const body = await request('/orders/create/adhoc', {
    method: 'POST',
    body: JSON.stringify({
      order_id: String(order.order_number),
      order_date: order.created_at,
      billing_customer_name: order.shipping_name,
      billing_last_name: '',
      billing_address: order.shipping_address,
      billing_city: order.shipping_city,
      billing_state: order.shipping_state,
      billing_pincode: String(order.shipping_pincode),
      billing_country: 'India',
      billing_email: '',
      billing_phone: String(order.shipping_mobile),
      shipping_is_billing: true,
      order_items: items.map((it) => ({
        name: it.product_name,
        qty: it.qty,
        price: it.price,
        sku: it.product_id ? `P-${it.product_id}` : it.product_name.slice(0, 20),
      })),
      payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
      sub_total: order.subtotal,
      total: order.total,
    }),
  });
  return { shipmentId: body.shipment_id || body.order_id, awb: body.awb_code || null };
}

// Real tracking lookup by AWB or shipment id.
async function track(order) {
  if (!order.tracking_number) return null;
  try {
    const body = await request(`/courier/track/awb/${encodeURIComponent(order.tracking_number)}`);
    const data = body.tracking_data || {};
    const events = (data.track_data || []).map((e) => ({
      status: 'tracked',
      description: `${e.status}${e.sub_status ? ' — ' + e.sub_status : ''}`,
      location: e.location || null,
      created_at: e.date || null,
    }));
    return { trackingNumber: order.tracking_number, currentStatus: data.status || null, events, raw: body };
  } catch (e) {
    return { trackingNumber: order.tracking_number, currentStatus: null, events: [], error: e.message };
  }
}

module.exports = { isConfigured, getToken, createShipment, track };
