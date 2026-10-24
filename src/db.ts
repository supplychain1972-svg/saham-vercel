import pg from "pg";
const { Pool } = pg;
let pool: pg.Pool | null = null;
export function getDb() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  }
  return pool;
}