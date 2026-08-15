const { env } = require('../../../config/env');
const { generateOtp, hashOtp, timingSafeEqual } = require('../../../utils/helpers');

const SALT = process.env.OTP_HASH_SALT || 'biosym-otp-salt';

async function send({ code, identifier }) {
  console.log('\n============================================');
  console.log('  [DEV] OTP generated (OTP_PROVIDER=console)');
  console.log('  Destination :', identifier);
  console.log(`  Your OTP    : ${code}`);
  console.log('  NOTE: In production set OTP_PROVIDER=msg91 or twilio.');
  console.log('============================================\n');
  return { reference: null };
}

function generate() {
  return generateOtp(6);
}

async function verify({ code, storedHash }) {
  if (!storedHash) return false;
  const expected = hashOtp(code, SALT);
  return timingSafeEqual(expected, storedHash);
}

module.exports = { name: 'console', send, generate, verify, salt: SALT };
