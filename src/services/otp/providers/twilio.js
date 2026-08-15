const { env } = require('../../../config/env');

const BASE = 'https://verify.twilio.com/v2/Services';

function auth() {
  return 'Basic ' + Buffer.from(`${env.twilio.accountSid}:${env.twilio.authToken}`).toString('base64');
}

async function send({ mobile }) {
  if (!env.twilio.accountSid || !env.twilio.authToken || !env.twilio.verifyServiceSid) {
    return { ok: false, code: 'SEND_FAILED', message: 'Twilio credentials are not configured on the server.' };
  }
  const to = `+${env.msg91.countryCode || '91'}${mobile}`;
  const res = await fetch(`${BASE}/${env.twilio.verifyServiceSid}/Verifications`, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, Channel: 'sms' }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, code: 'SEND_FAILED', message: `Twilio error: ${body.message || res.status}` };
  }
  return { ok: true, reference: body.sid || null };
}

async function verify({ mobile, code }) {
  const to = `+${env.msg91.countryCode || '91'}${mobile}`;
  const res = await fetch(`${BASE}/${env.twilio.verifyServiceSid}/VerificationCheck`, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, Code: String(code) }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (body.status === 'approved' || body.valid) {
    return { ok: true };
  }
  return { ok: false, code: 'INVALID', message: body.message || 'OTP could not be verified.' };
}

module.exports = { name: 'twilio', send, verify };
