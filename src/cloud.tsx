import { useEffect, useRef, useState } from "react";
import { type Game, type Team, teamOf, gameKey } from "./model";
export interface User {
  id: string;
  name: string;
  email: string;
  role: "coach" | "player";
}
interface RecordVersion {
  game: Game;
  revision: number;
}
let apiTeamId = "default";
interface SyncMeta {
  teams?: Team[];
  activeTeamId?: string;
  database?: boolean;
  user?: User;
  versions: Record<string, number>;
  pending: Record<string, Game>;
  conflicts: Record<string, RecordVersion>;
}
export const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([k]) => k !== "sample")
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
export async function api(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  teamId = apiTeamId,
) {
  const response = await fetch("/api" + path, {
    method,
    headers: {
      "X-Team-Id": teamId,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.message || "Request failed."), {
      status: response.status,
      data,
    });
  return data;
}
export function useCloudStore({
  games,
  setGames,
  onError,
  activeEditorId,
  blocked,
}: {
  games: Game[];
  setGames: (g: Game[]) => void;
  onError: (s: string) => void;
  activeEditorId: string | null;
  blocked: boolean;
}) {
  const [initial] = useState<SyncMeta>(() => {
    try {
      const s =
        JSON.parse(localStorage.getItem("hack.store.v1") || "{}").sync || {};
      const migrateKeys = (record: Record<string, unknown> = {}) =>
        Object.fromEntries(
          Object.entries(record).map(([key, v]) => [
            key.includes("::") ? key : "default::" + key,
            v,
          ]),
        );
      return {
        ...s,
        versions: migrateKeys(s.versions),
        pending: migrateKeys(s.pending),
        conflicts: migrateKeys(s.conflicts),
        teams: s.teams?.length
          ? s.teams
          : [
              {
                id: "default",
                name: "Our team",
                role: s.user?.role || "coach",
              },
            ],
        activeTeamId: s.activeTeamId || "default",
      } as SyncMeta;
    } catch {
      return {
        versions: {},
        pending: {},
        conflicts: {},
        teams: [{ id: "default", name: "Our team", role: "coach" }],
        activeTeamId: "default",
      };
    }
  });
  const state = useRef({ games, meta: initial });
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const editor = useRef(activeEditorId);
  editor.current = activeEditorId;
  const [mode, setMode] = useState<"checking" | "local" | "cloud">(
    initial.database ? "cloud" : "checking",
  );
  const [user, setUser] = useState<User | null>(initial.user || null);
  const userRef = useRef(user);
  userRef.current = user;
  const [teams, setTeams] = useState<Team[]>(initial.teams!);
  const [activeTeamId, setActiveTeamId] = useState(initial.activeTeamId!);
  const active = useRef(activeTeamId);
  active.current = activeTeamId;
  apiTeamId = activeTeamId;
  const [setup, setSetup] = useState(false);
  const [status, setStatus] = useState("Checking storage…");
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(initial.conflicts);
  const running = useRef(false);
  const authSerial = useRef(0);
  const syncRef = useRef<() => Promise<void>>(async () => {});
  function commit(next: Game[], meta: SyncMeta) {
    if (blockedRef.current)
      throw Error("Reload this page before syncing changes from another tab.");
    localStorage.setItem(
      "hack.store.v1",
      JSON.stringify({ version: 1, games: next, sync: meta }),
    );
    state.current = { games: next, meta };
    setGames(next);
    if (meta.teams) setTeams(meta.teams);
    if (meta.activeTeamId) {
      setActiveTeamId(meta.activeTeamId);
      active.current = meta.activeTeamId;
      apiTeamId = meta.activeTeamId;
    }
    setPending(
      Object.values(meta.pending).filter((g) => teamOf(g) === active.current)
        .length,
    );
    setConflicts({ ...meta.conflicts });
  }
  async function sync() {
    if (
      running.current ||
      !userRef.current ||
      blockedRef.current ||
      !navigator.onLine
    )
      return;
    running.current = true;
    const generation = authSerial.current,
      accountId = userRef.current.id,
      teamId = active.current;
    const stale = () =>
      generation !== authSerial.current ||
      accountId !== userRef.current?.id ||
      teamId !== active.current;
    try {
      setStatus("Syncing…");
      const incoming = (await api("/games", undefined, "GET", teamId)) as {
        games: RecordVersion[];
      };
      if (stale()) return;
      let { games: local, meta } = state.current;
      meta = {
        ...meta,
        versions: { ...meta.versions },
        pending: { ...meta.pending },
        conflicts: { ...meta.conflicts },
      };
      for (const remote of incoming.games) {
        remote.game.teamId = teamId;
        const key = gameKey(remote.game);
        const existing = local.find((g) => gameKey(g) === key);
        const queued = meta.pending[key];
        if (queued) {
          if (stable({ ...queued, teamId }) === stable(remote.game)) {
            delete meta.pending[key];
            delete meta.conflicts[key];
            meta.versions[key] = remote.revision;
            local = local.map((g) => (gameKey(g) === key ? remote.game : g));
          } else if ((meta.versions[key] || 0) !== remote.revision)
            meta.conflicts[key] = remote;
        } else if (
          existing &&
          !existing.sample &&
          ((meta.versions[key] === undefined &&
            stable({ ...existing, teamId }) !== stable(remote.game)) ||
            (editor.current === remote.game.id &&
              meta.versions[key] !== undefined &&
              meta.versions[key] !== remote.revision))
        ) {
          meta.pending[key] = { ...existing, teamId };
          meta.conflicts[key] = remote;
        } else {
          meta.versions[key] = remote.revision;
          local = existing
            ? local.map((g) => (gameKey(g) === key ? remote.game : g))
            : [remote.game, ...local];
        }
      }
      commit(local, meta);
      if (userRef.current?.role === "coach")
        for (const key of Object.keys(state.current.meta.pending)) {
          if (stale()) return;
          const attempted = state.current.meta.pending[key];
          if (teamOf(attempted) !== teamId || state.current.meta.conflicts[key])
            continue;
          const revision = state.current.meta.versions[key] || 0;
          try {
            const result = (await api(
              "/games/" + encodeURIComponent(attempted.id),
              { game: { ...attempted, teamId }, expectedRevision: revision },
              "PUT",
              teamId,
            )) as RecordVersion;
            if (stale()) return;
            const current = state.current;
            const updated = {
              ...current.meta,
              versions: { ...current.meta.versions, [key]: result.revision },
              pending: { ...current.meta.pending },
            };
            const unchanged =
              stable({ ...updated.pending[key], teamId }) ===
              stable({ ...attempted, teamId });
            if (unchanged) delete updated.pending[key];
            commit(
              unchanged
                ? current.games.map((g) =>
                    gameKey(g) === key ? result.game : g,
                  )
                : current.games,
              updated,
            );
          } catch (e) {
            const error = e as Error & {
              status?: number;
              data?: { current: RecordVersion };
            };
            if (error.status === 409 && error.data?.current) {
              if (stale()) return;
              const current = state.current;
              commit(current.games, {
                ...current.meta,
                conflicts: {
                  ...current.meta.conflicts,
                  [key]: error.data.current,
                },
              });
            } else throw e;
          }
        }
      const remaining = Object.values(state.current.meta.pending).filter(
        (g) => teamOf(g) === teamId,
      ).length;
      setStatus(
        Object.values(state.current.meta.conflicts).some(
          (c) => teamOf(c.game) === teamId,
        )
          ? "Sync needs review"
          : remaining
            ? `${remaining} games waiting to sync`
            : "Synced with team database",
      );
    } catch (e) {
      if (stale()) return;
      if ((e as { status?: number }).status === 401) {
        setUser(null);
        userRef.current = null;
        setStatus("Sign in to sync");
      } else setStatus("Saved on device · sync unavailable");
    } finally {
      running.current = false;
      if (
        (generation !== authSerial.current || teamId !== active.current) &&
        userRef.current
      )
        queueMicrotask(() => void syncRef.current());
    }
  }
  syncRef.current = sync;
  async function refresh(teamId?: string) {
    if (blockedRef.current) return;
    const generation = authSerial.current;
    try {
      const response = await fetch("/api/config", {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        setMode("local");
        setStatus("Saved on this device");
        return;
      }
      if (!response.ok) throw Error();
      const config = await response.json();
      if (!config.database) {
        setMode("local");
        setStatus("Saved on this device");
        return;
      }
      setMode("cloud");
      setSetup(config.setupRequired);
      const me = await api("/me", undefined, "GET", teamId || active.current);
      if (generation !== authSerial.current) return;
      if (
        userRef.current?.id !== me.user.id ||
        active.current !== me.activeTeamId
      )
        authSerial.current++;
      setUser(me.user);
      userRef.current = me.user;
      commit(state.current.games, {
        ...state.current.meta,
        database: true,
        user: me.user,
        teams: me.teams,
        activeTeamId: me.activeTeamId,
      });
      await syncRef.current();
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        setUser(null);
        userRef.current = null;
        setStatus("Sign in to access team data");
      } else
        setStatus(
          initial.database
            ? "Offline · saved on device"
            : "Saved on this device",
        );
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (userRef.current) void syncRef.current();
      else void refresh();
    }, 15000);
    const online = () => void refresh();
    window.addEventListener("online", online);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
    };
  }, []);
  function save(next: Game[]) {
    if (mode === "cloud" && userRef.current?.role !== "coach") {
      onError("Only this team’s coaches can edit games.");
      return false;
    }
    try {
      const current = state.current;
      const meta = {
        ...current.meta,
        pending: { ...current.meta.pending },
        versions: { ...current.meta.versions },
      };
      for (const g of next) {
        const key = gameKey(g);
        if (
          teamOf(g) === active.current &&
          !g.sample &&
          stable({ ...g, teamId: teamOf(g) }) !==
            stable(current.games.find((x) => gameKey(x) === key))
        )
          meta.pending[key] = g;
      }
      commit(next, meta);
      setStatus(
        mode === "cloud"
          ? "Saved on device · waiting to sync"
          : "Saved on this device",
      );
      if (mode === "cloud") queueMicrotask(() => void syncRef.current());
      return true;
    } catch {
      onError(
        "Could not save on this device. Export a backup before continuing.",
      );
      return false;
    }
  }
  function uploadLocal() {
    try {
      const current = state.current;
      const meta = { ...current.meta, pending: { ...current.meta.pending } };
      for (const g of current.games)
        if (
          teamOf(g) === active.current &&
          !g.sample &&
          !meta.versions[gameKey(g)]
        )
          meta.pending[gameKey(g)] = { ...g, teamId: active.current };
      commit(current.games, meta);
      void syncRef.current();
    } catch {
      onError("Could not prepare local games for upload.");
    }
  }
  function resolveConflict(key: string, keepLocal: boolean) {
    const current = state.current;
    const remote = current.meta.conflicts[key];
    if (!remote || teamOf(remote.game) !== active.current) return;
    const meta = {
      ...current.meta,
      versions: { ...current.meta.versions, [key]: remote.revision },
      pending: { ...current.meta.pending },
      conflicts: { ...current.meta.conflicts },
    };
    delete meta.conflicts[key];
    if (!keepLocal) delete meta.pending[key];
    try {
      commit(
        keepLocal
          ? current.games
          : current.games.map((g) => (gameKey(g) === key ? remote.game : g)),
        meta,
      );
      void syncRef.current();
    } catch {
      onError("Could not save the conflict resolution.");
    }
  }
  async function selectTeam(id: string) {
    const team = teams.find((t) => t.id === id);
    if (!team) throw Error("Team not found.");
    authSerial.current++;
    if (mode === "cloud" && navigator.onLine)
      await api("/teams/" + encodeURIComponent(id) + "/select", {});
    const nextUser = userRef.current
      ? { ...userRef.current, role: team.role }
      : null;
    userRef.current = nextUser;
    setUser(nextUser);
    commit(state.current.games, {
      ...state.current.meta,
      activeTeamId: id,
      ...(nextUser ? { user: nextUser } : {}),
    });
    setStatus(mode === "cloud" ? "Syncing…" : "Saved on this device");
    await syncRef.current();
  }
  async function createTeam(name: string) {
    name = name.trim();
    if (!name || name.length > 100)
      throw Error("Enter a team name of 1–100 characters.");
    const team: Team =
      mode === "cloud"
        ? (await api("/teams", { name })).team
        : { id: crypto.randomUUID(), name, role: "coach" };
    commit(state.current.games, {
      ...state.current.meta,
      teams: [...teams, team],
    });
    await selectTeamFromNew(team);
  }
  async function selectTeamFromNew(team: Team) {
    authSerial.current++;
    if (mode === "cloud")
      await api("/teams/" + encodeURIComponent(team.id) + "/select", {});
    const nextUser = userRef.current
      ? { ...userRef.current, role: team.role }
      : null;
    setUser(nextUser);
    userRef.current = nextUser;
    commit(state.current.games, {
      ...state.current.meta,
      activeTeamId: team.id,
      ...(nextUser ? { user: nextUser } : {}),
    });
    await syncRef.current();
  }
  async function renameTeam(name: string) {
    name = name.trim();
    if (!name || name.length > 100)
      throw Error("Enter a team name of 1–100 characters.");
    if (mode === "cloud")
      await api(
        "/teams/" + encodeURIComponent(active.current),
        { name },
        "PATCH",
      );
    commit(state.current.games, {
      ...state.current.meta,
      teams: state.current.meta.teams?.map((t) =>
        t.id === active.current ? { ...t, name } : t,
      ),
    });
  }
  async function logout() {
    const previous = userRef.current;
    authSerial.current++;
    userRef.current = null;
    try {
      await api("/logout", {});
      setUser(null);
      const meta = { ...state.current.meta };
      delete meta.user;
      commit(state.current.games, meta);
      setStatus("Signed out");
    } catch {
      userRef.current = previous;
      onError("Sign out needs an internet connection.");
    }
  }
  return {
    mode,
    user,
    setup,
    status,
    pending,
    conflicts: Object.fromEntries(
      Object.entries(conflicts).filter(
        ([, c]) => teamOf(c.game) === activeTeamId,
      ),
    ),
    save,
    refresh,
    sync: () => void syncRef.current(),
    uploadLocal,
    resolveConflict,
    logout,
    teams,
    activeTeamId,
    selectTeam,
    createTeam,
    renameTeam,
    canCreateTeam: mode !== "cloud" || teams.some((t) => t.role === "coach"),
    localCount: games.filter(
      (g) =>
        teamOf(g) === activeTeamId &&
        !g.sample &&
        !state.current.meta.versions[gameKey(g)],
    ).length,
  };
}
export function SignIn({
  setup,
  onSuccess,
}: {
  setup: boolean;
  onSuccess: (teamId?: string) => Promise<void>;
}) {
  const [invite] = useState(
    () => new URLSearchParams(location.search).get("invite") || "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const action = invite ? "accept-invite" : setup ? "setup" : "login";
  return (
    <div className="account-screen">
      <section className="panel account-card">
        <h1>
          {invite
            ? "Join your team"
            : setup
              ? "Create the first coach account"
              : "Sign in"}
        </h1>
        <p>
          {invite
            ? "New account: choose your name and password. Already registered: use your existing account password."
            : setup
              ? "Use the setup token configured in Railway. Only the first coach uses this step."
              : "Use your individual team account."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const data = Object.fromEntries(new FormData(e.currentTarget));
            try {
              const result = await api("/" + action, {
                ...data,
                ...(invite ? { token: invite } : {}),
              });
              if (invite) history.replaceState({}, "", location.pathname);
              await onSuccess(invite ? result.activeTeamId : undefined);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {setup && !invite && (
            <label>
              Setup token
              <input name="token" type="password" autoComplete="off" required />
            </label>
          )}
          {action !== "login" && (
            <label>
              Name
              <input
                name="name"
                autoComplete="name"
                required={!invite}
                maxLength={100}
              />
            </label>
          )}
          {!invite && (
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
          )}
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={
                action === "login" ? "current-password" : "new-password"
              }
              minLength={action === "login" ? undefined : 12}
              maxLength={256}
              required
            />
          </label>
          {action !== "login" && (
            <p className="helper">Use at least 12 characters.</p>
          )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <button className="button primary full-width" disabled={busy}>
            {busy
              ? "Please wait…"
              : action === "login"
                ? "Sign in"
                : invite
                  ? "Join team"
                  : "Create account"}
          </button>
        </form>
      </section>
    </div>
  );
}
export function TeamAccounts({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => Promise<void>;
}) {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [members, setMembers] = useState<User[]>([]);
  useEffect(() => {
    if (user.role === "coach")
      api("/users")
        .then((r) => setMembers(r.users))
        .catch((e) => setError(e.message));
  }, [user.role]);
  return (
    <section className="panel accounts-panel">
      <div className="chart-heading">
        <h1>Team accounts</h1>
        <p>
          {user.name} · {user.email} · {user.role}
        </p>
      </div>
      <button className="button secondary" onClick={() => void onLogout()}>
        Sign out
      </button>
      {user.role === "coach" ? (
        <>
          <h2>Invite a coach or player</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const data = Object.fromEntries(new FormData(e.currentTarget));
              try {
                const r = await api("/invites", data);
                const url = new URL(location.origin);
                url.searchParams.set("invite", r.token);
                setLink(url.toString());
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <div className="form-grid">
              <label>
                Email
                <input type="email" name="email" required />
              </label>
              <label>
                Role
                <select name="role">
                  <option value="player">Player</option>
                  <option value="coach">Coach</option>
                </select>
              </label>
            </div>
            <button className="button primary">Create invitation</button>
          </form>
          {link && (
            <label>
              Invitation link · valid for 7 days
              <input value={link} readOnly onFocus={(e) => e.target.select()} />
              <small>
                Share this link with the intended person. It can be used once.
                No email has been sent automatically.
              </small>
            </label>
          )}
          <h2>Members</h2>
          <ul>
            {members.map((m) => (
              <li key={m.id}>
                {m.name} · {m.email} · {m.role}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <></>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
