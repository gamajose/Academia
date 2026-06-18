const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL nao informado');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, executed_at timestamptz NOT NULL DEFAULT now())');

    const dir = path.join(__dirname, '..', '..', 'database');
    const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();

    for (const file of files) {
      const found = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);
      if (found.rowCount > 0) continue;

      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      console.log('migration:', file);
    }

    await client.query('COMMIT');
    console.log('migrations ok');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
