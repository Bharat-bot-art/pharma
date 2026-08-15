const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../config/db');
const { ApiError } = require('../utils/ApiError');
const { hashOtp, randomToken } = require('../utils/helpers');
const { passwordIssues } = require('../utils/password');
const otpService = require('./otp');
const tokenService = require('./token');
const email = require('./email');

const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
const LOCK_THRESHOLD = 5;
const LOCK_MS = 15 * 60 * 1000;
const RESET_SALT = process.env.RESET_TOKEN_SALT || 'biosym-reset-salt';

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    mobile: u.mobile,
    role: u.role,
    isEmailVerified: !!u.is_email_verified,
    isMobileVerified: !!u.is_mobile_verified,
    dateOfBirth: u.date_of_birth,
    gender: u.gender,
    createdAt: u.created_at,
  };
}

function findByIdentifier(value) {
  return db.prepare('SELECT * FROM users WHERE email = ? OR mobile = ? LIMIT 1').get(value, value);
}

function register({ fullName, email, mobile, password, dateOfBirth, gender }) {
  const issues = passwordIssues(password);
  if (issues.length > 0) {
    throw ApiError.badRequest('WEAK_PASSWORD', 'Password does not meet the requirements.', { issues });
  }
  if (findByIdentifier(email)) {
    throw ApiError.conflict('EMAIL_TAKEN', 'An account with this email already exists.');
  }
  if (findByIdentifier(mobile)) {
    throw ApiError.conflict('MOBILE_TAKEN', 'An account with this mobile number already exists.');
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      `INSERT INTO users (full_name, email, mobile, password_hash, date_of_birth, gender)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(fullName, email, mobile, hash, dateOfBirth || null, gender || null);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  return publicUser(user);
}

function checkAccountState(user) {
  if (!user) {
    throw ApiError.badRequest('ACCOUNT_NOT_FOUND', 'No account found with that email or mobile number.');
  }
  if (!user.is_active) {
    throw ApiError.forbidden('ACCOUNT_DISABLED', 'This account has been disabled. Contact support.');
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    throw ApiError.forbidden('ACCOUNT_LOCKED', `Account temporarily locked. Try again in ${mins} minute(s).`);
  }
}

function issueSession(user, res) {
  const token = tokenService.sign({ sub: String(user.id), role: user.role });
  res.cookie('biosym_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  db.prepare(
    'UPDATE users SET login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(user.id);
  return publicUser(user);
}

function loginWithPassword({ identifier, password }) {
  const user = findByIdentifier(identifier);
  checkAccountState(user);
  if (!user.password_hash) {
    throw ApiError.badRequest('NO_PASSWORD', 'This account uses OTP login. Use "Login with OTP".');
  }
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    const attempts = user.login_attempts + 1;
    let lockedUntil = null;
    if (attempts >= LOCK_THRESHOLD) {
      lockedUntil = new Date(Date.now() + LOCK_MS).toISOString();
    }
    db.prepare('UPDATE users SET login_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(attempts, lockedUntil, user.id);
    const remaining = Math.max(0, LOCK_THRESHOLD - attempts);
    throw ApiError.unauthorized('INVALID_CREDENTIALS', 'Incorrect password.', {
      remainingAttempts: remaining,
      locked: !!lockedUntil,
    });
  }
  return user;
}

async function requestLoginOtp({ identifier, channel }) {
  const user = findByIdentifier(identifier);
  if (!user) {
    throw ApiError.badRequest('ACCOUNT_NOT_FOUND', 'No account found with that email or mobile number.');
  }
  if (channel === 'email' && !user.email) {
    throw ApiError.badRequest('NO_EMAIL', 'No email is associated with this account.');
  }
  if (channel === 'sms' && !user.mobile) {
    throw ApiError.badRequest('NO_MOBILE', 'No mobile number is associated with this account.');
  }
  const target = channel === 'email' ? user.email : user.mobile;
  return otpService.requestOtp({ identifier: target, channel, purpose: 'login' });
}

async function completeLoginOtp({ identifier, channel, code }, res) {
  const user = findByIdentifier(identifier);
  if (!user) {
    throw ApiError.badRequest('ACCOUNT_NOT_FOUND', 'No account found with that email or mobile number.');
  }
  await otpService.verifyOtp({ identifier, channel, purpose: 'login', code });
  if (channel === 'sms' && !user.is_mobile_verified) {
    db.prepare('UPDATE users SET is_mobile_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  }
  if (channel === 'email' && !user.is_email_verified) {
    db.prepare('UPDATE users SET is_email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  }
  return issueSession(user, res);
}

async function requestForgotOtp({ identifier, channel }) {
  const user = findByIdentifier(identifier);
  if (!user) {
    throw ApiError.badRequest('ACCOUNT_NOT_FOUND', 'No account found with that email or mobile number.');
  }
  if (channel === 'email' && !user.email) throw ApiError.badRequest('NO_EMAIL', 'No email is associated with this account.');
  if (channel === 'sms' && !user.mobile) throw ApiError.badRequest('NO_MOBILE', 'No mobile number is associated with this account.');
  const target = channel === 'email' ? user.email : user.mobile;
  return otpService.requestOtp({ identifier: target, channel, purpose: 'forgot' });
}

async function verifyForgotOtpAndIssueResetToken({ identifier, channel, code }) {
  const user = findByIdentifier(identifier);
  if (!user) throw ApiError.badRequest('ACCOUNT_NOT_FOUND', 'No account found with that email or mobile number.');
  const target = channel === 'email' ? user.email : user.mobile;
  await otpService.verifyOtp({ identifier: target, channel, purpose: 'forgot', code });

  const token = randomToken(32);
  const tokenHash = hashOtp(token, RESET_SALT);
  db.prepare('UPDATE password_resets SET consumed = 1 WHERE user_id = ? AND consumed = 0').run(user.id);
  db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    user.id,
    tokenHash,
    new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString()
  );
  return token;
}

function resetPassword({ token, password }) {
  const issues = passwordIssues(password);
  if (issues.length > 0) {
    throw ApiError.badRequest('WEAK_PASSWORD', 'Password does not meet the requirements.', { issues });
  }
  const tokenHash = hashOtp(token, RESET_SALT);
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(tokenHash);
  if (!row || row.consumed) {
    throw ApiError.badRequest('INVALID_TOKEN', 'This reset link is invalid or has already been used.');
  }
  if (Date.now() > new Date(row.expires_at).getTime()) {
    throw ApiError.badRequest('EXPIRED_TOKEN', 'This reset link has expired. Please request a new one.');
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'UPDATE users SET password_hash = ?, login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(hash, row.user_id);
  db.prepare('UPDATE password_resets SET consumed = 1 WHERE id = ?').run(row.id);
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id));
}

function sendVerificationOtp(user, channel) {
  const target = channel === 'email' ? user.email : user.mobile;
  if (!target) throw ApiError.badRequest('NO_TARGET', 'No target address available for this channel.');
  return otpService.requestOtp({ identifier: target, channel, purpose: 'verify' });
}

function verifyVerificationOtp(user, channel, code) {
  const target = channel === 'email' ? user.email : user.mobile;
  if (!target) throw ApiError.badRequest('NO_TARGET', 'No target address available for this channel.');
  return otpService.verifyOtp({ identifier: target, channel, purpose: 'verify', code }).then(() => {
    if (channel === 'email') {
      db.prepare('UPDATE users SET is_email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    } else {
      db.prepare('UPDATE users SET is_mobile_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    }
    return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id));
  });
}

module.exports = {
  publicUser,
  register,
  findByIdentifier,
  loginWithPassword,
  requestLoginOtp,
  completeLoginOtp,
  requestForgotOtp,
  verifyForgotOtpAndIssueResetToken,
  resetPassword,
  sendVerificationOtp,
  verifyVerificationOtp,
  issueSession,
  LOCK_THRESHOLD,
  LOCK_MS,
};
