const bcrypt = require('bcryptjs');
const { db } = require('../config/db');
const { ApiError } = require('../utils/ApiError');

const DEFAULT_ADMIN = {
  email: 'admin@biosym.in',
  password: 'admin123',
  fullName: 'Admin User',
  mobile: '9999999999',
};

function seedAdmin() {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(DEFAULT_ADMIN.email);
  if (existing) {
    console.log('Admin user already exists:', DEFAULT_ADMIN.email);
    return;
  }

  const hash = bcrypt.hashSync(DEFAULT_ADMIN.password, 10);
  const result = db
    .prepare(
      `INSERT INTO users (full_name, email, mobile, password_hash, role, is_email_verified, is_mobile_verified)
       VALUES (?, ?, ?, ?, 'admin', 1, 1)`
    )
    .run(DEFAULT_ADMIN.fullName, DEFAULT_ADMIN.email, DEFAULT_ADMIN.mobile, hash);

  console.log('Default admin created:');
  console.log('  Email:', DEFAULT_ADMIN.email);
  console.log('  Password:', DEFAULT_ADMIN.password);
  console.log('  ID:', result.lastInsertRowid);
}

if (require.main === module) {
  seedAdmin();
}

module.exports = { seedAdmin, DEFAULT_ADMIN };