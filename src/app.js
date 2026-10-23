// Builds the Express app from a config and a database (the tests build their own).

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const users = require('./routes/users');
const products = require('./routes/products');
const orders = require('./routes/orders');
const reviews = require('./routes/reviews');
const admin = require('./routes/admin');

function createApp({ config, db, fetchImpl = fetch }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });
  app.use(cors({ origin: config.allowedOrigin }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  // product images only: express.static refuses paths outside the folder and dotfiles
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { dotfiles: 'deny', index: false }));

  const deps = { config, db, fetchImpl };
  app.use('/api', users(deps));
  app.use('/api/products', products(deps));
  app.use('/api/orders', orders(deps));
  app.use('/api/reviews', reviews(deps));
  app.use('/api/admin', admin(deps));

  app.use((req, res) => res.status(404).json({ error: 'not found' }));
  // never leak stack traces or SQL to the client
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'request too large' });
    console.error(err.message);
    res.status(500).json({ error: 'internal error' });
  });
  return app;
}

module.exports = { createApp };
