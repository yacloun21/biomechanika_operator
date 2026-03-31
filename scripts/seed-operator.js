const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
const login = process.env.OPERATOR_LOGIN || 'operator';
const password = process.env.OPERATOR_PASSWORD || 'sportlab123';

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

function resolvePgSsl(connectionString) {
  if (process.env.PGSSL === 'disable') return false;
  if (process.env.PGSSL === 'require') return { rejectUnauthorized: false };
  const looksLocal = /(localhost|127\.0\.0\.1)/i.test(connectionString);
  return looksLocal ? false : { rejectUnauthorized: false };
}

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: resolvePgSsl(DATABASE_URL)
  });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO operators (login, password_hash, role)
       VALUES ($1, $2, 'operator')
       ON CONFLICT (login)
       DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [login, passwordHash]
    );

    console.log(`Operator '${login}' created/updated successfully.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
