const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'biosym.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  db.exec(schema);
  migrateColumns();
}

// Idempotent ALTER TABLE for columns added to existing tables.
const COLUMN_MIGRATIONS = [
  ['products', 'brand', "TEXT"],
  ['products', 'gallery_hues', "TEXT"],
  ['products', 'image', "TEXT"],
  ['categories', 'parent_id', "INTEGER"],
  ['orders', 'address_id', "INTEGER"],
  ['orders', 'applied_coupon', "TEXT"],
  ['orders', 'coupon_discount', "REAL NOT NULL DEFAULT 0"],
  ['orders', 'tracking_number', "TEXT"],
  ['orders', 'carrier', "TEXT"],
  ['orders', 'shiprocket_shipment_id', "TEXT"],
  ['orders', 'cancel_reason', "TEXT"],
  ['orders', 'cancelled_at', "TEXT"],
  ['orders', 'return_reason', "TEXT"],
  ['orders', 'return_requested_at', "TEXT"],
  ['orders', 'refund_status', "TEXT NOT NULL DEFAULT 'none'"],
  ['cart_items', 'is_saved', 'INTEGER NOT NULL DEFAULT 0'],
  ['banners', 'image', "TEXT"],
];

function migrateColumns() {
  for (const [table, column, ddl] of COLUMN_MIGRATIONS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
  }
}

function close() {
  db.close();
}

module.exports = { db, migrate, close, dbPath };
