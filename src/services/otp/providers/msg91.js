const { env } = require('../../../config/env');

const BASE = 'https://control.msg91.com/api/v5';

function ms(msg) {
  return { ok: false, code: 'SEND_FAILED', message: msg };
}

async function send({ mobile }) {
  if (!env.msg91.apiKey) {
    return ms('MSG91_API_KEY is not configured on the server.');
  }
  if (!env.msg91.templateId) {
    return ms('MSG91_TEMPLATE_ID is not configured on the server.');
  }

  const params = new URLSearchParams({
    template_id: env.msg91.templateId,
    mobile: `${env.msg91.countryCode}${mobile}`,
    authkey: env.msg91.apiKey,
    otp_expiry: String(env.msg91.otpExpiry || 5),
    sender: env.msg91.senderId,
  });

  const res = await fetch(`${BASE}/otp?${params.toString()}`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));

  if (!res.ok || (body.type !== 'success' && body.message !== 'OTP sent successfully')) {
    return ms(`MSG91 error: ${body.message || body.type || res.status}`);
  }
  return { ok: true, reference: body.request_id || null };
}

async function verify({ mobile, code }) {
  if (!env.msg91.apiKey) {
    return { ok: false, code: 'VERIFY_FAILED', message: 'MSG91_API_KEY is not configured on the server.' };
  }
  const params = new URLSearchParams({
    otp: String(code),
    mobile: `${env.msg91.countryCode}${mobile}`,
    authkey: env.msg91.apiKey,
  });

  const res = await fetch(`${BASE}/otp/verify?${params.toString()}`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));

  if (body.type === 'success' || body.message === 'OTP verified successfully') {
    return { ok: true };
  }
  return { ok: false, code: 'INVALID', message: body.message || 'OTP could not be verified.' };
}

module.exports = { name: 'msg91', send, verify };
