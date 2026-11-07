import { parseArgs } from "node:util";
import { createPool, migrate } from "../db/database.mjs";
import {
  createPasswordReset,
  passwordResetURL,
  resetAccountPassword,
} from "../backend/passwordRecovery.mjs";
import { passwordHash } from "../backend/api.mjs";
import { promptForPassword } from "./password-prompt.mjs";

// Run only in the app's Railway environment, where DATABASE_URL is injected.
// No password is accepted on the command line or printed to the terminal.
let pool;
try {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      url: { type: "string" },
      "set-password": { type: "boolean" },
    },
  });
  const appURL = values.url || process.env.PUBLIC_APP_URL;
  if (
    !process.env.DATABASE_URL ||
    !values.email ||
    (!values["set-password"] && !appURL)
  )
    throw new Error(
      'Run inside the Railway app: npm run account:recover -- --email "your-account-email" --set-password (interactive), or use --url "https://your-app-domain" to create a link. DATABASE_URL must be configured.',
    );
  if (!values["set-password"]) passwordResetURL(appURL, "");
  const password = values["set-password"] ? await promptForPassword() : null;
  pool = createPool();
  await migrate(pool);
  if (password !== null) {
    await resetAccountPassword(
      pool,
      values.email,
      await passwordHash(password),
    );
    console.log(
      "Password updated. Sign in on the website with your new password. Existing sessions and recovery links have been revoked; team data is unchanged.",
    );
  } else {
    const reset = await createPasswordReset(pool, values.email);
    if (!reset)
      throw new Error(
        "No account was found for that email. Use the email originally registered with the app.",
      );
    console.log(
      "Open this private, one-time link to choose a new password. It expires in 30 minutes:",
    );
    console.log(passwordResetURL(appURL, reset.token));
  }
} catch (error) {
  // Avoid printing connection strings or database/provider error payloads.
  console.error(
    error.name === "AbortError"
      ? "Recovery cancelled. No password was changed."
      : error.code
        ? "Account recovery failed. Check the app's database connection and migrations."
        : error.message,
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
