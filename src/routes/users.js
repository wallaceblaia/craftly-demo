const express = require('express');
const { makeToken, requireUser, rateLimit } = require('../auth');
const { hashPassword, verifyPassword } = require('../passwords');
const { text, email } = require('../validate');

const PUBLIC_FIELDS = 'id, name, email, address, phone, role';
const EDITABLE = ['name', 'address', 'phone'];

module.exports = ({ config, db }) => {
  const router = express.Router();
  const auth = requireUser(config);

  router.post('/register', (req, res) => {
    const name = text(req.body.name, 100);
    const mail = email(req.body.email);
    const password = typeof req.body.password === 'string' && req.body.password.length >= 10 ? req.body.password : null;
    if (!name || !mail || !password) return res.status(400).json({ error: 'name, a valid email and a password of 10+ characters are required' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail)) return res.status(409).json({ error: 'email already registered' });
    // the role is never taken from the request
    const result = db.prepare("INSERT INTO users (name, email, password, address, phone, role) VALUES (?, ?, ?, ?, ?, 'customer')").run(name, mail, hashPassword(password), text(req.body.address, 300), text(req.body.phone, 40));
    const user = { id: Number(result.lastInsertRowid), role: 'customer' };
    res.status(201).json({ id: user.id, token: makeToken(config, user) });
  });

  router.post('/login', rateLimit({ max: 5, windowMs: 15 * 60 * 1000 }), (req, res) => {
    const mail = email(req.body.email);
    const user = mail ? db.prepare('SELECT * FROM users WHERE email = ?').get(mail) : undefined;
    if (!user || typeof req.body.password !== 'string' || !verifyPassword(req.body.password, user.password)) {
      return res.status(401).json({ error: 'wrong email or password' });
    }
    res.json({ token: makeToken(config, user), user: { id: user.id, name: user.name, role: user.role } });
  });

  // a user reads and edits only their own profile (admins may read any)
  router.get('/users/:id', auth, (req, res) => {
    const id = Number(req.params.id);
    if (id !== req.user.id && req.user.role !== 'admin') return res.status(404).json({ error: 'not found' });
    const user = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(id);
    return user ? res.json(user) : res.status(404).json({ error: 'not found' });
  });

  router.put('/users/:id', auth, (req, res) => {
    if (Number(req.params.id) !== req.user.id) return res.status(404).json({ error: 'not found' });
    const changes = EDITABLE.filter((field) => req.body[field] !== undefined);
    if (changes.length === 0) return res.status(400).json({ error: `nothing to change (editable: ${EDITABLE.join(', ')})` });
    for (const field of changes) {
      const value = text(req.body[field], 300);
      if (value === null) return res.status(400).json({ error: `invalid ${field}` });
      // the column name comes from the fixed list above, the value is a parameter
      db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`).run(value, req.user.id);
    }
    res.json({ ok: true });
  });

  return router;
};
