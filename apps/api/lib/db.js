const { Pool } = require('pg');

let databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL nao informado');
}

if (databaseUrl.includes(':Joseluiz1@')) {
  databaseUrl = databaseUrl.replace(':Joseluiz1@', ':Paulo1@');
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000
});

function query(text, params = []) {
  return pool.query(text, params);
}

module.exports = { pool, query };
