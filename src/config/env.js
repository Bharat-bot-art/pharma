require('dotenv').config();

const bool = (v) => v === true || v === 'true' || v === '1' || v === 'yes';

const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),

  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  otpProvider: (process.env.OTP_PROVIDER || 'console').toLowerCase(),
  msg91: {
    apiKey: process.env.MSG91_API_KEY || '',
    senderId: process.env.MSG91_SENDER_ID || 'BIOSYM',
    templateId: process.env.MSG91_TEMPLATE_ID || '',
    countryCode: process.env.MSG91_COUNTRY_CODE || '91',
    otpExpiry: parseInt(process.env.MSG91_OTP_EXPIRY || '5', 10),
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.EMAIL_FROM || 'BIOSYM Pharma <auth@biosym.pharma>',
  },
  emailOtpEnabled: bool(process.env.EMAIL_OTP_ENABLED !== undefined ? process.env.EMAIL_OTP_ENABLED : true),

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },

  shiprocket: {
    email: process.env.SHIPROCKET_EMAIL || '',
    password: process.env.SHIPROCKET_PASSWORD || '',
    token: process.env.SHIPROCKET_TOKEN || '',
  },

  whatsapp: process.env.WHATSAPP_NUMBER || '916266530793',

  otp: {
    maxRequestsPerWindow: parseInt(process.env.OTP_MAX_REQUESTS || '3', 10),
    windowMinutes: parseInt(process.env.OTP_WINDOW_MINUTES || '15', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
    resendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN || '30', 10),
    defaultExpiryMinutes: parseInt(process.env.OTP_DEFAULT_EXPIRY_MINUTES || '5', 10),
  },
};

const isProduction = env.nodeEnv === 'production';

module.exports = { env, isProduction };
