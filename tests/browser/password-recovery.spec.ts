import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createPool, migrate } from "../../db/database.mjs";
import { createApp } from "../../server.mjs";
import {
  passwordResetURL,
  createPasswordReset,
} from "../../backend/passwordRecovery.mjs";

test("forgot password, email link, confirmation, fresh sign-in and used-link errors work with PostgreSQL", async ({
  page,
}) => {
  test.skip(
    !process.env.TEST_DATABASE_URL,
    "Requires a scratch PostgreSQL database.",
  );
  const schema = "hack_recovery_browser_" + randomUUID().replaceAll("-", "");
  const admin = createPool(process.env.TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const pool = createPool(url.toString());
  let server: ReturnType<typeof createApp> | undefined;
  try {
    await migrate(pool);
    const emails: { email: string; token: string }[] = [];
    server = createApp(undefined, {
      pool,
      setupToken: "browser-recovery-setup",
      sendPasswordReset: async (mail) => {
        emails.push(mail);
      },
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const email = "coach@example.test";
    const create = await fetch(origin + "/api/setup", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name: "Coach",
        password: "original-browser-password",
        token: "browser-recovery-setup",
      }),
    });
    expect(create.status).toBe(200);
    await page.goto(origin);
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Forgot password?", exact: true })
      .click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByRole("button", { name: "Send recovery link", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "If an account matches",
    );
    expect(emails).toHaveLength(1);
    const link = passwordResetURL(origin, emails[0].token);
    await page.goto(link);
    await expect(
      page.getByRole("heading", { name: "Reset password", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(origin + "/");
    await page
      .getByLabel("New password", { exact: true })
      .fill("new-browser-password");
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("mismatched-password");
    await page
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveText("Passwords do not match.");
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("new-browser-password");
    await page
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Password updated");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("original-browser-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("incorrect");
    await page
      .getByLabel("Password", { exact: true })
      .fill("new-browser-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Games", exact: true, level: 1 }),
    ).toBeVisible();
    // An already signed-in user must also be able to open a recovery link.
    // Use an in-page fragment change to exercise the hash listener.
    await page.evaluate((hash) => {
      location.hash = hash;
    }, new URL(link).hash);
    await expect(
      page.getByRole("heading", { name: "Reset password", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("New password", { exact: true })
      .fill("another-new-password");
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("another-new-password");
    await page
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("already used");
    await page
      .getByRole("button", { name: "Back to sign in", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Games", exact: true, level: 1 }),
    ).toBeVisible();
    const fresh = await createPasswordReset(pool, email);
    await page.goto(passwordResetURL(origin, fresh!.token));
    await expect(
      page.getByRole("heading", { name: "Reset password", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("New password", { exact: true })
      .fill("signed-in-reset-password");
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("signed-in-reset-password");
    await page
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
  } finally {
    await page.goto("about:blank");
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});

test("email-disabled deployments explain how to get an owner recovery link", async ({
  page,
}) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: { database: true, setupRequired: false, passwordResetEmail: false },
    }),
  );
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, json: { message: "Sign in" } }),
  );
  await page.route("**/api/password-reset/request", (route) =>
    route.fulfill({
      status: 503,
      json: {
        message:
          "Email recovery isn't set up. Ask your coach or site owner for a recovery link.",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("coach@example.test");
  await page
    .getByRole("button", { name: "Send recovery link", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("site owner");
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
