const { db } = require('../../config/db');
const { env } = require('../../config/env');
const { generateOtp, hashOtp, maskIdentifier } = require('../../utils/helpers');
const providers = {
  console: require('./providers/self'),
  msg91: require('./providers/msg91'),
  twilio: require('./providers/twilio'),
  self: require('./providers/self'),
};
const email = require('../email');

const SALT = providers.self.salt;
const PROVIDER = env.otpProvider in providers ? env.otpProvider : 'console';

class OtpError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

async function chooseProvider(channel) {
  if (channel === 'email') return 'self'; // self-generated + delivered via Resend
  if (PROVIDER === 'console') return 'console';
  return PROVIDER;
}

async function requestOtp({ identifier, channel, purpose }) {
  const provider = await chooseProvider(channel);

  const recentCount = db
    .prepare(
      `SELECT COUNT(*) AS c FROM otp_requests
       WHERE identifier = ? AND purpose = ? AND channel = ?
         AND created_at >= datetime('now', '-' || ? || ' minutes')`
    )
    .get(identifier, purpose, channel, String(env.otp.windowMinutes)).c;

  if (recentCount >= env.otp.maxRequestsPerWindow) {
    throw new OtpError('TOO_MANY_REQUESTS', 'Too many OTP requests. Please try again later.', {
      retryAfterMinutes: env.otp.windowMinutes,
    });
  }

  const last = db
    .prepare(
      `SELECT created_at FROM otp_requests
       WHERE identifier = ? AND purpose = ? AND channel = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(identifier, purpose, channel);

  if (last) {
    const elapsed = (Date.now() - new Date(last.created_at).getTime()) / 1000;
    if (elapsed < env.otp.resendCooldownSeconds) {
      throw new OtpError('RESEND_COOLDOWN', 'Please wait before requesting another OTP.', {
        waitSeconds: Math.ceil(env.otp.resendCooldownSeconds - elapsed),
      });
    }
  }

  const expiryMinutes = env.otp.defaultExpiryMinutes;
  const code = generateOtp(6);
  let otpHash = null;
  let otpReference = null;

  if (provider === 'msg91' || provider === 'twilio') {
    const result = await providers[provider].send({ mobile: identifier });
    if (!result.ok) {
      throw new OtpError('SEND_FAILED', result.message || 'Could not send OTP. Please try again.');
    }
    otpReference = result.reference || null;
    // MSG91/Twilio store and verify the code on their side; never store it locally.
  } else {
    otpHash = hashOtp(code, SALT);
    if (provider === 'console') {
      await providers.self.send({ code, identifier });
    }
  }

  if (channel === 'email') {
    let name = '';
    const user = db.prepare('SELECT full_name FROM users WHERE email = ?').get(identifier);
    if (user) name = user.full_name.split(' ')[0];
    await email.sendEmail({
      to: identifier,
      subject: `Your BIOSYM OTP is ${code}`,
      html: email.otpEmailHtml({ name, code, expiryMinutes }),
      text: `Your BIOSYM verification code is ${code}. It expires in ${expiryMinutes} minutes. Do not share it with anyone.`,
    }).catch((e) => {
      if (e.code === 'EMAIL_NOT_CONFIGURED') {
        console.warn('[EMAIL] Resend not configured — printing OTP instead.');
        console.log(`\n  [EMAIL DEV] OTP for ${identifier}: ${code}\n`);
      } else {
        throw new OtpError('SEND_FAILED', 'Could not send the email. Please try again.');
      }
    });
  }

  db.prepare(
    `INSERT INTO otp_requests (identifier, channel, purpose, provider, otp_hash, otp_reference, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(identifier, channel, purpose, provider, otpHash, otpReference, minutesFromNow(expiryMinutes));

  return {
    ok: true,
    masked: maskIdentifier(identifier, channel),
    channel,
    expiresInSeconds: expiryMinutes * 60,
    resendAfterSeconds: env.otp.resendCooldownSeconds,
    maxAttempts: env.otp.maxAttempts,
  };
}

async function verifyOtp({ identifier, channel, purpose, code }) {
  const row = db
    .prepare(
      `SELECT * FROM otp_requests
       WHERE identifier = ? AND purpose = ? AND channel = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(identifier, purpose, channel);

  if (!row) {
    throw new OtpError('NO_REQUEST', 'No OTP request found. Please request a new OTP.');
  }
  if (row.consumed) {
    throw new OtpError('USED', 'This OTP has already been used.');
  }
  if (Date.now() > new Date(row.expires_at).getTime()) {
    db.prepare('UPDATE otp_requests SET consumed = 1 WHERE id = ?').run(row.id);
    throw new OtpError('EXPIRED', 'This OTP has expired. Please request a new one.');
  }
  if (row.attempts >= env.otp.maxAttempts) {
    throw new OtpError('MAX_ATTEMPTS', 'Too many incorrect attempts. Please request a new OTP.');
  }

  let valid = false;
  if (row.provider === 'console' || row.provider === 'self') {
    valid = providers.self.verify({ code, storedHash: row.otp_hash });
  } else if (row.provider === 'msg91') {
    const r = await providers.msg91.verify({ mobile: identifier, code });
    valid = r.ok;
  } else if (row.provider === 'twilio') {
    const r = await providers.twilio.verify({ mobile: identifier, code });
    valid = r.ok;
  }

  if (!valid) {
    const attempts = row.attempts + 1;
    db.prepare('UPDATE otp_requests SET attempts = ? WHERE id = ?').run(attempts, row.id);
    const remaining = env.otp.maxAttempts - attempts;
    throw new OtpError('INVALID', 'Incorrect OTP entered.', {
      remainingAttempts: Math.max(0, remaining),
      maxAttempts: env.otp.maxAttempts,
    });
  }

  db.prepare('UPDATE otp_requests SET consumed = 1 WHERE id = ?').run(row.id);
  return { ok: true, rowId: row.id };
}

function invalidate(identifier, purpose, channel) {
  db.prepare(
    `UPDATE otp_requests SET consumed = 1
     WHERE identifier = ? AND purpose = ? AND channel = ? AND consumed = 0`
  ).run(identifier, purpose, channel);
}

module.exports = { requestOtp, verifyOtp, invalidate, OtpError, PROVIDER };
