import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPool, migrate } from "../db/database.mjs";
import { createApp } from "../server.mjs";
import { emptyShot, type Game } from "../src/model";

test(
  "PostgreSQL accounts, role permissions, shared games, revisions, and migrations",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const url = process.env.TEST_DATABASE_URL!;
    const schema = "hack_test_" + randomUUID().replaceAll("-", "");
    const admin = createPool(url);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const scoped = new URL(url);
    scoped.searchParams.set("options", `-c search_path=${schema}`);
    const pool = createPool(scoped.toString());
    let server: ReturnType<typeof createApp> | undefined;
    try {
      await migrate(pool);
      await migrate(pool);
      server = createApp(undefined, {
        pool,
        setupToken: "integration-setup-token",
      });
      await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      async function request(
        path: string,
        body?: unknown,
        cookie?: string,
        method = body ? "POST" : "GET",
      ) {
        const response = await fetch(origin + "/api" + path, {
          method,
          headers: {
            ...(body
              ? { "Content-Type": "application/json", Origin: origin }
              : {}),
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await response.json();
        return {
          response,
          data,
          cookie: response.headers.get("set-cookie")?.split(";")[0],
        };
      }
      assert.equal((await request("/config")).data.setupRequired, true);
      const account = {
        name: "Test Coach",
        email: "coach@example.test",
        password: "a-strong-test-password",
      };
      assert.equal(
        (await request("/setup", { ...account, token: "wrong" })).response
          .status,
        403,
      );
      const setup = await request("/setup", {
        ...account,
        token: "integration-setup-token",
      });
      assert.equal(setup.response.status, 200);
      assert.equal(setup.data.user.role, "coach");
      assert.match(
        setup.response.headers.get("set-cookie")!,
        /HttpOnly; SameSite=Strict/,
      );
      const coach = setup.cookie!;
      assert.equal((await request("/config")).data.setupRequired, false);
      assert.equal(
        (
          await request("/setup", {
            ...account,
            token: "integration-setup-token",
          })
        ).response.status,
        409,
      );
      assert.equal(
        (await request("/login", { email: account.email, password: "wrong" }))
          .response.status,
        401,
      );
      assert.equal((await request("/login", account)).response.status, 200);
      assert.equal((await request("/games")).response.status, 401);
      const invite = await request(
        "/invites",
        { email: "player@example.test", role: "player" },
        coach,
      );
      assert.equal(invite.response.status, 201);
      const accepted = await request("/accept-invite", {
        token: invite.data.token,
        name: "Test Player",
        password: "another-strong-password",
      });
      assert.equal(accepted.response.status, 200);
      assert.equal(accepted.data.user.role, "player");
      const player = accepted.cookie!;
      assert.equal(
        (
          await request("/accept-invite", {
            token: invite.data.token,
            name: "Again",
            password: "another-strong-password",
          })
        ).response.status,
        400,
      );
      assert.equal(
        (
          await request(
            "/invites",
            { email: "other@example.test", role: "coach" },
            player,
          )
        ).response.status,
        403,
      );
      const game: Game = {
        id: randomUUID(),
        event: "Test Cup",
        opponent: "Visitors",
        date: "2026-04-25",
        venue: "Test rink",
        sheet: "1",
        round: "PreLim",
        ends: 8,
        players: ["Lead", "Second", "Third", "Fourth"],
        firstHammer: true,
        status: "live",
        video: "",
        scores: Array.from({ length: 9 }, (_, i) =>
          i === 0 ? { us: 0, them: 0 } : { us: null, them: null },
        ),
        shots: [
          {
            ...emptyShot(1, 0, 1),
            turn: "CW C",
            type: "Draw",
            execution: "Make",
            deficiency: "Make",
            score: 5,
          },
        ],
      };
      assert.equal(
        (
          await request(
            "/games/" + game.id,
            { game, expectedRevision: 0 },
            player,
            "PUT",
          )
        ).response.status,
        403,
      );
      const saved = await request(
        "/games/" + game.id,
        { game, expectedRevision: 0 },
        coach,
        "PUT",
      );
      assert.equal(saved.response.status, 200);
      assert.equal(saved.data.revision, 1);
      const loaded = await request("/games", undefined, player);
      assert.equal(loaded.response.status, 200);
      assert.equal(loaded.data.games.length, 1);
      assert.deepEqual(loaded.data.games[0].game.scores[0], { us: 0, them: 0 });
      assert.deepEqual(loaded.data.games[0].game.shots, game.shots);
      const results = await Promise.all([
        request(
          "/games/" + game.id,
          { game: { ...game, opponent: "First edit" }, expectedRevision: 1 },
          coach,
          "PUT",
        ),
        request(
          "/games/" + game.id,
          { game: { ...game, opponent: "Second edit" }, expectedRevision: 1 },
          coach,
          "PUT",
        ),
      ]);
      assert.deepEqual(
        results.map((r) => r.response.status).sort(),
        [200, 409],
      );
      assert.equal(
        results.find((r) => r.response.status === 409)!.data.current.revision,
        2,
      );
      assert.equal(
        (
          await request(
            "/games/" + game.id,
            {
              game: { ...game, shots: [{ ...game.shots[0], score: 10 }] },
              expectedRevision: 2,
            },
            coach,
            "PUT",
          )
        ).response.status,
        400,
      );
      const csrf = await fetch(origin + "/api/invites", {
        method: "POST",
        headers: { Cookie: coach, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "x@example.test", role: "coach" }),
      });
      assert.equal(csrf.status, 403);
      const stats = await pool.query("SELECT * FROM player_performance");
      assert.equal(Number(stats.rows[0].shooting_percentage), 100);
      assert.equal(stats.rows[0].scored_shots, 1);
      assert.equal(
        (await pool.query("SELECT completed_ends FROM game_results")).rows[0]
          .completed_ends,
        1,
      );
      assert.equal((await request("/logout", {}, player)).response.status, 200);
      assert.equal(
        (await request("/me", undefined, player)).response.status,
        401,
      );
    } finally {
      if (server) await new Promise<void>((r) => server!.close(() => r()));
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
