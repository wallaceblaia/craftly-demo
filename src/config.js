// Every secret comes from the environment; the app refuses to start without them.

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing environment variable ${name} (see .env.example)`);
  return value;
}

function load() {
  return {
    port: Number(process.env.PORT || 3000),
    dbFile: process.env.DB_FILE || 'craftly.db',
    jwtSecret: required('JWT_SECRET'),
    adminEmail: process.env.ADMIN_EMAIL || null,
    adminPassword: process.env.ADMIN_PASSWORD || null,
    paymentsApiKey: process.env.PAYMENTS_API_KEY || null,
    mailApiKey: process.env.MAIL_API_KEY || null,
    allowedOrigin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
    catalogHosts: (process.env.CATALOG_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean),
  };
}

module.exports = { load };
