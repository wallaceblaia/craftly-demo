// SQLite through Node's built-in driver; every query is parameterized.

const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./passwords');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, address TEXT, phone TEXT, role TEXT NOT NULL DEFAULT 'customer');
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, price REAL NOT NULL, maker TEXT, image TEXT, stock INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, total REAL NOT NULL, status TEXT NOT NULL, shipping_address TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), user_id INTEGER NOT NULL REFERENCES users(id), rating INTEGER NOT NULL, comment TEXT);
CREATE INDEX IF NOT EXISTS orders_by_user ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS reviews_by_product ON reviews(product_id);
`;

const SEED_PRODUCTS = [
  ['Hand-thrown mug', 'Stoneware mug, amber glaze', 28, 'Clay & Co'],
  ['Linen tote', 'Natural linen, block printed', 34, 'Thread House'],
  ['Walnut spoon set', 'Three carved walnut spoons', 42, 'Grain Studio'],
  ['Beeswax candles', 'Pair of hand-dipped tapers', 18, 'Hive Lights'],
];

function open(config) {
  const db = new DatabaseSync(config.dbFile);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0) {
    const insert = db.prepare('INSERT INTO products (name, description, price, maker, stock) VALUES (?, ?, ?, ?, 100)');
    for (const p of SEED_PRODUCTS) insert.run(...p);
  }
  if (config.adminEmail && config.adminPassword && !db.prepare('SELECT 1 FROM users WHERE email = ?').get(config.adminEmail)) {
    db.prepare("INSERT INTO users (name, email, password, role) VALUES ('Admin', ?, ?, 'admin')").run(config.adminEmail, hashPassword(config.adminPassword));
  }
  return db;
}

module.exports = { open };
