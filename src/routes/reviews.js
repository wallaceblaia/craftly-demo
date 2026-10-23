const express = require('express');
const { requireUser } = require('../auth');
const { positiveInt, text } = require('../validate');

module.exports = ({ config, db }) => {
  const router = express.Router();
  const auth = requireUser(config);

  router.post('/', auth, (req, res) => {
    const productId = positiveInt(req.body.product_id);
    const rating = positiveInt(req.body.rating);
    if (!productId || !rating || rating > 5) return res.status(400).json({ error: 'product_id and a rating from 1 to 5 are required' });
    const result = db.prepare('INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?)').run(productId, req.user.id, rating, text(req.body.comment, 1000));
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  // reviews show the reviewer's name only — never their email
  router.get('/:productId', (req, res) => {
    const productId = positiveInt(req.params.productId);
    if (!productId) return res.status(400).json({ error: 'invalid product id' });
    res.json(db.prepare('SELECT r.id, r.rating, r.comment, u.name FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ? ORDER BY r.id DESC').all(productId));
  });

  return router;
};
