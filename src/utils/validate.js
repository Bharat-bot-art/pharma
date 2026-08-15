const validator = require('validator');
const { ApiError } = require('./ApiError');
const { normalizeEmail, normalizeMobile } = require('./helpers');

function isEmail(v) {
  return typeof v === 'string' && validator.isEmail(v);
}

function isMobile(v) {
  return typeof v === 'string' && /^[6-9]\d{9}$/.test(normalizeMobile(v) || '');
}

const rules = {
  email(v) {
    if (!isEmail(v)) throw ApiError.badRequest('VALIDATION', 'Please enter a valid email address.');
    return normalizeEmail(v);
  },
  mobile(v) {
    const m = normalizeMobile(v);
    if (!m) throw ApiError.badRequest('VALIDATION', 'Please enter a valid 10-digit mobile number.');
    return m;
  },
  required(v) {
    if (v === undefined || v === null || String(v).trim() === '') {
      throw ApiError.badRequest('VALIDATION', 'This field is required.');
    }
    return String(v).trim();
  },
  string(v) {
    return v === undefined || v === null ? '' : String(v).trim();
  },
  number(v) {
    const n = Number(v);
    if (v === undefined || v === null || Number.isNaN(n)) {
      throw ApiError.badRequest('VALIDATION', 'Please enter a valid number.');
    }
    return n;
  },
  boolean(v) {
    return v === true || v === 'true' || v === 1 || v === '1';
  },
  otp(v) {
    const s = String(v || '').replace(/\D/g, '');
    if (s.length !== 6) throw ApiError.badRequest('VALIDATION', 'OTP must be 6 digits.');
    return s;
  },
};

function validate(schema) {
  return (req, res, next) => {
    try {
      const source = req.body || {};
      const clean = {};
      for (const [key, ruleName] of Object.entries(schema)) {
        const rule = Array.isArray(ruleName) ? rules[ruleName[0]] : rules[ruleName];
        if (!rule) throw new Error(`Unknown validation rule: ${ruleName}`);
        if (Array.isArray(ruleName)) {
          const [, opts] = ruleName;
          if (opts && opts.optional && (source[key] === undefined || source[key] === '')) {
            clean[key] = undefined;
          } else {
            clean[key] = rule(source[key]);
          }
        } else {
          clean[key] = rule(source[key]);
        }
      }
      req.body = clean;
      next();
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { validate, rules, isEmail, isMobile };
