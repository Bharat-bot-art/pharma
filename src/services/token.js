const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function sign(payload) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    issuer: 'biosym',
    audience: 'biosym-web',
  });
}

function verify(token) {
  try {
    return jwt.verify(token, env.jwtSecret, { issuer: 'biosym', audience: 'biosym-web' });
  } catch (e) {
    return null;
  }
}

module.exports = { sign, verify };
