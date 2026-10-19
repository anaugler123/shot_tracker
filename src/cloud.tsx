import { useEffect, useRef, useState } from "react";
import { type Game } from "./model";
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
interface SyncMeta {
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
) {
  const response = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
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
      const s = JSON.parse(localStorage.getItem("hack.store.v1") || "{}").sync;
      return {
        versions: s?.versions || {},
        pending: s?.pending || {},
        conflicts: s?.conflicts || {},
        database: s?.database,
        user: s?.user,
      };
    } catch {
      return { versions: {}, pending: {}, conflicts: {} };
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
  const [setup, setSetup] = useState(false);
  const [status, setStatus] = useState("Checking storage…");
  const [pending, setPending] = useState(Object.keys(initial.pending).length);
  const [conflicts, setConflicts] = useState(initial.conflicts);
  const running = useRef(false);
  const authSerial = useRef(0);
  const syncRef = useRef<() => Promise<void>>(async () => {});
  function commit(next: Game[], meta: SyncMeta) {
    if (blockedRef.current)
      throw new Error(
        "Device storage changed in another tab. Reload before syncing.",
      );
    localStorage.setItem(
      "hack.store.v1",
      JSON.stringify({ version: 1, games: next, sync: meta }),
    );
    state.current = { games: next, meta };
    setGames(next);
    setPending(Object.keys(meta.pending).length);
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
    const generation = authSerial.current;
    const accountId = userRef.current.id;
    try {
      setStatus("Syncing…");
      const incoming = (await api("/games")) as { games: RecordVersion[] };
      if (
        generation !== authSerial.current ||
        accountId !== userRef.current?.id
      )
        return;
      let { games: local, meta } = state.current;
      meta = {
        ...meta,
        versions: { ...meta.versions },
        pending: { ...meta.pending },
        conflicts: { ...meta.conflicts },
      };
      for (const remote of incoming.games) {
        const id = remote.game.id;
        const existing = local.find((g) => g.id === id);
        const queued = meta.pending[id];
        if (queued) {
          if (stable(queued) === stable(remote.game)) {
            delete meta.pending[id];
            delete meta.conflicts[id];
            meta.versions[id] = remote.revision;
            local = local.map((g) => (g.id === id ? remote.game : g));
          } else if ((meta.versions[id] || 0) !== remote.revision)
            meta.conflicts[id] = remote;
        } else if (
          existing &&
          !existing.sample &&
          ((meta.versions[id] === undefined &&
            stable(existing) !== stable(remote.game)) ||
            (editor.current === id &&
              meta.versions[id] !== undefined &&
              meta.versions[id] !== remote.revision))
        ) {
          meta.pending[id] = existing;
          meta.conflicts[id] = remote;
        } else {
          meta.versions[id] = remote.revision;
          local = existing
            ? local.map((g) => (g.id === id ? remote.game : g))
            : [remote.game, ...local];
        }
      }
      commit(local, meta);
      if (userRef.current?.role === "coach")
        for (const id of Object.keys(state.current.meta.pending)) {
          if (state.current.meta.conflicts[id]) continue;
          const attempted = state.current.meta.pending[id];
          const revision = state.current.meta.versions[id] || 0;
          try {
            const result = (await api(
              "/games/" + encodeURIComponent(id),
              { game: attempted, expectedRevision: revision },
              "PUT",
            )) as RecordVersion;
            if (
              generation !== authSerial.current ||
              accountId !== userRef.current?.id
            )
              return;
            const current = state.current;
            const updated = {
              ...current.meta,
              versions: { ...current.meta.versions, [id]: result.revision },
              pending: { ...current.meta.pending },
            };
            const unchanged = stable(updated.pending[id]) === stable(attempted);
            if (unchanged) delete updated.pending[id];
            commit(
              unchanged
                ? current.games.map((g) => (g.id === id ? result.game : g))
                : current.games,
              updated,
            );
          } catch (e) {
            const error = e as Error & {
              status?: number;
              data?: { current: RecordVersion };
            };
            if (error.status === 409 && error.data?.current) {
              const current = state.current;
              commit(current.games, {
                ...current.meta,
                conflicts: {
                  ...current.meta.conflicts,
                  [id]: error.data.current,
                },
              });
            } else throw e;
          }
        }
      const count = Object.keys(state.current.meta.pending).length;
      setStatus(
        Object.keys(state.current.meta.conflicts).length
          ? "Sync needs review"
          : count
            ? `${count} game${count === 1 ? "" : "s"} waiting to sync`
            : "Synced with team database",
      );
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        setUser(null);
        userRef.current = null;
        setStatus("Sign in to sync");
      } else setStatus("Saved on device · sync unavailable");
    } finally {
      running.current = false;
    }
  }
  syncRef.current = sync;
  async function refresh() {
    if (blockedRef.current) return;
    const generation = authSerial.current;
    try {
      const response = await fetch("/api/config", { cache: "no-store" });
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
      state.current.meta.database = true;
      const me = await api("/me");
      if (generation !== authSerial.current) return;
      if (userRef.current?.id !== me.user.id) authSerial.current++;
      setUser(me.user);
      userRef.current = me.user;
      commit(state.current.games, {
        ...state.current.meta,
        user: me.user,
        database: true,
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
      onError("Only coaches can edit shared team games.");
      return false;
    }
    try {
      const meta = {
        ...state.current.meta,
        pending: { ...state.current.meta.pending },
        versions: { ...state.current.meta.versions },
      };
      for (const g of next)
        if (
          !g.sample &&
          stable(g) !== stable(state.current.games.find((x) => x.id === g.id))
        )
          meta.pending[g.id] = g;
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
        if (!g.sample && !meta.versions[g.id]) meta.pending[g.id] = g;
      commit(current.games, meta);
      void syncRef.current();
    } catch {
      onError("Could not prepare local games for upload.");
    }
  }
  function resolveConflict(id: string, keepLocal: boolean) {
    const current = state.current;
    const remote = current.meta.conflicts[id];
    if (!remote) return;
    const meta = {
      ...current.meta,
      versions: { ...current.meta.versions, [id]: remote.revision },
      pending: { ...current.meta.pending },
      conflicts: { ...current.meta.conflicts },
    };
    delete meta.conflicts[id];
    if (!keepLocal) delete meta.pending[id];
    try {
      commit(
        keepLocal
          ? current.games
          : current.games.map((g) => (g.id === id ? remote.game : g)),
        meta,
      );
      void syncRef.current();
    } catch {
      onError("Could not save the conflict resolution.");
    }
  }
  async function logout() {
    const previous = userRef.current;
    authSerial.current++;
    userRef.current = null;
    try {
      await api("/logout", {});
      setUser(null);
      userRef.current = null;
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
    conflicts,
    save,
    refresh,
    sync: () => void syncRef.current(),
    uploadLocal,
    resolveConflict,
    logout,
    localCount: games.filter(
      (g) => !g.sample && !state.current.meta.versions[g.id],
    ).length,
  };
}
export function SignIn({
  setup,
  onSuccess,
}: {
  setup: boolean;
  onSuccess: () => Promise<void>;
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
            ? "Choose your name and password. Your invitation determines your role."
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
              await api("/" + action, {
                ...data,
                ...(invite ? { token: invite } : {}),
              });
              if (invite) history.replaceState({}, "", location.pathname);
              await onSuccess();
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
              <input name="name" autoComplete="name" required maxLength={100} />
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
                  <option value="player">Player · view team data</option>
                  <option value="coach">
                    Coach · edit games and invite accounts
                  </option>
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
        <p className="helper">
          Players can view the team’s games, charts, and video review. Ask a
          coach for editing access.
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
