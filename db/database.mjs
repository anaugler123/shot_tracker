import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
export function createPool(connectionString = process.env.DATABASE_URL) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", (e) =>
    console.error("Idle database connection error:", e.code || e.name),
  );
  return pool;
}
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('hack-schema'))");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const files = (await readdir(new URL("./migrations/", import.meta.url)))
      .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    for (const file of files) {
      const version = file.slice(0, -4);
      const done = await client.query(
        "SELECT version FROM schema_migrations WHERE version=$1",
        [version],
      );
      if (!done.rowCount) {
        await client.query(
          await readFile(
            new URL("./migrations/" + file, import.meta.url),
            "utf8",
          ),
        );
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES($1)",
          [version],
        );
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function readGame(client, id, teamId = "default") {
  const game = await client.query(
    "SELECT id,metadata,revision FROM games WHERE id=$1 AND team_id=$2",
    [id, teamId],
  );
  if (!game.rowCount) return null;
  const row = game.rows[0];
  const [shots, ends] = await Promise.all([
    client.query(
      "SELECT * FROM shots WHERE game_id=$1 AND team_id=$2 ORDER BY end_number,position,stone",
      [id, teamId],
    ),
    client.query(
      "SELECT * FROM end_scores WHERE game_id=$1 AND team_id=$2 ORDER BY end_number",
      [id, teamId],
    ),
  ]);
  return {
    game: {
      ...row.metadata,
      id: row.id,
      teamId,
      shots: shots.rows.map((s) => ({
        id: s.shot_id,
        end: s.end_number,
        position: s.position,
        stone: s.stone,
        turn: s.turn_target,
        kind: s.kind,
        type: s.shot_type,
        execution: s.execution,
        score: s.score,
        deficiency: s.deficiency,
        review: s.review_flag,
        note: s.note,
        timestamp: s.video_timestamp,
      })),
      scores: ends.rows.map((s) => ({ us: s.us, them: s.them })),
    },
    revision: row.revision,
  };
}
export async function writeGame(
  pool,
  game,
  expectedRevision,
  userId,
  teamId = "default",
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      teamId + ":" + game.id,
    ]);
    const existing = await client.query(
      "SELECT revision FROM games WHERE id=$1 AND team_id=$2 FOR UPDATE",
      [game.id, teamId],
    );
    const revision = existing.rows[0]?.revision ?? 0;
    if (revision !== expectedRevision) {
      const current = await readGame(client, game.id, teamId);
      await client.query("ROLLBACK");
      return { conflict: current };
    }
    const { shots, scores, ...metadata } = game;
    delete metadata.sample;
    await client.query(
      `INSERT INTO games(id,metadata,revision,updated_by,team_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(team_id,id) DO UPDATE SET metadata=EXCLUDED.metadata,revision=EXCLUDED.revision,updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [game.id, metadata, revision + 1, userId, teamId],
    );
    await client.query("DELETE FROM shots WHERE game_id=$1 AND team_id=$2", [
      game.id,
      teamId,
    ]);
    await client.query(
      "DELETE FROM end_scores WHERE game_id=$1 AND team_id=$2",
      [game.id, teamId],
    );
    for (const s of shots)
      await client.query(
        "INSERT INTO shots(team_id,game_id,shot_id,end_number,position,stone,turn_target,kind,shot_type,execution,score,deficiency,review_flag,note,video_timestamp) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
        [
          teamId,
          game.id,
          s.id,
          s.end,
          s.position,
          s.stone,
          s.turn,
          s.kind,
          s.type,
          s.execution,
          s.score,
          s.deficiency,
          s.review,
          s.note,
          s.timestamp,
        ],
      );
    for (let i = 0; i < scores.length; i++)
      await client.query(
        "INSERT INTO end_scores(team_id,game_id,end_number,us,them) VALUES($1,$2,$3,$4,$5)",
        [teamId, game.id, i + 1, scores[i].us, scores[i].them],
      );
    await client.query("COMMIT");
    return { game: { ...game, teamId, sample: false }, revision: revision + 1 };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
