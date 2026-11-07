import { randomBytes, createHash } from "node:crypto";

const hash = (token) => createHash("sha256").update(token).digest("hex");
const invalidLink = () =>
  Object.assign(
    new Error(
      "This recovery link is invalid, expired, or already used. Request a new link.",
    ),
    { status: 400 },
  );

export function passwordResetURL(siteURL, token) {
  const url = new URL(siteURL);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error(
      "Use the HTTPS address of your app (or HTTP localhost for development).",
    );
  url.pathname = "/";
  url.search = "";
  // Fragments stay out of HTTP requests, server logs and referrer headers.
  url.hash = "reset-password=" + token;
  return url.toString();
}

export async function createPasswordReset(pool, email) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(
      "SELECT id,email FROM users WHERE email=$1 FOR UPDATE",
      [email.trim().toLowerCase()],
    );
    if (!user.rowCount) {
      await client.query("COMMIT");
      return null;
    }
    const token = randomBytes(32).toString("hex");
    const userId = user.rows[0].id;
    await client.query("DELETE FROM password_resets WHERE user_id=$1", [
      userId,
    ]);
    await client.query(
      "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
      [hash(token), userId],
    );
    await client.query("COMMIT");
    return { token, email: user.rows[0].email };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updatePassword(client, userId, passwordHash) {
  await client.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
    passwordHash,
    userId,
  ]);
  await client.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM password_resets WHERE user_id=$1", [userId]);
}

// Only the server-side Railway recovery command calls this function. There is
// deliberately no public HTTP endpoint that resets an account by email alone.
export async function resetAccountPassword(pool, email, passwordHash) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(
      "SELECT id FROM users WHERE email=$1 FOR UPDATE",
      [email.trim().toLowerCase()],
    );
    if (!user.rowCount)
      throw new Error(
        "No account was found for that email. Use the email originally registered with the app.",
      );
    await updatePassword(client, user.rows[0].id, passwordHash);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function consumePasswordReset(pool, token, passwordHash) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw invalidLink();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reset = await client.query(
      "SELECT user_id FROM password_resets WHERE token_hash=$1",
      [hash(token)],
    );
    if (!reset.rowCount) throw invalidLink();
    const userId = reset.rows[0].user_id;
    // Issuance and consumption lock the user first, preventing races between
    // simultaneous resets or a new link replacing one being redeemed.
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    const consumed = await client.query(
      "DELETE FROM password_resets WHERE token_hash=$1 AND expires_at>now() RETURNING user_id",
      [hash(token)],
    );
    if (!consumed.rowCount) throw invalidLink();
    await updatePassword(client, userId, passwordHash);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function createPasswordResetMailer({
  appURL = process.env.PUBLIC_APP_URL,
  apiKey = process.env.RESEND_API_KEY,
  from = process.env.PASSWORD_RESET_FROM,
  fetcher = fetch,
} = {}) {
  if (!appURL || !apiKey || !from) return null;
  return async ({ email, token }) => {
    const url = passwordResetURL(appURL, token);
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Reset your Shot Tracker password",
        text: `Use this one-time link to reset your password:\n\n${url}\n\nThis link expires in 30 minutes. If you didn't request it, you can ignore this email.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error("Password recovery email delivery failed.");
  };
}
