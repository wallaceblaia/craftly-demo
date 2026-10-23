// Signed, expiring tokens: the signature is always verified, never just decoded.

const jwt = require('jsonwebtoken');

const TOKEN_TTL = '2h';

function makeToken(config, user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { algorithm: 'HS256', expiresIn: TOKEN_TTL });
}

function requireUser(config) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
      const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
      req.user = { id: Number(claims.sub), role: claims.role };
      next();
    } catch {
      res.status(401).json({ error: 'not logged in' });
    }
  };
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admins only' });
  next();
}

/** A small in-memory limiter for the login: N tries per window per key. */
function rateLimit({ max, windowMs }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = `${req.ip}:${String(req.body?.email || '').toLowerCase()}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) return res.status(429).json({ error: 'too many attempts, try again later' });
    next();
  };
}

module.exports = { makeToken, requireUser, requireAdmin, rateLimit };
