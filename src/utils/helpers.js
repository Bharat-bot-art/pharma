const crypto = require('crypto');

function generateOtp(length = 6) {
  const digits = crypto.randomInt(0, Math.pow(10, length));
  return String(digits).padStart(length, '0');
}

function hashOtp(code, salt) {
  return crypto.createHmac('sha256', salt).update(String(code)).digest('hex');
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function normalizeMobile(value) {
  if (!value) return null;
  let m = String(value).replace(/[^\d+]/g, '');
  if (m.startsWith('+91')) m = m.slice(3);
  if (m.startsWith('91') && m.length === 12) m = m.slice(2);
  if (m.startsWith('0') && m.length === 11) m = m.slice(1);
  if (/^[6-9]\d{9}$/.test(m)) return m;
  return null;
}

function normalizeEmail(value) {
  if (!value) return null;
  return String(value).trim().toLowerCase();
}

function maskIdentifier(identifier, channel) {
  if (channel === 'email') {
    const [name, domain] = identifier.split('@');
    const visible = name.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`;
  }
  const m = String(identifier);
  if (m.length >= 10) {
    return `+91 ${m.slice(0, 5)} ${m.slice(5)}`;
  }
  return m.replace(/.(?=.{2})/g, '*');
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function discountPercent(mrp, price) {
  if (!mrp || !price || price >= mrp) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = {
  generateOtp,
  hashOtp,
  timingSafeEqual,
  normalizeMobile,
  normalizeEmail,
  maskIdentifier,
  slugify,
  round2,
  discountPercent,
  randomToken,
};
