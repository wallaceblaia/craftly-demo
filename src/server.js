const { load } = require('./config');
const db = require('./db');
const { createApp } = require('./app');

const config = load();
createApp({ config, db: db.open(config) }).listen(config.port, () => console.log(`Craftly running on port ${config.port}`));
