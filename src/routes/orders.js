const express = require('express');
const { requireUser, requireAdmin } = require('../auth');
const { positiveInt, text } = require('../validate');

const STATUSES = ['paid', 'shipped', 'delivered', 'cancelled'];

module.exports = ({ config, db }) => {
  const router = express.Router();
  const auth = requireUser(config);

  router.post('/', auth, (req, res) => {
    const productId = positiveInt(req.body.product_id);
    const quantity = positiveInt(req.body.quantity);
    const address = text(req.body.shipping_address, 300);
    // the card is tokenized by the payment provider in the browser: the server never sees a card number
    if (!productId || !quantity || quantity > 20 || !address || typeof req.body.payment_token !== 'string') return res.status(400).json({ error: 'product_id, quantity (1-20), shipping_address and payment_token are required' });
    const product = db.prepare('SELECT id, price, stock FROM products WHERE id = ?').get(productId);
    if (!product) return res.status(404).json({ error: 'product not found' });
    if (product.stock < quantity) return res.status(409).json({ error: 'not enough stock' });
    // the total is computed here, never trusted from the client
    const total = Math.round(product.price * quantity * 100) / 100;
    const result = db.prepare("INSERT INTO orders (user_id, product_id, quantity, total, status, shipping_address, created_at) VALUES (?, ?, ?, ?, 'paid', ?, ?)").run(req.user.id, productId, quantity, total, address, new Date().toISOString());
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(quantity, productId);
    res.status(201).json({ id: Number(result.lastInsertRowid), total });
  });

  // only the caller's orders, filtered and sorted by the database
  router.get('/', auth, (req, res) => {
    res.json(db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id));
  });

  // an order belongs to its customer: anyone else gets a 404, as if it did not exist
  router.get('/:id', auth, (req, res) => {
    const id = positiveInt(req.params.id);
    const order = id ? db.prepare('SELECT * FROM orders WHERE id = ?').get(id) : undefined;
    if (!order || (order.user_id !== req.user.id && req.user.role !== 'admin')) return res.status(404).json({ error: 'not found' });
    res.json(order);
  });

  router.put('/:id/status', auth, requireAdmin, (req, res) => {
    const id = positiveInt(req.params.id);
    if (!id || !STATUSES.includes(req.body.status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(req.body.status, id);
    res.json({ ok: true });
  });

  return router;
};
