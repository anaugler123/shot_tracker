import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { execFile, spawn, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { createApp } from "../server.mjs";
import { createPool, migrate } from "../db/database.mjs";
import {
  createPasswordReset,
  createPasswordResetMailer,
  passwordResetURL,
} from "../backend/passwordRecovery.mjs";

const exec = promisify(execFile);

test("recovery URLs keep tokens in fragments and reject unsafe app addresses", () => {
  assert.equal(
    passwordResetURL("https://tracker.example/path?old=1#old", "test-token"),
    "https://tracker.example/#reset-password=test-token",
  );
  assert.equal(
    passwordResetURL("http://127.0.0.1:3000", "token"),
    "http://127.0.0.1:3000/#reset-password=token",
  );
  for (const url of [
    "http://tracker.example",
    "javascript:alert(1)",
    "https://user:pass@tracker.example",
  ])
    assert.throws(() => passwordResetURL(url, "token"));
});

test("optional email transport uses the configured app address and handles provider failures", async () => {
  assert.equal(
    createPasswordResetMailer({ appURL: "", apiKey: "", from: "" }),
    null,
  );
  const mailer = createPasswordResetMailer({
    appURL: "https://tracker.example",
    apiKey: "test-only-key",
    from: "Tracker <tracker@example.test>",
    fetcher: async (url, init) => {
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(init.headers.Authorization, "Bearer test-only-key");
      const body = JSON.parse(init.body);
      assert.deepEqual(body.to, ["coach@example.test"]);
      assert.match(
        body.text,
        /\n\nhttps:\/\/tracker.example\/#reset-password=test-token\n\n/,
      );
      assert.match(body.text, /30 minutes/);
      return new Response("{}", { status: 200 });
    },
  });
  await mailer!({ email: "coach@example.test", token: "test-token" });
  const failing = createPasswordResetMailer({
    appURL: "https://tracker.example",
    apiKey: "test-only-key",
    from: "tracker@example.test",
    fetcher: async () => new Response("", { status: 500 }),
  });
  await assert.rejects(
    failing!({ email: "coach@example.test", token: "test-token" }),
    /delivery failed/,
  );
});

test(
  "password recovery preserves data, expires, revokes sessions and is single-use under concurrent requests; Railway CLI recovery works without email",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const schema = "hack_recovery_" + randomUUID().replaceAll("-", "");
    const admin = createPool(process.env.TEST_DATABASE_URL);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    const pool = createPool(url.toString());
    let server: ReturnType<typeof createApp> | undefined;
    let disabled: ReturnType<typeof createApp> | undefined;
    try {
      await migrate(pool);
      await migrate(pool);
      const emails: { email: string; token: string }[] = [];
      server = createApp(undefined, {
        pool,
        setupToken: "recovery-test-setup",
        sendPasswordReset: async (mail) => {
          emails.push(mail);
        },
      });
      await new Promise<void>((resolve) =>
        server!.listen(0, "127.0.0.1", resolve),
      );
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      async function request(
        path: string,
        body?: unknown,
        cookie?: string,
        base = origin,
      ) {
        const response = await fetch(base + "/api" + path, {
          method: body ? "POST" : "GET",
          headers: {
            ...(body
              ? { Origin: base, "Content-Type": "application/json" }
              : {}),
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        return {
          status: response.status,
          data: await response.json(),
          cookie: response.headers.get("set-cookie")?.split(";")[0],
        };
      }
      const email = "coach@example.test",
        oldPassword = "original-test-password",
        newPassword = "replacement-test-password";
      const account = await request("/setup", {
        email,
        name: "Coach",
        password: oldPassword,
        token: "recovery-test-setup",
      });
      const otherSession = await request("/login", {
        email,
        password: oldPassword,
      });
      await pool.query(
        "INSERT INTO games(id,metadata,updated_by) VALUES('retained',$1,$2)",
        [{ opponent: "Visitors" }, account.data.user.id],
      );
      const before = (await pool.query("SELECT * FROM games")).rows;
      const memberships = (await pool.query("SELECT * FROM team_memberships"))
        .rows;
      assert.equal((await request("/config")).data.passwordResetEmail, true);
      const unknown = await request("/password-reset/request", {
        email: "unknown@example.test",
      });
      const known = await request("/password-reset/request", {
        email: " COACH@example.test ",
      });
      assert.equal(known.status, 200);
      assert.deepEqual(known.data, unknown.data);
      assert.equal(emails.length, 1);
      assert.equal(JSON.stringify(known.data).includes(emails[0].token), false);
      const first = emails[0].token;
      assert.match(first, /^[a-f0-9]{64}$/);
      const stored = (await pool.query("SELECT * FROM password_resets"))
        .rows[0];
      assert.equal(
        stored.token_hash,
        createHash("sha256").update(first).digest("hex"),
      );
      assert.notEqual(stored.token_hash, first);
      assert.equal(
        (await request("/me", undefined, account.cookie)).status,
        200,
      );
      assert.equal(
        (
          await request("/password-reset/complete", {
            token: first,
            password: "short",
          })
        ).status,
        400,
      );
      assert.equal(
        (await pool.query("SELECT * FROM password_resets")).rowCount,
        1,
      );
      const crossSite = await fetch(origin + "/api/password-reset/complete", {
        method: "POST",
        headers: {
          Origin: "https://wrong.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: first, password: newPassword }),
      });
      assert.equal(crossSite.status, 403);
      assert.equal(
        (
          await request("/password-reset/complete", {
            token: "bad-token",
            password: newPassword,
          })
        ).status,
        400,
      );
      await pool.query(
        "UPDATE password_resets SET expires_at=now()-interval '1 second'",
      );
      assert.equal(
        (
          await request("/password-reset/complete", {
            token: first,
            password: newPassword,
          })
        ).status,
        400,
      );
      await request("/password-reset/request", { email });
      const second = emails.at(-1)!.token;
      await request("/password-reset/request", { email });
      const third = emails.at(-1)!.token;
      assert.equal(
        (
          await request("/password-reset/complete", {
            token: second,
            password: newPassword,
          })
        ).status,
        400,
      );
      const results = await Promise.all([
        request("/password-reset/complete", {
          token: third,
          password: newPassword,
        }),
        request("/password-reset/complete", {
          token: third,
          password: newPassword,
        }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
      assert.match(
        results.find((r) => r.status === 200)!.cookie!,
        /hack_session=$/,
      );
      assert.equal(
        (await request("/me", undefined, account.cookie)).status,
        401,
      );
      assert.equal(
        (await request("/me", undefined, otherSession.cookie)).status,
        401,
      );
      assert.equal(
        (await request("/login", { email, password: oldPassword })).status,
        401,
      );
      assert.equal(
        (await request("/login", { email, password: newPassword })).status,
        200,
      );
      assert.deepEqual((await pool.query("SELECT * FROM games")).rows, before);
      assert.deepEqual(
        (await pool.query("SELECT * FROM team_memberships")).rows,
        memberships,
      );
      assert.equal(
        (await pool.query("SELECT role FROM users")).rows[0].role,
        "coach",
      );
      assert.equal(
        (await pool.query("SELECT * FROM password_resets")).rowCount,
        0,
      );

      disabled = createApp(undefined, { pool, sendPasswordReset: null });
      await new Promise<void>((resolve) =>
        disabled!.listen(0, "127.0.0.1", resolve),
      );
      const disabledOrigin = `http://127.0.0.1:${(disabled.address() as { port: number }).port}`;
      const unavailable = await request(
        "/password-reset/request",
        { email },
        undefined,
        disabledOrigin,
      );
      assert.equal(unavailable.status, 503);
      assert.match(unavailable.data.message, /site owner/);
      const cli = await exec(
        process.execPath,
        ["scripts/recover-account.mjs", "--email", email, "--url", origin],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: url.toString() },
        },
      );
      const link = cli.stdout
        .split("\n")
        .find((line) => line.startsWith("http"))!;
      const cliToken = new URLSearchParams(new URL(link).hash.slice(1)).get(
        "reset-password",
      )!;
      assert.match(cliToken, /^[a-f0-9]{64}$/);
      assert.equal(
        (
          await request(
            "/password-reset/complete",
            { token: cliToken, password: "owner-recovered-password" },
            undefined,
            disabledOrigin,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            "/login",
            { email, password: "owner-recovered-password" },
            undefined,
            disabledOrigin,
          )
        ).status,
        200,
      );
      assert.equal(
        await createPasswordReset(pool, "missing@example.test"),
        null,
      );
      for (let i = 0; i < 15; i++)
        assert.equal(
          (
            await request(
              "/password-reset/request",
              { email: "missing@example.test" },
              undefined,
              disabledOrigin,
            )
          ).status,
          i === 14 ? 429 : 503,
        );
    } finally {
      if (server)
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      if (disabled)
        await new Promise<void>((resolve) => disabled!.close(() => resolve()));
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);

test(
  "Railway direct reset hides terminal input, checks confirmation, revokes sessions and preserves account data",
  {
    skip:
      !process.env.TEST_DATABASE_URL ||
      spawnSync("script", ["--version"]).status !== 0,
  },
  async () => {
    const schema = "hack_terminal_" + randomUUID().replaceAll("-", "");
    const admin = createPool(process.env.TEST_DATABASE_URL);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    const pool = createPool(url.toString());
    let server: ReturnType<typeof createApp> | undefined;
    try {
      await migrate(pool);
      server = createApp(undefined, {
        pool,
        setupToken: "terminal-test-setup",
        sendPasswordReset: null,
      });
      await new Promise<void>((resolve) =>
        server!.listen(0, "127.0.0.1", resolve),
      );
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const email = "terminal@example.test",
        original = "original-terminal-password";
      async function request(path: string, body: unknown) {
        return fetch(origin + "/api" + path, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const created = await request("/setup", {
        email,
        name: "Coach",
        password: original,
        token: "terminal-test-setup",
      });
      const user = (await created.json()).user;
      await pool.query(
        "INSERT INTO games(id,metadata,updated_by) VALUES('retained',$1,$2)",
        [{ opponent: "Visitors" }, user.id],
      );
      const before = (await pool.query("SELECT * FROM games")).rows;
      const memberships = (await pool.query("SELECT * FROM team_memberships"))
        .rows;
      await createPasswordReset(pool, email);
      const cliEnv = {
        ...process.env,
        DATABASE_URL: url.toString(),
        PUBLIC_APP_URL: "",
      };
      await assert.rejects(
        exec(
          process.execPath,
          ["scripts/recover-account.mjs", "--email", email, "--set-password"],
          { env: cliEnv },
        ),
        (error: any) => /interactive Railway SSH/.test(error.stderr),
      );
      async function terminal(password: string, confirmation?: string) {
        const quote = (value: string) =>
          "'" + value.replaceAll("'", "'\\''") + "'";
        const command = [
          process.execPath,
          "scripts/recover-account.mjs",
          "--email",
          email,
          "--set-password",
        ]
          .map(quote)
          .join(" ");
        return new Promise<{ status: number | null; output: string }>(
          (resolve, reject) => {
            const child = spawn(
              "script",
              ["--quiet", "--return", "--command", command, "/dev/null"],
              { env: cliEnv },
            );
            let output = "",
              sent = false,
              confirmed = false;
            const timeout = setTimeout(() => {
              child.kill("SIGKILL");
              reject(Error("Hidden prompt did not complete"));
            }, 10000);
            child.on("error", (error) => {
              clearTimeout(timeout);
              reject(error);
            });
            const read = (chunk: Buffer) => {
              output += chunk.toString();
              if (!sent && output.includes("New password (")) {
                sent = true;
                child.stdin.write(
                  password === "CANCEL" ? "\x03" : password + "\r",
                );
              } else if (
                !confirmed &&
                output.includes("Confirm new password")
              ) {
                confirmed = true;
                child.stdin.write(confirmation + "\r");
              }
            };
            child.stdout.on("data", read);
            child.stderr.on("data", read);
            child.on("close", (status) => {
              clearTimeout(timeout);
              resolve({ status, output });
            });
          },
        );
      }
      const mismatch = await terminal(
        "hidden-terminal-password",
        "different-terminal-password",
      );
      assert.equal(mismatch.status, 1);
      assert.match(mismatch.output, /Passwords do not match/);
      assert.equal(mismatch.output.includes("hidden-terminal-password"), false);
      assert.equal(
        mismatch.output.includes("different-terminal-password"),
        false,
      );
      assert.equal(
        (await request("/login", { email, password: original })).status,
        200,
      );
      const cancelled = await terminal("CANCEL");
      assert.equal(cancelled.status, 1);
      assert.match(cancelled.output, /Recovery cancelled/);
      assert.equal(
        (await pool.query("SELECT * FROM password_resets")).rowCount,
        1,
      );
      const updated = await terminal(
        "hidden-terminal-password",
        "hidden-terminal-password",
      );
      assert.equal(updated.status, 0);
      assert.match(updated.output, /Password updated/);
      assert.equal(updated.output.includes("hidden-terminal-password"), false);
      assert.equal((await pool.query("SELECT * FROM sessions")).rowCount, 0);
      assert.equal(
        (await pool.query("SELECT * FROM password_resets")).rowCount,
        0,
      );
      assert.equal(
        (await request("/login", { email, password: original })).status,
        401,
      );
      assert.equal(
        (
          await request("/login", {
            email,
            password: "hidden-terminal-password",
          })
        ).status,
        200,
      );
      assert.deepEqual((await pool.query("SELECT * FROM games")).rows, before);
      assert.deepEqual(
        (await pool.query("SELECT * FROM team_memberships")).rows,
        memberships,
      );
      assert.equal(
        (await pool.query("SELECT role FROM users")).rows[0].role,
        "coach",
      );
    } finally {
      if (server)
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
