const express = require('express');
const { requireUser, requireAdmin } = require('../auth');
const { text } = require('../validate');

const MAX_IMPORT = 200;

/** Only https URLs on the configured catalog hosts (no IPs, no internal names). */
function allowedCatalogUrl(raw, hosts) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  return hosts.includes(url.hostname.toLowerCase()) ? url : null;
}

module.exports = ({ config, db, fetchImpl }) => {
  const router = express.Router();
  router.use(requireUser(config), requireAdmin);

  router.get('/stats', (req, res) => {
    res.json({
      orders: db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,
      revenue: db.prepare('SELECT COALESCE(SUM(total), 0) AS s FROM orders').get().s,
      users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    });
  });

  router.post('/import', async (req, res) => {
    const url = allowedCatalogUrl(req.body.url, config.catalogHosts);
    if (!url) return res.status(400).json({ error: 'the catalog URL must be https on an allowed catalog host' });
    try {
      const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return res.status(502).json({ error: 'the catalog did not answer' });
      const items = await response.json();
      if (!Array.isArray(items)) return res.status(400).json({ error: 'the catalog must be a list' });
      const insert = db.prepare('INSERT INTO products (name, description, price, maker, stock) VALUES (?, ?, ?, ?, ?)');
      let imported = 0;
      for (const item of items.slice(0, MAX_IMPORT)) {
        const name = text(item?.name, 120);
        const price = Number(item?.price);
        if (!name || !(price > 0)) continue;
        insert.run(name, text(item.description, 2000), price, text(item.maker, 120), Number.isInteger(item.stock) && item.stock >= 0 ? item.stock : 0);
        imported += 1;
      }
      res.json({ imported });
    } catch {
      res.status(502).json({ error: 'the catalog could not be read' });
    }
  });

  return router;
};

module.exports.allowedCatalogUrl = allowedCatalogUrl;
