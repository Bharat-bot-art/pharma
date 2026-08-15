const express = require('express');
const rateLimit = require('express-rate-limit');
const { validate } = require('../utils/validate');
const { ApiError } = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth');
const auth = require('../services/auth');
const { mergeGuestCart } = require('./cart.routes');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Please wait a few minutes.' },
});

const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'TOO_MANY_REQUESTS', message: 'Too many OTP requests. Please wait a few minutes.' },
});

router.post('/register', validate({
  fullName: 'required',
  email: 'email',
  mobile: 'mobile',
  password: 'required',
  dateOfBirth: ['string', { optional: true }],
  gender: ['string', { optional: true }],
}), (req, res, next) => {
  try {
    const user = auth.register(req.body);
    res.status(201).json({ ok: true, user });
  } catch (e) { next(e); }
});

router.post('/login', loginLimiter, validate({
  identifier: 'required',
  password: 'required',
}), (req, res, next) => {
  try {
    const user = auth.loginWithPassword({ identifier: req.body.identifier, password: req.body.password });
    mergeGuestCart(user.id, req.cookies.biosym_cart);
    const session = auth.issueSession(user, res);
    res.json({ ok: true, user: session });
  } catch (e) { next(e); }
});

router.post('/otp/request', otpRequestLimiter, validate({
  identifier: ['required'],
  channel: 'required',
  purpose: 'required',
}), async (req, res, next) => {
  try {
    const { identifier, channel, purpose } = req.body;
    if (!['sms', 'email'].includes(channel)) throw ApiError.badRequest('VALIDATION', 'Channel must be sms or email.');
    if (!['login', 'forgot', 'verify'].includes(purpose)) {
      throw ApiError.badRequest('VALIDATION', 'Invalid purpose.');
    }

    let result;
    if (purpose === 'login') {
      result = await auth.requestLoginOtp({ identifier, channel });
    } else if (purpose === 'forgot') {
      result = await auth.requestForgotOtp({ identifier, channel });
    } else {
      if (!req.user) throw ApiError.unauthorized('AUTH_REQUIRED', 'Please sign in to continue.');
      result = await auth.sendVerificationOtp(req.user, channel);
    }
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

router.post('/otp/verify', otpRequestLimiter, validate({
  identifier: 'required',
  channel: 'required',
  code: 'otp',
}), async (req, res, next) => {
  try {
    const { identifier, channel, code } = req.body;
    const user = await auth.completeLoginOtp({ identifier, channel, code }, res);
    mergeGuestCart(user.id, req.cookies.biosym_cart);
    res.json({ ok: true, user });
  } catch (e) { next(e); }
});

router.post('/forgot/verify', otpRequestLimiter, validate({
  identifier: 'required',
  channel: 'required',
  code: 'otp',
}), async (req, res, next) => {
  try {
    const token = await auth.verifyForgotOtpAndIssueResetToken(req.body);
    res.json({ ok: true, token, expiresInSeconds: 600 });
  } catch (e) { next(e); }
});

router.post('/reset', validate({ token: 'required', password: 'required' }), (req, res, next) => {
  try {
    const user = auth.resetPassword(req.body);
    res.json({ ok: true, user });
  } catch (e) { next(e); }
});

router.post('/resend', otpRequestLimiter, validate({
  identifier: ['required'],
  channel: 'required',
  purpose: 'required',
}), (req, res, next) => {
  const { identifier, channel, purpose } = req.body;
  if (purpose === 'login') {
    return auth.requestLoginOtp({ identifier, channel })
      .then((r) => res.json({ ok: true, ...r }))
      .catch(next);
  }
  if (purpose === 'forgot') {
    return auth.requestForgotOtp({ identifier, channel })
      .then((r) => res.json({ ok: true, ...r }))
      .catch(next);
  }
  next(ApiError.badRequest('VALIDATION', 'Invalid purpose.'));
});

router.post('/logout', (req, res) => {
  res.clearCookie('biosym_token', { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: auth.publicUser(req.user) });
});

module.exports = router;
