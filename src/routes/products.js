const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { requireUser, requireAdmin } = require('../auth');
const { positiveInt, text } = require('../validate');

const UPLOADS = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    // the stored name is ours: never the client's file name
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + IMAGE_TYPES[file.mimetype]),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => cb(null, Boolean(IMAGE_TYPES[file.mimetype])),
});

module.exports = ({ config, db }) => {
  const router = express.Router();
  const auth = requireUser(config);

  // one query: the products with their review count and average rating
  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT p.*, COUNT(r.id) AS reviews, AVG(r.rating) AS rating FROM products p LEFT JOIN reviews r ON r.product_id = p.id GROUP BY p.id ORDER BY p.id').all());
  });

  router.get('/search', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    res.json(db.prepare("SELECT * FROM products WHERE name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' ORDER BY id").all(like, like));
  });

  router.post('/', auth, requireAdmin, upload.single('image'), (req, res) => {
    const name = text(req.body.name, 120);
    const price = Number(req.body.price);
    const stock = Number(req.body.stock ?? 0);
    if (!name || !(price > 0) || !Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'name, a positive price and a stock are required' });
    const image = req.file ? '/uploads/' + req.file.filename : null;
    const result = db.prepare('INSERT INTO products (name, description, price, maker, image, stock) VALUES (?, ?, ?, ?, ?, ?)').run(name, text(req.body.description, 2000), price, text(req.body.maker, 120), image, stock);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  router.delete('/:id', auth, requireAdmin, (req, res) => {
    const id = positiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.status(204).end();
  });

  return router;
};
