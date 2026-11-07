import { parseArgs } from "node:util";
import { createPool, migrate } from "../db/database.mjs";
import {
  createPasswordReset,
  passwordResetURL,
} from "../backend/passwordRecovery.mjs";

// Run only in the app's Railway environment, where DATABASE_URL is injected.
// No password is accepted on the command line or printed to the terminal.
let pool;
try {
  const { values } = parseArgs({
    options: { email: { type: "string" }, url: { type: "string" } },
  });
  const appURL = values.url || process.env.PUBLIC_APP_URL;
  if (!process.env.DATABASE_URL || !values.email || !appURL)
    throw new Error(
      'Run inside the Railway app: npm run account:recover -- --email "your-account-email" --url "https://your-app-domain". DATABASE_URL must be configured.',
    );
  passwordResetURL(appURL, "");
  pool = createPool();
  await migrate(pool);
  const reset = await createPasswordReset(pool, values.email);
  if (!reset)
    throw new Error(
      "No account was found for that email. Use the email originally registered with the app.",
    );
  console.log(
    "Open this private, one-time link to choose a new password. It expires in 30 minutes:",
  );
  console.log(passwordResetURL(appURL, reset.token));
} catch (error) {
  // Avoid printing connection strings or database/provider error payloads.
  console.error(
    error.code
      ? "Account recovery failed. Check the app's database connection and migrations."
      : error.message,
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
