import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileSpreadsheet,
  Flag,
  LayoutGrid,
  LoaderCircle,
  MonitorPlay,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Upload,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import {
  positions,
  turns,
  draws,
  hits,
  executions,
  deficiencies,
  reviews,
  emptyShot,
  percentage,
  total,
  hammerAt,
  nextShot,
  timeLabel,
  parseTime,
  sameGame,
  saveGames,
  decodeBackup,
  teamOf,
  groupGames,
  type GameSort,
  type Game,
  type Shot,
} from "./model";
import { type ImportResult } from "./importer";
import sample from "./sample.json";
import "./style.css";
import { VideoRoom } from "./VideoReview";
import { TeamCharts, GameDashboard } from "./PerformanceCharts";
import { useCloudStore, SignIn, TeamAccounts } from "./cloud";
import { Dashboard } from "./Dashboard";
import { TeamSettings } from "./TeamSettings";

type Page =
  "Games" | "Dashboard" | "Live scoring" | "Video review" | "Team accounts";
const today = () => new Date().toLocaleDateString("en-CA");
const dateLabel = (s: string) =>
  s
    ? new Date(s + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "Date not set";
function Avatar({
  name,
  index = 0,
  small = false,
}: {
  name: string;
  index?: number;
  small?: boolean;
}) {
  return (
    <span className={`avatar a${index % 4} ${small ? "small" : ""}`}>
      {name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
function Stone({ small = false }: { small?: boolean }) {
  return (
    <img
      className={small ? "stone small-stone" : "stone"}
      src="/stone-v2.svg"
      alt=""
    />
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-title">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem("hack.store.v1");
      if (!raw) return { games: sample as Game[], error: "" };
      const s = decodeBackup(raw);
      return { games: s.games as Game[], error: "" };
    } catch {
      return {
        games: [] as Game[],
        error:
          "Saved data could not be opened. Existing browser storage has been preserved. Download a recovery copy before clearing site data.",
      };
    }
  });
  const [allGames, setAllGames] = useState<Game[]>(initial.games);
  const [page, setPage] = useState<Page>("Games");
  const [selected, setSelected] = useState(initial.games[0]?.id || "");
  const [modal, setModal] = useState<
    "new" | "import" | "restore" | "teams" | null
  >(null);
  const [dashboardScope, setDashboardScope] = useState<
    "season" | "event" | "game"
  >("season");
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ImportResult | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const [search, setSearch] = useState("");
  const [showSamples, setShowSamples] = useState(true);
  const file = useRef<HTMLInputElement>(null);
  const backupFile = useRef<HTMLInputElement>(null);
  const [restoreGames, setRestoreGames] = useState<Game[]>([]);
  const [externalChange, setExternalChange] = useState(false);
  const [videoFocus, setVideoFocus] = useState("");
  const cloud = useCloudStore({
    games: allGames,
    setGames: setAllGames,
    onError: setError,
    activeEditorId:
      page === "Live scoring" || page === "Video review" ? selected : null,
    blocked: !!initial.error || externalChange,
  });
  const games = allGames.filter((g) => teamOf(g) === cloud.activeTeamId);
  const teamName =
    cloud.teams.find((t) => t.id === cloud.activeTeamId)?.name || "Our team";
  const readOnly = cloud.mode === "cloud" && cloud.user?.role === "player";
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    registerSW({
      onOfflineReady() {
        setOfflineReady(true);
      },
    });
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const update = (e: StorageEvent) => {
      if (e.key === "hack.store.v1") {
        setExternalChange(true);
        setNotice(
          "Data changed in another tab. Reload this page before editing.",
        );
      }
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  function persist(next: Game[]) {
    if (externalChange) {
      setError(
        "Reload this page to get changes from the other tab before saving.",
      );
      return false;
    }
    if (initial.error) {
      setError(initial.error);
      return false;
    }
    try {
      const scopedNext = next.map((g) => ({
        ...g,
        teamId: cloud.activeTeamId,
      }));
      const saved = cloud.save([
        ...allGames.filter((g) => teamOf(g) !== cloud.activeTeamId),
        ...scopedNext,
      ]);
      if (saved) setError("");
      return saved;
    } catch {
      setError(
        "Your changes could not be saved. Device storage may be full or unavailable. Export a backup before continuing.",
      );
      return false;
    }
  }
  function patch(g: Game) {
    const saved = persist(games.map((x) => (x.id === g.id ? g : x)));
    if (
      saved &&
      g.status === "complete" &&
      games.find((x) => x.id === g.id)?.status === "live"
    ) {
      setDashboardScope("game");
      setPage("Dashboard");
    }
    return saved;
  }
  function openGame(id: string, p: Page = "Live scoring") {
    setSelected(id);
    if (p === "Dashboard") setDashboardScope("game");
    setPage(p);
    setSearch("");
  }
  async function restoreFile(f: File) {
    try {
      if (f.size > 15 * 1024 * 1024)
        throw new Error("Choose a backup smaller than 15 MB.");
      const decoded = decodeBackup(await f.text());
      setRestoreGames(decoded.games);
      setModal("restore");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open backup.");
    } finally {
      if (backupFile.current) backupFile.current.value = "";
    }
  }
  async function importFile(f: File) {
    if (f.size > 15 * 1024 * 1024) {
      setError("Choose an .xlsx workbook smaller than 15 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { readWorkbook } = await import("./importer");
      const result = await readWorkbook(await f.arrayBuffer(), f.name);
      setDraft(result);
      setModal("import");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not read this workbook.",
      );
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  function commitImport() {
    if (!draft) return;
    const additions = draft.games.filter(
      (g) => !games.some((x) => sameGame(x, g) && !x.sample),
    );
    if (!additions.length) {
      setError(
        "These games have already been imported. No duplicates were added.",
      );
      return;
    }
    const replaced = games.filter(
      (g) => !g.sample || !additions.some((a) => sameGame(g, a)),
    );
    if (persist([...additions, ...replaced])) {
      setNotice(
        `Imported ${additions.length} games. Your existing games were preserved.`,
      );
      setModal(null);
      setDraft(null);
      setPage("Games");
    }
  }
  function exportBackup() {
    const blob = new Blob(
      [
        initial.error
          ? localStorage.getItem("hack.store.v1") || ""
          : JSON.stringify({ version: 1, games }, null, 2),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hack-backup-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setNotice("Backup downloaded. Keep this file somewhere safe.");
  }

  const current = games.find((g) => g.id === selected) || games[0];
  const [eventFilter, setEventFilter] = useState("all");
  const [gameSort, setGameSort] = useState<GameSort>("newest");
  const filtered = [...games]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter(
      (g) =>
        (showSamples || !g.sample) &&
        (eventFilter === "all" || g.event === eventFilter) &&
        `${g.event} ${g.opponent} ${g.date}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const eventGroups = groupGames(filtered, gameSort);
  const allShots = filtered.flatMap((g) => g.shots);
  if (
    cloud.mode === "cloud" &&
    (!cloud.user || new URLSearchParams(location.search).has("invite"))
  )
    return <SignIn setup={cloud.setup} onSuccess={cloud.refresh} />;
  return (
    <div className={`app-shell ${readOnly ? "read-only" : ""}`}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Games");
          }}
        >
          <Stone />
          <span>
            hack<span className="brand-dot">.</span>
            <small>CURLING SHOT TRACKER</small>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="team-switch">
          <span className="team-icon">{teamName[0]?.toUpperCase()}</span>
          <label className="team-selector-label">
            <select
              aria-label="Active team"
              value={cloud.activeTeamId}
              onChange={async (e) => {
                try {
                  await cloud.selectTeam(e.target.value);
                  setSelected("");
                  setVideoFocus("");
                  setDashboardScope("season");
                  setEventFilter("all");
                  setSearch("");
                  setPage("Dashboard");
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              {cloud.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-button"
            aria-label="Manage teams"
            onClick={() => setModal("teams")}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
        <div className="nav-label">NAVIGATION</div>
        <nav>
          {(
            [
              ["Games", LayoutGrid],
              ["Dashboard", Activity],
              ["Live scoring", Target],
              ["Video review", MonitorPlay],
              ["Team accounts", ShieldCheck],
            ] as const
          )
            .filter(
              ([name]) =>
                !(readOnly && name === "Live scoring") &&
                !(cloud.mode !== "cloud" && name === "Team accounts"),
            )
            .map(([name, Icon]) => (
              <button
                key={name}
                className={`nav-item ${page === name ? "active" : ""}`}
                aria-label={name === "Games" ? `Games ${games.length}` : name}
                title={name}
                onClick={() => {
                  setPage(name);
                  setSearch("");
                }}
              >
                <Icon size={19} />
                <span>{name}</span>
                {name === "Games" && <em>{games.length}</em>}
              </button>
            ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-icon">
            <ShieldCheck size={19} />
          </span>
          <strong>
            {cloud.mode === "cloud"
              ? "Team database connected"
              : "Stored on this device"}
          </strong>
        </div>
        <button className="backup-button" onClick={exportBackup}>
          <ArrowDownToLine size={17} />
          <span>Export data backup</span>
        </button>
        <button
          className="backup-button restore-button"
          onClick={() => backupFile.current?.click()}
        >
          <Upload size={17} />
          <span>Restore a backup</span>
        </button>
        <div className="user">
          <span className="coach-avatar">C</span>
          <div>
            <strong>{cloud.user?.name || "Coach workspace"}</strong>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="header-right">
            <span className={`save-status ${online ? "" : "offline"}`}>
              {online ? <span className="status-dot" /> : <WifiOff size={14} />}
              <span>
                {online ? cloud.status : "Offline · saving on device"}
              </span>
            </span>
            <span className="header-divider" />
            <button
              className="icon-button"
              title="About this prototype"
              aria-label="About this prototype"
              onClick={() =>
                setNotice(
                  `Games are saved on this device. When PostgreSQL is connected, individual accounts share team data with offline sync. Export backups regularly. ${offlineReady ? "The app is cached for offline use." : "Offline app caching is available in the production build after the first visit."}`,
                )
              }
            >
              <CircleHelp size={19} />
            </button>
            <span className="coach-avatar small">C</span>
          </div>
        </header>
        <main>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {cloud.mode === "cloud" && (
            <div className="cloud-toolbar">
              <span>
                {cloud.user?.name} · {cloud.user?.role} · {cloud.status}
              </span>
              <div>
                {cloud.localCount > 0 && !readOnly && (
                  <button className="text-button" onClick={cloud.uploadLocal}>
                    Upload {cloud.localCount} device games
                  </button>
                )}
                <button className="text-button" onClick={cloud.sync}>
                  Sync now
                </button>
                <button
                  className="text-button"
                  onClick={() => setPage("Team accounts")}
                >
                  Account
                </button>
              </div>
            </div>
          )}
          {Object.entries(cloud.conflicts).map(([id, remote]) => (
            <section className="sync-conflict" key={id}>
              <h3>Sync conflict: vs. {remote.game.opponent}</h3>
              <p>
                This game changed on another device. Your local copy is
                preserved. Choose which complete game version to keep.
              </p>
              <div>
                <button
                  className="button secondary"
                  onClick={() => cloud.resolveConflict(id, false)}
                >
                  Use database version
                </button>
                {!readOnly && (
                  <button
                    className="button primary"
                    onClick={() => cloud.resolveConflict(id, true)}
                  >
                    Keep and upload my version
                  </button>
                )}
              </div>
            </section>
          ))}
          {page === "Team accounts" && cloud.user ? (
            <TeamAccounts
              key={cloud.activeTeamId}
              user={cloud.user}
              onLogout={cloud.logout}
            />
          ) : page === "Games" ? (
            <>
              <div className="page-heading">
                <div>
                  <h1>Games</h1>
                </div>
                <div className="heading-actions">
                  <button
                    className="button secondary"
                    onClick={() => file.current?.click()}
                    disabled={busy || readOnly}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Upload size={17} />
                    )}{" "}
                    Import workbook
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setModal("new")}
                    disabled={readOnly}
                  >
                    <Plus size={18} /> New game
                  </button>
                </div>
              </div>
              {games.some((g) => g.sample) && (
                <div className="sample-banner">
                  <span>
                    <span className="sample-dot" /> EXAMPLE WORKSPACE
                  </span>
                  <p>NextGen Classic example data is included.</p>
                  <button onClick={() => setShowSamples(!showSamples)}>
                    {showSamples ? "Hide examples" : "Show examples"}{" "}
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
              <TeamCharts
                games={filtered}
                onGame={(id) => openGame(id, "Dashboard")}
              />
              <div className="dashboard-grid">
                <section className="games-section">
                  <div className="section-heading">
                    <div>
                      <h2>
                        Games <span className="count">{filtered.length}</span>
                      </h2>
                    </div>
                  </div>
                  <div className="list-toolbar">
                    <div className="search">
                      <Search size={17} />
                      <input
                        aria-label="Search games"
                        placeholder="Search games, opponents, events…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Filter games by event"
                      className="event-filter"
                      value={eventFilter}
                      onChange={(e) => setEventFilter(e.target.value)}
                    >
                      <option value="all">All events</option>
                      {[...new Set(games.map((g) => g.event))]
                        .sort()
                        .map((event) => (
                          <option key={event} value={event}>
                            {event}
                          </option>
                        ))}
                    </select>
                    <select
                      aria-label="Sort games"
                      className="game-sort"
                      value={gameSort}
                      onChange={(e) => setGameSort(e.target.value as GameSort)}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="event">Event A–Z</option>
                    </select>
                  </div>
                  <div className="game-list">
                    {filtered.length ? (
                      eventGroups.map((group) => (
                        <section
                          className="event-group"
                          key={group.event}
                          aria-label={`${group.event} games`}
                        >
                          <div className="event-group-heading">
                            <h3>{group.event}</h3>
                            <span>
                              {group.games.length} game
                              {group.games.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          {group.games.map((g) => (
                            <GameCard
                              key={g.id}
                              game={g}
                              onClick={() => openGame(g.id, "Dashboard")}
                            />
                          ))}
                        </section>
                      ))
                    ) : (
                      <div className="empty">
                        <Stone />
                        <h3>No games</h3>
                        <p>
                          {search
                            ? "No games match your search."
                            : "Import a tracker or create your first game."}
                        </p>
                        <button
                          className="button secondary"
                          onClick={() => setModal("new")}
                        >
                          Create a game <Plus size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
                <aside className="dashboard-aside">
                  <div className="feature-card">
                    <div className="feature-top">
                      <span className="pill light">SCORING</span>
                      <Target size={20} />
                    </div>
                    <h2>Live scoring</h2>

                    <div className="house-art">
                      <div className="house-ring outer">
                        <div className="house-ring middle">
                          <div className="house-ring inner">
                            <div className="house-button" />
                          </div>
                        </div>
                      </div>
                      <div className="mini-stone one" />
                      <div className="mini-stone two" />
                      <div className="rink-line" />
                    </div>
                    <button
                      onClick={() => {
                        if (current) openGame(current.id);
                        else setModal("new");
                      }}
                    >
                      Open scoring workspace <ArrowRight size={17} />
                    </button>
                  </div>
                  <div className="import-card">
                    <div className="import-icon">
                      <FileSpreadsheet size={24} />
                    </div>
                    <h3>Import spreadsheets</h3>

                    <button
                      onClick={() => file.current?.click()}
                      disabled={busy}
                    >
                      Import an .xlsx workbook <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="privacy-note">
                    <ShieldCheck size={16} />
                    <p>
                      {cloud.mode === "cloud"
                        ? "Signed-in team members share database records. Offline changes stay on the device until synced."
                        : "Data is saved in this browser. Export a backup to keep a separate copy."}
                    </p>
                  </div>
                </aside>
              </div>
              <section className="roster-strip">
                <div>
                  <h2>Player statistics</h2>
                </div>
                <div className="roster-avatars">
                  {(current?.players || positions).map((n, i) => (
                    <Avatar key={i} name={n} index={i} />
                  ))}
                </div>
                <button
                  className="text-button"
                  onClick={() => setPage("Dashboard")}
                >
                  View dashboard <ArrowRight size={17} />
                </button>
              </section>
            </>
          ) : page === "Dashboard" ? (
            <Dashboard
              key={cloud.activeTeamId}
              games={games}
              teamId={cloud.activeTeamId}
              teamName={teamName}
              scope={dashboardScope}
              onScope={setDashboardScope}
              selected={selected}
              onSelect={setSelected}
              renderGame={(g) => (
                <GameDashboard
                  embedded
                  teamName={teamName}
                  game={g}
                  games={games}
                  onSelect={setSelected}
                  onScore={() => {
                    setSelected(g.id);
                    setPage("Live scoring");
                  }}
                  readOnly={readOnly}
                  onVideo={(shotId) => {
                    setSelected(g.id);
                    setVideoFocus(shotId || "");
                    setPage("Video review");
                  }}
                >
                  <Scoreboard game={g} teamName={teamName} />
                  <ScoreAnalysis game={g} />
                </GameDashboard>
              )}
              renderInsights={(list) => (
                <Insights
                  games={list}
                  onReview={(id, shotId) => {
                    setVideoFocus(shotId);
                    openGame(id, "Video review");
                  }}
                />
              )}
            />
          ) : page === "Live scoring" ? (
            current ? (
              <GameRoom
                key={cloud.activeTeamId + current.id}
                teamName={teamName}
                game={current}
                games={games}
                onSelect={setSelected}
                onChange={patch}
                onNew={() => setModal("new")}
                onReview={() => setPage("Video review")}
                onDashboard={() => openGame(current.id, "Dashboard")}
              />
            ) : (
              <EmptyStart onNew={() => setModal("new")} />
            )
          ) : current ? (
            <VideoRoom
              key={cloud.activeTeamId + current.id + "-" + videoFocus}
              focusId={videoFocus}
              readOnly={readOnly}
              game={current}
              games={games}
              onSelect={(id) => {
                setVideoFocus("");
                setSelected(id);
              }}
              onChange={patch}
            />
          ) : (
            <EmptyStart onNew={() => setModal("new")} />
          )}
          <footer>
            <span>
              <Stone small /> CURLING SHOT TRACKER
            </span>
            <span>Hack · Prototype 01</span>
          </footer>
        </main>
      </div>
      <input
        ref={file}
        type="file"
        accept=".xlsx"
        hidden
        aria-label="Import spreadsheet"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
        }}
      />
      <input
        ref={backupFile}
        type="file"
        accept=".json"
        hidden
        aria-label="Restore backup file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void restoreFile(f);
        }}
      />
      {modal === "teams" && (
        <Modal title="Teams" onClose={() => setModal(null)}>
          <TeamSettings
            name={teamName}
            readOnly={readOnly}
            canCreate={cloud.canCreateTeam}
            onRename={cloud.renameTeam}
            onCreate={async (name) => {
              await cloud.createTeam(name);
              setSelected("");
              setVideoFocus("");
              setDashboardScope("season");
              setEventFilter("all");
              setSearch("");
              setPage("Dashboard");
              setModal(null);
            }}
          />
        </Modal>
      )}
      {modal === "restore" && (
        <Modal title="Restore a data backup" onClose={() => setModal(null)}>
          <p className="modal-description">
            This backup contains {restoreGames.length} games. Only missing games
            will be added. Your existing games and corrections stay unchanged.
          </p>
          <div className="import-summary">
            <ArrowDownToLine size={24} />
            <div>
              <strong>
                {
                  restoreGames.filter(
                    (g) => !games.some((x) => !x.sample && sameGame(x, g)),
                  ).length
                }{" "}
                games to restore
              </strong>
              <p>
                {restoreGames.reduce((n, g) => n + g.shots.length, 0)} recorded
                shots in this backup
              </p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() => {
                const additions = restoreGames
                  .filter(
                    (g) => !games.some((x) => !x.sample && sameGame(x, g)),
                  )
                  .map((g) => ({ ...g, sample: false }));
                if (
                  persist([
                    ...additions,
                    ...games.filter(
                      (g) =>
                        !g.sample || !additions.some((a) => sameGame(g, a)),
                    ),
                  ])
                ) {
                  setModal(null);
                  setNotice(
                    `Restored ${additions.length} games from your backup.`,
                  );
                }
              }}
            >
              Restore missing games
            </button>
          </div>
        </Modal>
      )}
      {modal === "new" && (
        <NewGame
          players={current?.players || positions}
          onClose={() => setModal(null)}
          onSave={(g) => {
            if (persist([g, ...games])) {
              setModal(null);
              openGame(g.id);
            }
          }}
        />
      )}
      {modal === "import" && draft && (
        <ImportPreview
          draft={draft}
          games={games}
          onChange={setDraft}
          onClose={() => {
            setModal(null);
            setDraft(null);
          }}
          onImport={commitImport}
        />
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  sub,
  icon,
  highlight = false,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`stat-card ${highlight ? "highlight" : ""}`}>
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
    </div>
  );
}
function GameCard({ game: g, onClick }: { game: Game; onClick: () => void }) {
  const [us, them] = total(g);
  return (
    <button className="game-card" onClick={onClick}>
      <div className="date-tile">
        <span>
          {g.date
            ? new Date(g.date + "T12:00")
                .toLocaleDateString("en-US", { month: "short" })
                .toUpperCase()
            : "DATE"}
        </span>
        <strong>{g.date ? Number(g.date.slice(-2)) : "—"}</strong>
      </div>
      <div className="game-info">
        <span className="event-label">{g.event}</span>
        <h3>vs. {g.opponent}</h3>
        <div className="game-meta">
          <span>{g.venue || "Venue not set"}</span>
          <i />{" "}
          <span>{g.shots.filter((s) => s.score !== null).length} shots</span>
          {g.sample && <span className="sample-label">Example</span>}
        </div>
      </div>
      <div className="game-result">
        <span
          className={`pill ${g.status === "live" ? "live" : us > them ? "win" : us < them ? "loss" : "neutral"}`}
        >
          {g.status === "live"
            ? "IN PROGRESS"
            : us > them
              ? "WIN"
              : us < them
                ? "LOSS"
                : "TIED"}
        </span>
        <strong>
          {us} <span>–</span> {them}
        </strong>
      </div>
      <ChevronRight className="game-chevron" size={19} />
    </button>
  );
}
function EmptyStart({ onNew }: { onNew: () => void }) {
  return (
    <div className="empty large">
      <Stone />
      <h1>No game selected</h1>
      <p>Create a game to start scoring and reviewing shots.</p>
      <button className="button primary" onClick={onNew}>
        <Plus size={17} /> New game
      </button>
    </div>
  );
}
function NewGame({
  players,
  onClose,
  onSave,
}: {
  players: string[];
  onClose: () => void;
  onSave: (g: Game) => void;
}) {
  return (
    <Modal title="Start a new game" onClose={onClose}>
      <p className="modal-description">
        Choose the players, game length, and starting hammer.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          onSave({
            id: crypto.randomUUID(),
            event: String(d.get("event")).trim(),
            opponent: String(d.get("opponent")).trim(),
            date: String(d.get("date")),
            venue: String(d.get("venue")).trim(),
            sheet: String(d.get("sheet")).trim(),
            round: "",
            ends: Number(d.get("ends")),
            players: positions.map((_, i) =>
              String(d.get("player" + i)).trim(),
            ),
            firstHammer: d.get("hammer") === "us",
            scores: Array.from({ length: Number(d.get("ends")) + 1 }, () => ({
              us: null,
              them: null,
            })),
            shots: [],
            status: "live",
            video: "",
          });
        }}
      >
        <div className="form-grid">
          <label>
            Event
            <input
              name="event"
              required
              placeholder="e.g. Club championship"
              maxLength={100}
            />
          </label>
          <label>
            Opponent
            <input
              name="opponent"
              required
              placeholder="Team name"
              maxLength={100}
            />
          </label>
          <label>
            Date
            <input name="date" type="date" required defaultValue={today()} />
          </label>
          <label>
            Venue
            <input name="venue" placeholder="Curling club" maxLength={100} />
          </label>
          <label>
            Sheet
            <input name="sheet" placeholder="e.g. 4/D" maxLength={30} />
          </label>
          <label>
            Game length
            <select name="ends">
              <option value="8">8 ends</option>
              <option value="10">10 ends</option>
            </select>
          </label>
          <label className="full">
            Starting hammer
            <select name="hammer">
              <option value="us">Our team</option>
              <option value="them">Opponent</option>
            </select>
          </label>
        </div>
        <h3 className="form-subheading">Your lineup</h3>
        <div className="form-grid">
          {positions.map((p, i) => (
            <label key={p}>
              {p}
              <input
                name={"player" + i}
                required
                defaultValue={players[i]}
                maxLength={80}
              />
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">
            Start scoring <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ImportPreview({
  draft,
  games,
  onChange,
  onClose,
  onImport,
}: {
  draft: ImportResult;
  games: Game[];
  onChange: (d: ImportResult) => void;
  onClose: () => void;
  onImport: () => void;
}) {
  function change(index: number, update: Partial<Game>) {
    onChange({
      ...draft,
      games: draft.games.map((g, i) => (i === index ? { ...g, ...update } : g)),
    });
  }
  const [originalScores] = useState(
    () =>
      new Map(draft.games.map((g) => [g.id, g.scores.map((s) => ({ ...s }))])),
  );
  const duplicates = draft.games.filter((g) =>
    games.some((x) => !x.sample && sameGame(x, g)),
  ).length;
  return (
    <Modal title="Review your workbook" onClose={onClose} wide>
      <div className="import-summary">
        <span className="import-icon">
          <FileSpreadsheet size={24} />
        </span>
        <div>
          <strong>{draft.filename}</strong>
          <p>
            {draft.games.length} games ·{" "}
            {draft.games.reduce(
              (a, g) => a + g.shots.filter((s) => s.score !== null).length,
              0,
            )}{" "}
            scored shots ·{" "}
            {duplicates
              ? `${duplicates} duplicates will be skipped`
              : "Ready for your review"}
          </p>
        </div>
        <CheckCircle2 size={23} />
      </div>
      <h3 className="form-subheading">Confirm the lineup</h3>
      <div className="form-grid">
        {positions.map((p, i) => (
          <label key={p}>
            {p}
            <input
              value={draft.games[0].players[i]}
              onChange={(e) =>
                onChange({
                  ...draft,
                  games: draft.games.map((g) => ({
                    ...g,
                    players: g.players.map((n, k) =>
                      k === i ? e.target.value : n,
                    ),
                  })),
                })
              }
            />
          </label>
        ))}
      </div>
      <h3 className="form-subheading">Confirm dates & completed ends</h3>
      <p className="helper">
        Blank and unplayed ends are different. Ends beyond your selection will
        be left unplayed. Shots are retained.
      </p>
      <div className="import-games">
        {draft.games.map((g, i) => (
          <div className="import-game" key={g.id}>
            <div>
              <strong>vs. {g.opponent}</strong>
              <small>
                {g.shots.filter((s) => s.score !== null).length} scored shots
              </small>
            </div>
            <label>
              Date
              <input
                type="date"
                aria-label={`Date for ${g.opponent}`}
                value={g.date}
                onChange={(e) => change(i, { date: e.target.value })}
              />
            </label>
            <label>
              Last completed end
              <select
                aria-label={`Last completed end for ${g.opponent}`}
                value={g.scores.reduce(
                  (last, s, i) =>
                    s.us !== null || s.them !== null ? i + 1 : last,
                  0,
                )}
                onChange={(e) =>
                  change(i, {
                    scores: g.scores.map((s, k) =>
                      k < Number(e.target.value)
                        ? {
                            us: s.us ?? originalScores.get(g.id)?.[k]?.us ?? 0,
                            them:
                              s.them ??
                              originalScores.get(g.id)?.[k]?.them ??
                              0,
                          }
                        : { us: null, them: null },
                    ),
                  })
                }
              >
                {Array.from({ length: g.ends + 2 }, (_, n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "Unknown" : n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              First hammer
              <select
                aria-label={`Starting hammer for ${g.opponent}`}
                value={g.firstHammer ? "us" : "them"}
                onChange={(e) =>
                  change(i, { firstHammer: e.target.value === "us" })
                }
              >
                <option value="us">Our team</option>
                <option value="them">Opponent</option>
              </select>
            </label>
          </div>
        ))}
      </div>
      {draft.warnings.length > 0 && (
        <details className="import-warnings" open>
          <summary>{draft.warnings.length} import notes</summary>
          <ul>
            {draft.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={
            draft.games.some(
              (g) => !g.date || g.players.some((p) => !p.trim()),
            ) || duplicates === draft.games.length
          }
          onClick={onImport}
        >
          <Check size={17} /> Import {draft.games.length - duplicates} games
        </button>
      </div>
    </Modal>
  );
}
function GamePicker({
  game,
  games,
  onSelect,
}: {
  game: Game;
  games: Game[];
  onSelect: (id: string) => void;
}) {
  return (
    <select
      className="game-picker"
      aria-label="Select game"
      value={game.id}
      onChange={(e) => onSelect(e.target.value)}
    >
      {games.map((g) => (
        <option value={g.id} key={g.id}>
          vs. {g.opponent} · {g.event}
        </option>
      ))}
    </select>
  );
}
function GameRoom({
  game: g,
  games,
  onSelect,
  onChange,
  onNew,
  onReview,
  onDashboard,
  teamName = "Our team",
}: {
  teamName?: string;
  onDashboard: () => void;
  game: Game;
  games: Game[];
  onSelect: (id: string) => void;
  onChange: (g: Game) => boolean;
  onNew: () => void;
  onReview: () => void;
}) {
  const [edit, setEdit] = useState<Shot | null>(null);
  const [end, setEnd] = useState(Math.min(nextShot(g).end, g.ends + 1));
  const [advanceEnd, setAdvanceEnd] = useState(false);
  const [finishRequested, setFinishRequested] = useState(false);
  const [scoreModal, setScoreModal] = useState(false);
  const [toast, setToast] = useState("");
  const suggested = nextShot(g);
  const current = edit || suggested;
  const endShots = g.shots
    .filter((s) => s.end === end)
    .sort((a, b) => a.position - b.position || a.stone - b.stone);
  return (
    <>
      <div className="page-heading compact">
        <div>
          <h1>Live scoring</h1>
          <p>
            {g.event} <span className="inline-dot">·</span> {dateLabel(g.date)}{" "}
            <span className="inline-dot">·</span> {g.venue}
          </p>
        </div>
        <div className="heading-actions">
          <GamePicker game={g} games={games} onSelect={onSelect} />
          <button className="button secondary" onClick={onNew}>
            <Plus size={17} /> New game
          </button>
        </div>
      </div>
      <Scoreboard
        game={g}
        teamName={teamName}
        onEndClick={(e) => {
          setEnd(e);
          setScoreModal(true);
        }}
      />
      <div className="room-toolbar">
        <div className="live-label">
          <span
            className={`status-dot ${g.status === "live" ? "pulse" : ""}`}
          />
          {g.status === "live" ? "GAME IN PROGRESS" : "GAME REVIEW"}
          {g.sample && <span className="sample-label">EXAMPLE DATA</span>}
        </div>
        <div>
          <button className="text-button" onClick={onDashboard}>
            Game dashboard
          </button>
          <button className="text-button" onClick={onReview}>
            <Video size={16} /> Video review
          </button>
          <button
            className="button secondary small-button"
            onClick={() => {
              if (g.status === "complete") {
                onChange({ ...g, status: "live" });
                return;
              }
              const latest = Math.max(1, ...g.shots.map((s) => s.end));
              if (
                g.shots.length &&
                (g.scores[latest - 1]?.us === null ||
                  g.scores[latest - 1]?.them === null)
              ) {
                setEnd(latest);
                setAdvanceEnd(false);
                setFinishRequested(true);
                setScoreModal(true);
              } else onChange({ ...g, status: "complete" });
            }}
          >
            {g.status === "live" ? "Finish game" : "Reopen game"}
          </button>
        </div>
      </div>
      {toast && (
        <div className="inline-success" role="status">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
      <div className="scoring-grid">
        <section className="panel shot-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                {edit ? "EDIT RECORDED SHOT" : "UP NEXT"}
              </span>
              <h2>{edit ? "Update shot" : "Record a shot"}</h2>
            </div>
            <span className="shot-code">{current.id}</span>
          </div>
          <ShotForm
            key={g.id + "-" + current.id + "-" + (edit ? "edit" : "new")}
            game={g}
            shot={current}
            onSelect={setEdit}
            editing={!!edit}
            onCancel={() => setEdit(null)}
            onSave={(s) => {
              const exists = g.shots.some((x) => x.id === s.id);
              const shots = [...g.shots.filter((x) => x.id !== s.id), s];
              if (onChange({ ...g, shots })) {
                setEdit(null);
                setEnd(s.end);
                if (
                  !exists &&
                  (shots.filter((x) => x.end === s.end).length === 8 ||
                    (s.position === 3 && s.stone === 2)) &&
                  g.scores[s.end - 1]?.us === null
                ) {
                  setAdvanceEnd(true);
                  setScoreModal(true);
                }
                setToast(
                  `${s.id} ${exists ? "updated" : "saved"} on this device.`,
                );
              }
            }}
          />
        </section>
        <section className="panel end-panel">
          <div className="panel-heading">
            <div>
              <h2>Shot log</h2>
            </div>
            <select
              aria-label="Shot log end"
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
            >
              {Array.from({ length: g.ends + 1 }, (_, i) => (
                <option key={i} value={i + 1}>
                  End {i + 1}
                  {i === g.ends ? " (extra)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="end-summary">
            <span>{endShots.length} / 8 shots recorded</span>
            <strong>
              {percentage(endShots) !== null ? percentage(endShots) + "%" : "—"}{" "}
              <small>shooting</small>
            </strong>
          </div>
          <div className="shot-log">
            {Array.from({ length: 8 }, (_, i) => {
              const p = Math.floor(i / 2),
                stone = (i % 2) + 1;
              const s = endShots.find(
                (x) => x.position === p && x.stone === stone,
              );
              return (
                <button
                  key={i}
                  className={`log-row ${s ? "" : "unrecorded"}`}
                  onClick={() => {
                    setEdit(s || emptyShot(end, p, stone));
                    setToast("");
                  }}
                >
                  <Avatar name={g.players[p]} index={p} small />
                  <div>
                    <strong>
                      {g.players[p]}{" "}
                      <small>· {stone === 1 ? "1st" : "2nd"} stone</small>
                    </strong>
                    <span>
                      {s
                        ? `${s.turn} · ${s.type || "Unclassified"}`
                        : "Not recorded — tap to enter"}
                    </span>
                  </div>
                  {s ? (
                    <span className={`score-badge score-${s.score ?? "none"}`}>
                      {s.score ?? "—"}
                      <small>/5</small>
                    </span>
                  ) : (
                    <Plus size={16} />
                  )}
                </button>
              );
            })}
          </div>
          <button
            className="end-score-button"
            onClick={() => setScoreModal(true)}
          >
            Update end {end} score <ArrowRight size={17} />
          </button>
        </section>
      </div>
      <ScoreAnalysis game={g} />
      {scoreModal && (
        <EndScoreModal
          game={g}
          end={end}
          advance={advanceEnd}
          finishRequested={finishRequested}
          onClose={() => {
            setFinishRequested(false);
            setScoreModal(false);
            setAdvanceEnd(false);
          }}
          onSave={(scores, finish = false, continueToNext = true) => {
            if (
              onChange({ ...g, scores, status: finish ? "complete" : g.status })
            ) {
              setScoreModal(false);
              setFinishRequested(false);
              if (advanceEnd && continueToNext && !finish && end < g.ends + 1) {
                setEnd(end + 1);
                setEdit(emptyShot(end + 1, 0, 1));
              }
              setAdvanceEnd(false);
              setToast(
                finish
                  ? "Game finished. Open the game dashboard to review performance."
                  : `End ${end} score saved.${advanceEnd ? " Ready for the next end." : ""}`,
              );
            }
          }}
        />
      )}
    </>
  );
}
function ShotForm({
  game: g,
  shot,
  editing,
  onSave,
  onSelect,
  onCancel,
}: {
  game: Game;
  shot: Shot;
  editing: boolean;
  onSave: (s: Shot) => void;
  onSelect: (s: Shot) => void;
  onCancel: () => void;
}) {
  const [s, setS] = useState({ ...shot });
  const [unscored, setUnscored] = useState(shot.score === null && !!shot.note);
  const [error, setError] = useState("");
  const [stamp, setStamp] = useState(timeLabel(shot.timestamp));
  function update(p: Partial<Shot>) {
    setS((x) => ({ ...x, ...p }));
  }
  const options = s.kind === "Draw" ? draws : hits;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const ts = parseTime(stamp);
        if (Number.isNaN(ts)) {
          setError("Use m:ss or h:mm:ss for the video timestamp.");
          return;
        }
        if (
          !unscored &&
          (!s.turn ||
            !s.type ||
            !s.execution ||
            s.score === null ||
            !s.deficiency)
        ) {
          setError(
            "Choose a turn, shot type, execution, score, and deficiency.",
          );
          return;
        }
        if (unscored && !s.note.trim()) {
          setError("Add a note explaining why this shot is unscored.");
          return;
        }
        setError("");
        onSave({ ...s, score: unscored ? null : s.score, timestamp: ts });
      }}
    >
      <div className="shot-selectors">
        <label>
          End
          <select
            aria-label="Shot end"
            value={s.end}
            onChange={(e) => {
              const n = Number(e.target.value);
              onSelect(
                g.shots.find(
                  (x) => x.id === emptyShot(n, s.position, s.stone).id,
                ) || emptyShot(n, s.position, s.stone),
              );
            }}
          >
            {Array.from({ length: g.ends + 1 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
                {i === g.ends ? " · Extra" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Player
          <select
            aria-label="Shot player"
            value={s.position}
            onChange={(e) => {
              const p = Number(e.target.value);
              onSelect(
                g.shots.find((x) => x.id === emptyShot(s.end, p, s.stone).id) ||
                  emptyShot(s.end, p, s.stone),
              );
            }}
          >
            {g.players.map((p, i) => (
              <option value={i} key={i}>
                {p} · {positions[i]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stone
          <select
            aria-label="Shot stone"
            value={s.stone}
            onChange={(e) => {
              const st = Number(e.target.value);
              onSelect(
                g.shots.find(
                  (x) => x.id === emptyShot(s.end, s.position, st).id,
                ) || emptyShot(s.end, s.position, st),
              );
            }}
          >
            <option value={1}>First</option>
            <option value={2}>Second</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Turn / target</legend>
        <div className="choice-grid turns">
          {turns.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={s.turn === t}
              className={`choice ${s.turn === t ? "selected" : ""}`}
              onClick={() => update({ turn: t })}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Shot type</legend>
        <div className="segmented">
          <button
            type="button"
            className={s.kind === "Draw" ? "selected" : ""}
            onClick={() =>
              update({ kind: "Draw", type: s.kind === "Draw" ? s.type : "" })
            }
          >
            Draw
          </button>
          <button
            type="button"
            className={s.kind === "Hit" ? "selected" : ""}
            onClick={() =>
              update({ kind: "Hit", type: s.kind === "Hit" ? s.type : "" })
            }
          >
            Hit
          </button>
        </div>
        <div className="choice-grid types">
          {options.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={s.type === t}
              className={`choice ${s.type === t ? "selected" : ""}`}
              onClick={() => update({ type: t })}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <fieldset>
          <legend>Execution</legend>
          <div className="choice-grid execution">
            {executions.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={s.execution === t}
                className={`choice ${s.execution === t ? "selected" : ""}`}
                onClick={() => update({ execution: t })}
              >
                {t === "Xmiss" ? "Miss (Xmiss)" : t}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>
            Shot score <span>0–5</span>
          </legend>
          <div className="score-choices">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                aria-label={`Score ${n}`}
                aria-pressed={s.score === n && !unscored}
                disabled={unscored}
                className={s.score === n && !unscored ? "selected" : ""}
                onClick={() => update({ score: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <fieldset>
        <legend>Deficiency / outcome</legend>
        <div className="choice-grid deficiencies">
          {deficiencies.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={s.deficiency === t}
              className={`choice ${s.deficiency === t ? "selected" : ""}`}
              onClick={() => update({ deficiency: t })}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <details className="shot-details" open={undefined}>
        <summary>
          Review flag, notes & video <ChevronDown size={15} />
        </summary>
        <div className="form-grid">
          <label>
            Mark for review
            <select
              value={s.review}
              onChange={(e) => update({ review: e.target.value })}
            >
              <option value="">No flag</option>
              {reviews.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Video timestamp
            <input
              value={stamp}
              onChange={(e) => setStamp(e.target.value)}
              placeholder="m:ss or h:mm:ss"
            />
          </label>
        </div>
        <label className="note-label">
          Coach’s note
          <textarea
            value={s.note}
            onChange={(e) => update({ note: e.target.value })}
            placeholder="Shot notes…"
            rows={2}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={unscored}
            onChange={(e) => setUnscored(e.target.checked)}
          />{" "}
          Unscored shot (pick, burnt rock, or throw-through)
        </label>
      </details>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="shot-actions">
        {editing && (
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel edit
          </button>
        )}
        <button className="button primary">
          {g.shots.some((x) => x.id === s.id)
            ? "Update shot"
            : "Save & next shot"}{" "}
          <ArrowRight size={17} />
        </button>
      </div>
    </form>
  );
}
function Scoreboard({
  game: g,
  onEndClick,
  teamName = "Our team",
}: {
  teamName?: string;
  game: Game;
  onEndClick?: (n: number) => void;
}) {
  const [us, them] = total(g);
  return (
    <section className="scoreboard">
      <div className="scoreboard-title">
        <Stone small />
        <strong>vs. {g.opponent}</strong>
        <span>{g.ends} ends</span>
      </div>
      <div className="scoreboard-scroll">
        <table>
          <thead>
            <tr>
              <th>TEAM</th>
              {g.scores.map((_, i) => (
                <th key={i}>
                  {onEndClick ? (
                    <button
                      aria-label={`Edit end ${i + 1} score`}
                      onClick={() => onEndClick(i + 1)}
                    >
                      {i === g.ends ? "EX" : i + 1}
                    </button>
                  ) : i === g.ends ? (
                    "EX"
                  ) : (
                    i + 1
                  )}
                </th>
              ))}
              <th className="total-col">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {[teamName, g.opponent].map((name, i) => (
              <tr key={i}>
                <th>
                  <span className={`team-dot ${i ? "opponent" : ""}`} />
                  {name}
                </th>
                {g.scores.map((s, k) => (
                  <td
                    key={k}
                    className={
                      (i === 0 ? s.us : s.them) === null ? "unplayed" : ""
                    }
                  >
                    {(i === 0 ? s.us : s.them) ?? "–"}
                  </td>
                ))}
                <td className="total-col">{i === 0 ? us : them}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScoreAnalysis({ game: g }: { game: Game }) {
  let us = 0,
    them = 0;
  let hammer = g.firstHammer;
  const states = [{ label: "Start", us: 0, them: 0, hammer }];
  for (let i = 0; i < g.scores.length; i++) {
    const s = g.scores[i];
    if (s.us === null || s.them === null) break;
    us += s.us;
    them += s.them;
    if (s.us > 0) hammer = false;
    else if (s.them > 0) hammer = true;
    states.push({ label: `After end ${i + 1}`, us, them, hammer });
  }
  const advantage = states.filter(
    (s) => s.us > s.them || (s.us === s.them && s.hammer),
  ).length;
  return (
    <section className="panel analysis-panel">
      <div className="panel-heading">
        <div>
          <h2>Score and hammer by end</h2>
        </div>
        <span className="pill neutral">
          {Math.round((advantage / states.length) * 100)}% IN ADVANTAGE
        </span>
      </div>
      <div className="position-timeline">
        {states.map((s, i) => (
          <div
            className={`position-state ${s.us > s.them || (s.us === s.them && s.hammer) ? "advantage" : ""}`}
            key={i}
          >
            <small>{s.label}</small>
            <strong>
              {s.us} – {s.them}
            </strong>
            <span>{s.hammer ? "With hammer" : "Without hammer"}</span>
          </div>
        ))}
      </div>
      <p className="analysis-caption">
        {advantage} / {states.length} positions in advantage
      </p>
    </section>
  );
}

function EndScoreModal({
  game: g,
  end,
  onClose,
  onSave,
  advance = false,
  finishRequested = false,
}: {
  game: Game;
  end: number;
  onClose: () => void;
  onSave: (
    scores: Game["scores"],
    finish?: boolean,
    continueToNext?: boolean,
  ) => void;
  advance?: boolean;
  finishRequested?: boolean;
}) {
  const existing = g.scores[end - 1];
  const [us, setUs] = useState(existing?.us ?? 0);
  const [them, setThem] = useState(existing?.them ?? 0);
  const [side, setSide] = useState<"us" | "them">(
    (existing?.them ?? 0) > 0 ? "them" : "us",
  );
  const [error, setError] = useState("");
  const hammer = hammerAt(g, end);
  function save(finish = false, clear = false) {
    if (
      ![us, them].every((n) => Number.isInteger(n) && n >= 0 && n <= 8) ||
      (us > 0 && them > 0)
    ) {
      setError("Only one team can score, from 0 to 8 points.");
      return;
    }
    onSave(
      g.scores.map((s, i) =>
        i === end - 1 ? (clear ? { us: null, them: null } : { us, them }) : s,
      ),
      finish || finishRequested,
      !clear,
    );
  }
  const [beforeUs, beforeThem] = total({
    ...g,
    scores: g.scores.filter((_, i) => i !== end - 1),
  });
  const tied = beforeUs + us === beforeThem + them;
  return (
    <Modal title={`End ${end} score`} onClose={onClose}>
      <p className="modal-description">
        {advance ? "End complete. Enter the score to continue. " : ""}
        {hammer === null ? "" : `Hammer: ${hammer ? "our team" : g.opponent}.`}
      </p>
      <div className="end-score-preview">
        <span>
          Our team<strong>{us}</strong>
        </span>
        <span>–</span>
        <span>
          {g.opponent}
          <strong>{them}</strong>
        </span>
      </div>
      <div className="end-team-picker">
        <button
          className={`choice ${side === "us" ? "selected" : ""}`}
          onClick={() => setSide("us")}
        >
          Our team scored
        </button>
        <button
          className={`choice ${side === "them" ? "selected" : ""}`}
          onClick={() => setSide("them")}
        >
          {g.opponent} scored
        </button>
      </div>
      <div className="end-points-picker">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <button
            key={n}
            aria-label={`${n} point${n === 1 ? "" : "s"} for ${side === "us" ? "our team" : "opponent"}`}
            className={`choice ${(side === "us" ? us : them) === n ? "selected" : ""}`}
            onClick={() => {
              setUs(side === "us" ? n : 0);
              setThem(side === "them" ? n : 0);
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <button
        className={`blank-end choice ${us === 0 && them === 0 ? "selected" : ""}`}
        onClick={() => {
          setUs(0);
          setThem(0);
        }}
      >
        Blank end · 0–0
      </button>
      <details className="manual-end-score">
        <summary>Type the score</summary>
        <div className="form-grid">
          <label>
            Our team
            <input
              aria-label="Our team end score"
              type="number"
              min={0}
              max={8}
              value={us}
              onChange={(e) => {
                setUs(Number(e.target.value));
                setThem(0);
              }}
            />
          </label>
          <label>
            {g.opponent}
            <input
              aria-label="Opponent end score"
              type="number"
              min={0}
              max={8}
              value={them}
              onChange={(e) => {
                setThem(Number(e.target.value));
                setUs(0);
              }}
            />
          </label>
        </div>
      </details>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="text-button" onClick={() => save(false, true)}>
          {finishRequested ? "Finish without this end score" : "Clear score"}
        </button>
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          onClick={() => save(advance && end >= g.ends && !tied)}
        >
          {finishRequested
            ? "Save & finish game"
            : advance
              ? end >= g.ends && !tied
                ? "Save & finish game"
                : end < g.ends
                  ? "Save & next end"
                  : end === g.ends
                    ? "Save & extra end"
                    : "Save end score"
              : "Save end score"}
          <Check size={17} />
        </button>
      </div>
    </Modal>
  );
}
function Insights({
  games,
  onReview,
}: {
  games: Game[];
  onReview: (id: string, shotId: string) => void;
}) {
  const names = Array.from(new Set(games.flatMap((g) => g.players)));
  const [player, setPlayer] = useState("all");
  const [event, setEvent] = useState("all");
  const [kind, setKind] = useState("all");
  const [turn, setTurn] = useState("all");
  const [flagged, setFlagged] = useState(false);
  const records = games
    .filter((g) => event === "all" || g.event === event)
    .flatMap((g) => g.shots.map((s) => ({ s, g })))
    .filter(
      ({ s, g }) =>
        (player === "all" || g.players[s.position] === player) &&
        (kind === "all" || s.kind === kind) &&
        (turn === "all" || s.turn === turn) &&
        (!flagged || !!s.review),
    );
  const shots = records.map((r) => r.s);
  const misses = shots.filter(
    (s) => s.score !== null && s.deficiency && s.deficiency !== "Make",
  );
  const breakdown = deficiencies
    .filter((s) => s !== "Make")
    .map((label) => ({
      label,
      count: misses.filter((s) => s.deficiency === label).length,
    }));
  const types = [...draws, ...hits]
    .map((label) => ({ label, shots: shots.filter((s) => s.type === label) }))
    .filter((x) => x.shots.length);
  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Shot analysis</h2>
        </div>
        <span className="pill neutral">TEAM-WIDE VIEW</span>
      </div>
      <div className="filter-bar">
        <label>
          Player
          <select value={player} onChange={(e) => setPlayer(e.target.value)}>
            <option value="all">All players</option>
            {names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Event
          <select value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="all">All events</option>
            {Array.from(new Set(games.map((g) => g.event))).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Shot family
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All shot types</option>
            <option>Draw</option>
            <option>Hit</option>
          </select>
        </label>
        <label>
          Turn / target
          <select value={turn} onChange={(e) => setTurn(e.target.value)}>
            <option value="all">All turns</option>
            {turns.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={flagged}
            onChange={(e) => setFlagged(e.target.checked)}
          />{" "}
          Flagged only
        </label>
      </div>
      <div className="stat-grid three">
        <Stat
          label="SHOOTING PERCENTAGE"
          value={percentage(shots) === null ? "—" : percentage(shots) + "%"}
          sub={`${shots.filter((s) => s.score !== null).length} scored shots · weighted out of 5`}
          icon={<Target size={19} />}
          highlight
        />
        <Stat
          label="MADE SHOTS"
          value={shots.filter((s) => s.execution === "Make").length}
          sub={`Of ${shots.length} recorded shots`}
          icon={<CheckCircle2 size={19} />}
        />
        <Stat
          label="FLAGGED FOR REVIEW"
          value={shots.filter((s) => s.review).length}
          sub="Shots marked for review"
          icon={<Flag size={19} />}
        />
      </div>
      <div className="insights-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Shooting percentage by type</h2>
            </div>
          </div>
          {types.length ? (
            types.map(({ label, shots }) => (
              <div className="bar-row" key={label}>
                <div>
                  <strong>{label}</strong>
                  <span>
                    {shots.filter((s) => s.score !== null).length} scored shots
                  </span>
                </div>
                <div className="bar-track">
                  <div style={{ width: `${percentage(shots) || 0}%` }} />
                </div>
                <strong>
                  {percentage(shots) ?? "—"}
                  {percentage(shots) !== null ? "%" : ""}
                </strong>
              </div>
            ))
          ) : (
            <p className="helper">No shots match these filters.</p>
          )}
        </section>
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Deficiency counts</h2>
            </div>
          </div>
          {breakdown.map(({ label, count }) => (
            <div className="tendency-row" key={label}>
              <span>{label}</span>
              <div className="bar-track">
                <div
                  style={{
                    width: `${misses.length ? (count / misses.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <strong>{count}</strong>
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Matching shots <span className="count">{records.length}</span>
            </h2>
          </div>
        </div>
        <ShotTable records={records} onClick={(g, s) => onReview(g.id, s.id)} />
      </section>
    </>
  );
}
function ShotTable({
  records,
  onClick,
}: {
  records: { s: Shot; g: Game }[];
  onClick: (g: Game, s: Shot) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="shots-table">
        <thead>
          <tr>
            <th>PLAYER / SHOT</th>
            <th>GAME</th>
            <th>TYPE / TURN</th>
            <th>EXECUTION</th>
            <th>SCORE</th>
            <th>DEFICIENCY</th>
            <th>REVIEW</th>
          </tr>
        </thead>
        <tbody>
          {records.map(({ s, g }) => (
            <tr key={g.id + s.id} onClick={() => onClick(g, s)}>
              <td>
                <button
                  className="table-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClick(g, s);
                  }}
                >
                  {g.players[s.position]}{" "}
                  <small>
                    End {s.end} · {s.id}
                  </small>
                </button>
              </td>
              <td>
                vs. {g.opponent}
                <small>{dateLabel(g.date)}</small>
              </td>
              <td>
                {s.type || "Unclassified"}
                <small>{s.turn || "Not set"}</small>
              </td>
              <td>{s.execution || "—"}</td>
              <td>
                <span className={`score-badge score-${s.score ?? "none"}`}>
                  {s.score ?? "—"}
                  <small>/5</small>
                </span>
              </td>
              <td>{s.deficiency || "—"}</td>
              <td>
                {s.review ? (
                  <span className="review-flag">
                    <Flag size={12} />
                    {s.review}
                  </span>
                ) : s.timestamp !== null ? (
                  <span className="video-stamp">
                    <Video size={13} />
                    {timeLabel(s.timestamp)}
                  </span>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!records.length && (
        <div className="empty">
          <p>No shots match this selection.</p>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
