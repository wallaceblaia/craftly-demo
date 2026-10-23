// Regression tests: each one reproduces an attack the first version allowed and proves it is now refused.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { open } = require('../src/db');
const { allowedCatalogUrl } = require('../src/routes/admin');

const config = {
  port: 0,
  dbFile: ':memory:',
  jwtSecret: 'test-only-secret-not-used-anywhere-else',
  adminEmail: 'admin@craftly.test',
  adminPassword: 'admin-password-123',
  allowedOrigin: 'http://localhost:3000',
  catalogHosts: ['catalog.example'],
};

let server;
let base;
const fetched = [];

before(async () => {
  const fakeFetch = async (url) => {
    fetched.push(String(url));
    return { ok: true, json: async () => [{ name: 'Clay bowl', price: 30 }] };
  };
  server = createApp({ config, db: open(config), fetchImpl: fakeFetch }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function call(method, path, { body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

async function customer(name) {
  const email = `${name}@craftly.test`;
  const r = await call('POST', '/api/register', { body: { name, email, password: 'a-long-password' } });
  assert.equal(r.status, 201);
  return { id: r.json.id, token: r.json.token };
}

test('a customer cannot read another customer\'s order (the "I can see someone else\'s orders" report)', async () => {
  const ana = await customer('ana');
  const ben = await customer('ben');
  const order = await call('POST', '/api/orders', { token: ana.token, body: { product_id: 1, quantity: 1, shipping_address: '1 Main St', payment_token: 'tok_test' } });
  assert.equal(order.status, 201);
  assert.equal((await call('GET', `/api/orders/${order.json.id}`, { token: ana.token })).status, 200);
  const stolen = await call('GET', `/api/orders/${order.json.id}`, { token: ben.token });
  assert.equal(stolen.status, 404);
  assert.ok(!stolen.text.includes('1 Main St'));
});

test('a token signed with a guessed key, or not signed at all, is refused', async () => {
  const forged = jwt.sign({ sub: '1', role: 'admin' }, 'craftly-super-secret-2026');
  assert.equal((await call('GET', '/api/admin/stats', { token: forged })).status, 401);
  const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"1","role":"admin"}').toString('base64url')}.`;
  assert.equal((await call('GET', '/api/admin/stats', { token: unsigned })).status, 401);
});

test('SQL injection in the login and the search does not work', async () => {
  const login = await call('POST', '/api/login', { body: { email: "admin@craftly.test' --", password: 'x' } });
  assert.equal(login.status, 401);
  const search = await call('GET', `/api/products/search?q=${encodeURIComponent("' OR '1'='1")}`);
  assert.equal(search.status, 200);
  assert.deepEqual(search.json, []);
});

test('the total is computed by the server and the client cannot set its own price', async () => {
  const ana = await customer('carla');
  const order = await call('POST', '/api/orders', { token: ana.token, body: { product_id: 1, quantity: 2, total: 0.01, shipping_address: 'x', payment_token: 'tok_test' } });
  assert.equal(order.status, 201);
  assert.equal(order.json.total, 56);
});

test('a customer cannot register as admin nor edit someone else\'s profile', async () => {
  const r = await call('POST', '/api/register', { body: { name: 'eve', email: 'eve@craftly.test', password: 'a-long-password', role: 'admin' } });
  const claims = jwt.decode(r.json.token);
  assert.equal(claims.role, 'customer');
  const other = await customer('dan');
  assert.equal((await call('PUT', `/api/users/${other.id}`, { token: r.json.token, body: { name: 'hacked' } })).status, 404);
  assert.equal((await call('PUT', `/api/users/${r.json.id}`, { token: r.json.token, body: { role: 'admin' } })).status, 400);
});

test('the admin routes need an admin', async () => {
  const c = await customer('fay');
  assert.equal((await call('GET', '/api/admin/stats', { token: c.token })).status, 403);
  assert.equal((await call('DELETE', '/api/products/1', { token: c.token })).status, 403);
});

test('the catalog import only reaches allowed https hosts (no SSRF)', async () => {
  for (const url of ['http://169.254.169.254/latest/meta-data/', 'https://localhost/x', 'https://catalog.example.evil.com/x', 'file:///etc/passwd', 'https://user:pw@catalog.example/x']) {
    assert.equal(allowedCatalogUrl(url, config.catalogHosts), null, url);
  }
  const login = await call('POST', '/api/login', { body: { email: config.adminEmail, password: config.adminPassword } });
  const token = login.json.token;
  assert.equal((await call('POST', '/api/admin/import', { token, body: { url: 'http://127.0.0.1:22/' } })).status, 400);
  const ok = await call('POST', '/api/admin/import', { token, body: { url: 'https://catalog.example/makers.json' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.imported, 1);
  assert.deepEqual(fetched, ['https://catalog.example/makers.json']);
});

test('the database backup and the free file reader no longer exist (no path traversal)', async () => {
  assert.equal((await call('GET', '/api/admin/backup')).status, 401);
  assert.equal((await call('GET', '/api/files?name=../src/config.js')).status, 404);
  assert.equal((await call('GET', '/uploads/..%2fsrc%2fconfig.js')).status, 404);
});

test('oversized bodies are refused before they reach the code (no memory DoS)', async () => {
  const big = await call('POST', '/api/login', { body: { email: 'a@b.c', password: 'x'.repeat(200_000) } });
  assert.equal(big.status, 413);
});

test('repeated wrong logins are rate limited', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await call('POST', '/api/login', { body: { email: 'nobody@craftly.test', password: 'wrong' } });
  assert.equal(last.status, 429);
});

test('errors never show stack traces or SQL', async () => {
  const r = await call('GET', '/api/orders/abc', { token: (await customer('gus')).token });
  assert.equal(r.status, 404);
  assert.ok(!/at |SELECT|sqlite/i.test(r.text));
});

test('the app refuses to start without its secrets in the environment', () => {
  const { load } = require('../src/config');
  const saved = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  assert.throws(() => load(), /JWT_SECRET/);
  if (saved !== undefined) process.env.JWT_SECRET = saved;
});

test('no secret is written in the source code', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const files = fs.readdirSync(path.join(__dirname, '..', 'src'), { recursive: true }).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    assert.ok(!/craftly-super-secret|pay_live_|mail-demo-key|Craftly2026!/.test(src), f);
  }
});
