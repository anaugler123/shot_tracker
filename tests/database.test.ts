import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createPool, migrate, readGame } from "../db/database.mjs";
import { createApp } from "../server.mjs";
import { emptyShot, type Game } from "../src/model";

test(
  "team migration preserves existing accounts, sessions, invitations, games and scores",
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const url = process.env.TEST_DATABASE_URL!;
    const schema = "hack_upgrade_" + randomUUID().replaceAll("-", "");
    const admin = createPool(url);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const scoped = new URL(url);
    scoped.searchParams.set("options", `-c search_path=${schema}`);
    const pool = createPool(scoped.toString());
    try {
      await pool.query(
        await readFile(
          new URL("../db/migrations/001_initial.sql", import.meta.url),
          "utf8",
        ),
      );
      await pool.query(
        "CREATE TABLE schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()); INSERT INTO schema_migrations(version) VALUES('001_initial')",
      );
      const userId = randomUUID();
      await pool.query(
        "INSERT INTO users(id,email,name,password_hash,role) VALUES($1,'coach@upgrade.test','Coach','existing-hash','coach')",
        [userId],
      );
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('session',$1,now()+interval '1 day')",
        [userId],
      );
      await pool.query(
        "INSERT INTO invitations(token_hash,email,role,created_by,expires_at) VALUES('invite','player@upgrade.test','player',$1,now()+interval '1 day')",
        [userId],
      );
      await pool.query(
        "INSERT INTO games(id,metadata,revision,updated_by) VALUES('existing',$1,7,$2)",
        [
          {
            opponent: "Visitors",
            players: ["Lead", "Second", "Third", "Fourth"],
          },
          userId,
        ],
      );
      await pool.query(
        "INSERT INTO shots(game_id,shot_id,end_number,position,stone,turn_target,kind,shot_type,execution,score,deficiency,note,video_timestamp) VALUES('existing','1A',1,0,1,'CW C','Draw','Draw','Make',5,'Make','Review me',125)",
      );
      await pool.query(
        "INSERT INTO end_scores(game_id,end_number,us,them) VALUES('existing',1,2,0),('existing',2,NULL,NULL)",
      );
      await migrate(pool);
      await migrate(pool);
      const loaded = await readGame(pool, "existing");
      assert.equal(loaded.revision, 7);
      assert.equal(loaded.game.teamId, "default");
      assert.equal(loaded.game.opponent, "Visitors");
      assert.equal(loaded.game.shots[0].score, 5);
      assert.equal(loaded.game.shots[0].note, "Review me");
      assert.equal(loaded.game.shots[0].timestamp, 125);
      assert.deepEqual(loaded.game.scores, [
        { us: 2, them: 0 },
        { us: null, them: null },
      ]);
      assert.deepEqual(
        (await pool.query("SELECT team_id,user_id,role FROM team_memberships"))
          .rows,
        [{ team_id: "default", user_id: userId, role: "coach" }],
      );
      assert.equal(
        (await pool.query("SELECT active_team_id FROM sessions")).rows[0]
          .active_team_id,
        "default",
      );
      assert.equal(
        (await pool.query("SELECT team_id FROM invitations")).rows[0].team_id,
        "default",
      );
      assert.equal(
        (await pool.query("SELECT password_hash FROM users")).rows[0]
          .password_hash,
        "existing-hash",
      );
      assert.equal(
        (await pool.query("SELECT shooting_percentage FROM player_performance"))
          .rows[0].shooting_percentage,
        "100.0",
      );
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);

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
        teamId?: string,
      ) {
        const response = await fetch(origin + "/api" + path, {
          method,
          headers: {
            ...(teamId ? { "X-Team-Id": teamId } : {}),
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
      const renamed = await request(
        "/teams/default",
        { name: "Team Alpha" },
        coach,
        "PATCH",
      );
      assert.equal(renamed.response.status, 200);
      const beta = await request("/teams", { name: "Team Beta" }, coach);
      assert.equal(beta.response.status, 201);
      const betaId = beta.data.team.id;
      assert.equal(
        (await request("/teams", { name: "Not allowed" }, player)).response
          .status,
        403,
      );
      assert.equal(
        (await request("/games", undefined, player, "GET", betaId)).response
          .status,
        403,
      );
      assert.equal(
        (
          await request(
            "/teams/" + betaId,
            { name: "Not allowed" },
            player,
            "PATCH",
          )
        ).response.status,
        403,
      );
      assert.equal(
        (await request("/games", undefined, coach, "GET", betaId)).data.games
          .length,
        0,
      );
      const betaGame = {
        ...game,
        teamId: betaId,
        opponent: "Beta opponent",
        shots: [{ ...game.shots[0], score: 2 }],
      };
      assert.equal(
        (
          await request(
            "/games/" + game.id,
            { game: betaGame, expectedRevision: 0 },
            coach,
            "PUT",
            betaId,
          )
        ).response.status,
        200,
      );
      const alphaRead = await request(
        "/games",
        undefined,
        coach,
        "GET",
        "default",
      );
      const betaRead = await request("/games", undefined, coach, "GET", betaId);
      assert.equal(alphaRead.data.games[0].game.shots[0].score, 5);
      assert.equal(betaRead.data.games[0].game.shots[0].score, 2);
      assert.equal(
        (
          await request(
            "/games/" + game.id,
            { game: betaGame, expectedRevision: 2 },
            coach,
            "PUT",
            "default",
          )
        ).response.status,
        403,
      );
      const secondInvite = await request(
        "/invites",
        { email: "player@example.test", role: "coach" },
        coach,
        "POST",
        betaId,
      );
      assert.equal(secondInvite.response.status, 201);
      const joined = await request("/accept-invite", {
        token: secondInvite.data.token,
        password: "another-strong-password",
      });
      assert.equal(joined.response.status, 200);
      const coachInBeta = joined.cookie!;
      assert.equal(
        (await request("/me", undefined, coachInBeta, "GET", betaId)).data.user
          .role,
        "coach",
      );
      assert.equal(
        (await request("/me", undefined, coachInBeta, "GET", "default")).data
          .user.role,
        "player",
      );
      assert.equal(
        (
          await request(
            "/teams/default",
            { name: "No role escalation" },
            coachInBeta,
            "PATCH",
            betaId,
          )
        ).response.status,
        403,
      );
      assert.equal(
        (
          await request(
            "/games/" + game.id,
            { game, expectedRevision: 2 },
            coachInBeta,
            "PUT",
            "default",
          )
        ).response.status,
        403,
      );
      const teams = await request("/teams", undefined, coachInBeta);
      assert.equal(teams.data.teams.length, 2);
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
