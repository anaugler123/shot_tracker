import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
  scrypt,
} from "node:crypto";
import { promisify } from "node:util";
import { readGame, writeGame } from "../db/database.mjs";
import { validGame } from "./validation.mjs";
const derive = promisify(scrypt);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const safeEqual = (a, b) =>
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
export async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 64, {
    N: 32768,
    maxmem: 64 * 1024 * 1024,
  });
  return `${salt}:${key.toString("hex")}`;
}
async function passwordMatches(password, stored) {
  const [salt, key] = stored.split(":");
  const actual = await derive(password, salt, 64, {
    N: 32768,
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(actual, Buffer.from(key, "hex"));
}
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function accountInput(body) {
  if (
    typeof body.email !== "string" ||
    !/^\S+@\S+\.\S+$/.test(body.email) ||
    body.email.length > 200 ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 100 ||
    typeof body.password !== "string" ||
    body.password.length < 12 ||
    body.password.length > 256
  )
    fail(
      400,
      "Enter your name, a valid email, and a password of 12–256 characters.",
    );
  return { email: body.email.trim().toLowerCase(), name: body.name.trim() };
}
async function json(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 2 * 1024 * 1024)
      fail(413, "Request is too large.");
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    fail(400, "Invalid JSON.");
  }
}
export function createAPI(
  pool,
  { setupToken = process.env.SETUP_TOKEN || "" } = {},
) {
  const attempts = new Map();
  const send = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  function throttle(req, key) {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    const name = `${ip}:${key}`;
    const now = Date.now();
    let entry = attempts.get(name);
    if (!entry || entry.until < now) {
      entry = { count: 0, until: now + 15 * 60 * 1000 };
      attempts.set(name, entry);
    }
    if (++entry.count > 15)
      fail(429, "Too many attempts. Try again in 15 minutes.");
    if (attempts.size > 10000)
      for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  }
  async function session(req) {
    const token = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("hack_session="))
      ?.slice(13);
    if (!token) return null;
    const r = await pool.query(
      "SELECT u.id,u.email,u.name,u.role,s.active_team_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
      [hash(token)],
    );
    return r.rows[0] || null;
  }
  async function login(req, res, user, teamId = "default") {
    const token = randomBytes(32).toString("hex");
    await pool.query("DELETE FROM sessions WHERE expires_at<now()");
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at,active_team_id) VALUES($1,$2,now()+interval '14 days',$3)",
      [hash(token), user.id, teamId],
    );
    const secure =
      req.headers["x-forwarded-proto"]?.split(",")[0] === "https" ||
      !!req.socket.encrypted;
    res.setHeader(
      "Set-Cookie",
      `hack_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1209600${secure ? "; Secure" : ""}`,
    );
    send(res, 200, { user, activeTeamId: teamId });
  }
  return async (req, res, path) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        const origin = req.headers.origin;
        const host = req.headers.host;
        if (!origin || new URL(origin).host !== host)
          fail(403, "Requests must come from this application.");
        if (req.headers["content-type"]?.split(";")[0] !== "application/json")
          fail(415, "Use application/json.");
      }
      if (path === "/api/config" && req.method === "GET") {
        const count = await pool.query("SELECT count(*) FROM users");
        return send(res, 200, {
          database: !!pool,
          setupRequired: Number(count.rows[0].count) === 0,
        });
      }
      if (path === "/api/setup" && req.method === "POST") {
        throttle(req, "setup");
        const body = await json(req);
        if (
          !setupToken ||
          typeof body.token !== "string" ||
          !safeEqual(body.token, setupToken)
        )
          fail(403, "The setup token is incorrect or not configured.");
        const fields = accountInput(body);
        const client = await pool.connect();
        let user;
        try {
          await client.query("BEGIN");
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtext('hack-first-user'))",
          );
          const count = await client.query("SELECT count(*) FROM users");
          if (Number(count.rows[0].count) > 0)
            fail(
              409,
              "The first coach has already been created. Sign in or use an invitation.",
            );
          const r = await client.query(
            "INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,'coach') RETURNING id,email,name,role",
            [
              randomUUID(),
              fields.email,
              fields.name,
              await passwordHash(body.password),
            ],
          );
          user = r.rows[0];
          await client.query(
            "INSERT INTO team_memberships(team_id,user_id,role) VALUES('default',$1,'coach')",
            [user.id],
          );
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
        return await login(req, res, user);
      }
      if (path === "/api/login" && req.method === "POST") {
        throttle(req, "login");
        const body = await json(req);
        if (
          typeof body.email !== "string" ||
          typeof body.password !== "string" ||
          body.password.length > 256
        )
          fail(400, "Enter your email and password.");
        const r = await pool.query("SELECT * FROM users WHERE email=$1", [
          body.email.trim().toLowerCase(),
        ]);
        const user = r.rows[0];
        if (
          !user ||
          !(await passwordMatches(body.password, user.password_hash))
        )
          fail(401, "Email or password is incorrect.");
        const { password_hash, ...safe } = user;
        const membership = await pool.query(
          "SELECT team_id FROM team_memberships WHERE user_id=$1 ORDER BY team_id LIMIT 1",
          [safe.id],
        );
        if (!membership.rowCount) fail(403, "No team membership.");
        return await login(req, res, safe, membership.rows[0].team_id);
      }
      if (path === "/api/accept-invite" && req.method === "POST") {
        throttle(req, "invite");
        const body = await json(req);
        if (typeof body.token !== "string")
          fail(400, "Invitation token is required.");
        const client = await pool.connect();
        let user;
        try {
          await client.query("BEGIN");
          const invitation = await client.query(
            "SELECT * FROM invitations WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
            [hash(body.token)],
          );
          if (!invitation.rowCount)
            fail(400, "This invitation is invalid, expired, or already used.");
          const i = invitation.rows[0];
          const existing = await client.query(
            "SELECT * FROM users WHERE email=$1",
            [i.email],
          );
          if (existing.rowCount) {
            if (
              typeof body.password !== "string" ||
              body.password.length > 256 ||
              !(await passwordMatches(
                body.password,
                existing.rows[0].password_hash,
              ))
            )
              fail(
                401,
                "Use your existing account password to join this team.",
              );
            const { password_hash, ...safe } = existing.rows[0];
            user = safe;
          } else {
            const fields = accountInput({ ...body, email: i.email });
            const r = await client.query(
              "INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,email,name,role",
              [
                randomUUID(),
                fields.email,
                fields.name,
                await passwordHash(body.password),
                i.role,
              ],
            );
            user = r.rows[0];
          }
          await client.query(
            "INSERT INTO team_memberships(team_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(team_id,user_id) DO NOTHING",
            [i.team_id, user.id, i.role],
          );
          user.active_team_id = i.team_id;
          await client.query(
            "UPDATE invitations SET used_at=now() WHERE token_hash=$1",
            [hash(body.token)],
          );
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
        return await login(req, res, user, user.active_team_id);
      }
      const user = await session(req);
      if (!user) fail(401, "Sign in to access team data.");
      const memberships = await pool.query(
        "SELECT t.id,t.name,m.role FROM teams t JOIN team_memberships m ON m.team_id=t.id WHERE m.user_id=$1 ORDER BY t.created_at,t.id",
        [user.id],
      );
      const teams = memberships.rows;
      const requested = req.headers["x-team-id"] || user.active_team_id;
      const active = teams.find((t) => t.id === requested);
      if (path === "/api/me" && req.method === "GET") {
        const team =
          active || teams.find((t) => t.id === user.active_team_id) || teams[0];
        if (!team) fail(403, "You have no team membership.");
        return send(res, 200, {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: team.role,
          },
          teams,
          activeTeamId: team.id,
        });
      }
      if (path === "/api/teams" && req.method === "GET")
        return send(res, 200, { teams });
      if (path === "/api/teams" && req.method === "POST") {
        if (!teams.some((t) => t.role === "coach"))
          fail(403, "Only coaches can create teams.");
        const body = await json(req);
        if (
          typeof body.name !== "string" ||
          !body.name.trim() ||
          body.name.trim().length > 100
        )
          fail(400, "Enter a team name of 1–100 characters.");
        const client = await pool.connect();
        const id = randomUUID();
        try {
          await client.query("BEGIN");
          await client.query("INSERT INTO teams(id,name) VALUES($1,$2)", [
            id,
            body.name.trim(),
          ]);
          await client.query(
            "INSERT INTO team_memberships(team_id,user_id,role) VALUES($1,$2,'coach')",
            [id, user.id],
          );
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
        return send(res, 201, {
          team: { id, name: body.name.trim(), role: "coach" },
        });
      }
      const teamRoute = path.match(/^\/api\/teams\/([^/]+)(\/select)?$/);
      if (teamRoute) {
        const team = teams.find(
          (t) => t.id === decodeURIComponent(teamRoute[1]),
        );
        if (!team) fail(403, "You do not belong to this team.");
        if (teamRoute[2] && req.method === "POST") {
          const token = req.headers.cookie
            ?.split(";")
            .map((s) => s.trim())
            .find((s) => s.startsWith("hack_session="))
            ?.slice(13);
          await pool.query(
            "UPDATE sessions SET active_team_id=$1 WHERE token_hash=$2",
            [team.id, hash(token)],
          );
          return send(res, 200, { team });
        }
        if (!teamRoute[2] && req.method === "PATCH") {
          if (team.role !== "coach")
            fail(403, "Only this team’s coaches can rename it.");
          const body = await json(req);
          if (
            typeof body.name !== "string" ||
            !body.name.trim() ||
            body.name.trim().length > 100
          )
            fail(400, "Enter a team name of 1–100 characters.");
          await pool.query("UPDATE teams SET name=$1 WHERE id=$2", [
            body.name.trim(),
            team.id,
          ]);
          return send(res, 200, { team: { ...team, name: body.name.trim() } });
        }
      }
      if (!active) fail(403, "You do not belong to this team.");
      const teamId = active.id;
      user.role = active.role;
      if (path === "/api/logout" && req.method === "POST") {
        const token = req.headers.cookie
          ?.split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("hack_session="))
          ?.slice(13);
        if (token)
          await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
            hash(token),
          ]);
        res.setHeader(
          "Set-Cookie",
          "hack_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
        );
        return send(res, 200, { ok: true });
      }
      if (path === "/api/games" && req.method === "GET") {
        const client = await pool.connect();
        try {
          await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
          const rows = await client.query(
            "SELECT id FROM games WHERE team_id=$1 ORDER BY updated_at DESC",
            [teamId],
          );
          const games = [];
          for (const row of rows.rows)
            games.push(await readGame(client, row.id, teamId));
          await client.query("COMMIT");
          return send(res, 200, { games });
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      }
      if (user.role !== "coach")
        fail(403, "Only coaches can change team data.");
      if (path === "/api/invites" && req.method === "POST") {
        const body = await json(req);
        if (
          typeof body.email !== "string" ||
          !/^\S+@\S+\.\S+$/.test(body.email) ||
          !["coach", "player"].includes(body.role)
        )
          fail(400, "Enter an email and choose coach or player.");
        const email = body.email.trim().toLowerCase();
        const existing = await pool.query(
          "SELECT 1 FROM users u JOIN team_memberships m ON m.user_id=u.id WHERE u.email=$1 AND m.team_id=$2",
          [email, teamId],
        );
        if (existing.rowCount)
          fail(409, "This person already belongs to this team.");
        const token = randomBytes(32).toString("hex");
        await pool.query(
          "INSERT INTO invitations(token_hash,email,role,created_by,expires_at,team_id) VALUES($1,$2,$3,$4,now()+interval '7 days',$5)",
          [hash(token), email, body.role, user.id, teamId],
        );
        return send(res, 201, { token, email, role: body.role });
      }
      if (path === "/api/users" && req.method === "GET") {
        const users = await pool.query(
          "SELECT u.id,u.email,u.name,m.role FROM users u JOIN team_memberships m ON m.user_id=u.id WHERE m.team_id=$1 ORDER BY u.name",
          [teamId],
        );
        return send(res, 200, { users: users.rows });
      }
      if (path.startsWith("/api/games/") && req.method === "PUT") {
        const body = await json(req);
        const id = decodeURIComponent(path.slice("/api/games/".length));
        if (
          !validGame(body.game) ||
          body.game.id !== id ||
          !Number.isInteger(body.expectedRevision) ||
          body.expectedRevision < 0
        )
          fail(400, "Invalid game data or revision.");
        if (body.game.teamId && body.game.teamId !== teamId)
          fail(403, "The game belongs to another team.");
        const result = await writeGame(
          pool,
          body.game,
          body.expectedRevision,
          user.id,
          teamId,
        );
        if ("conflict" in result)
          return send(res, 409, {
            message: "This game changed on another device.",
            current: result.conflict,
          });
        return send(res, 200, result);
      }
      return send(res, 404, { message: "API route not found." });
    } catch (e) {
      if (e.code === "23505")
        return send(res, 409, {
          message: "That account or record already exists.",
        });
      const status = e.status || 500;
      if (status === 500)
        console.error("API request failed:", e.code || e.name);
      return send(res, status, {
        message:
          status === 500
            ? "The database request failed. Your local changes are preserved."
            : e.message,
      });
    }
  };
}
