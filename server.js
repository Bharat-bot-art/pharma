const { createApp } = require('./src/app');
const { env } = require('./src/config/env');

const app = createApp();

app.listen(env.port, () => {
  console.log('==========================================');
  console.log('  BIOSYM Pharma — e-commerce platform');
  console.log(`  ➜ http://localhost:${env.port}`);
  console.log(`  OTP provider : ${env.otpProvider}`);
  console.log('==========================================');
});
