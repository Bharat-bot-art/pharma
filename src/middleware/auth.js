const { ApiError } = require('../utils/ApiError');
const { db } = require('../config/db');
const { icon } = require('../views/helpers');

function getTokenUser(req) {
  const token = req.cookies && req.cookies.biosym_token;
  if (!token) return null;
  const { verify } = require('../services/token');
  const payload = verify(token);
  if (!payload) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) || null;
}

function optionalAuth(req, res, next) {
  req.user = getTokenUser(req);
  next();
}

function requireAuth(req, res, next) {
  const user = getTokenUser(req);
  if (!user) {
    if (req.xhr || req.path.startsWith('/api/')) {
      return next(ApiError.unauthorized('AUTH_REQUIRED', 'Please sign in to continue.'));
    }
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  if (!user.is_active) {
    return next(ApiError.forbidden('ACCOUNT_DISABLED', 'This account has been disabled.'));
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return next(ApiError.forbidden('ACCOUNT_LOCKED', 'This account is temporarily locked.'));
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    if (req.xhr || req.path.startsWith('/api/')) {
      return next(ApiError.unauthorized('AUTH_REQUIRED', 'Please sign in to continue.'));
    }
    return res.redirect('/login?redirect=/admin');
  }
  if (req.user.role !== 'admin') {
    if (req.xhr || req.path.startsWith('/api/')) {
      return next(ApiError.forbidden('FORBIDDEN', 'You do not have permission to do that.'));
    }
    return res.status(403).render('errors/403', { title: 'Access denied' });
  }
  next();
}

function setViewLocals(req, res, next) {
  res.locals.user = req.user || null;
  res.locals.path = req.path;
  res.locals.currentUrl = req.originalUrl;
  res.locals.query = req.query;
  res.locals.icon = icon;

  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.locals.settings = settings;

  next();
}

module.exports = { optionalAuth, requireAuth, requireAdmin, setViewLocals, getTokenUser };
