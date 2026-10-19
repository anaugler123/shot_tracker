import { createPool, migrate } from "./database.mjs";
if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL before running migrations.");
const pool = createPool();
try {
  await migrate(pool);
  console.log("Database migrations complete.");
} finally {
  await pool.end();
}
