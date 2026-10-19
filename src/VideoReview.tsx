import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  ExternalLink,
  Flag,
  Play,
  Video,
} from "lucide-react";
import {
  groupGames,
  parseTime,
  reviews,
  timeLabel,
  videoId,
  type Game,
  type Shot,
} from "./model";
import { YouTubePlayer, type VideoPlayer } from "./YouTubePlayer";

export function VideoRoom({
  game: g,
  games,
  onSelect,
  onChange,
  focusId,
  readOnly = false,
}: {
  readOnly?: boolean;
  game: Game;
  games: Game[];
  onSelect: (id: string) => void;
  onChange: (g: Game) => boolean;
  focusId?: string;
}) {
  const ordered = [...g.shots].sort(
    (a, b) => a.end - b.end || a.position - b.position || a.stone - b.stone,
  );
  const initial = ordered.find((s) => s.id === focusId) || ordered[0] || null;
  const [selectedId, setSelectedId] = useState(initial?.id || "");
  const shot = g.shots.find((s) => s.id === selectedId) || null;
  const [time, setTime] = useState(timeLabel(initial?.timestamp ?? null));
  const [note, setNote] = useState(initial?.note || "");
  const [review, setReview] = useState(initial?.review || "");
  const [url, setUrl] = useState(g.video);
  const [editingLink, setEditingLink] = useState(!g.video);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [playerFilter, setPlayerFilter] = useState("all");
  const [endFilter, setEndFilter] = useState("all");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [playerState, setPlayerState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [leadIn, setLeadIn] = useState(5);
  const player = useRef<VideoPlayer | null>(null);
  const shotList = useRef<HTMLDivElement>(null);
  const pendingSeek = useRef<number | null>(
    initial?.timestamp === null
      ? null
      : Math.max(0, (initial?.timestamp ?? 0) - 5),
  );
  const [pendingSelection, setPendingSelection] = useState<Shot | null>(null);
  const id = videoId(g.video);
  const queue = ordered.filter(
    (s) =>
      (playerFilter === "all" || s.position === Number(playerFilter)) &&
      (endFilter === "all" || s.end === Number(endFilter)) &&
      (!onlyFlagged || !!s.review) &&
      (!onlyUnlinked || s.timestamp === null),
  );
  const index = queue.findIndex((s) => s.id === selectedId);
  const previous = index > 0 ? queue[index - 1] : null;
  const next = index >= 0 && index < queue.length - 1 ? queue[index + 1] : null;
  const dirty =
    !!shot &&
    (time !== timeLabel(shot.timestamp) ||
      note !== shot.note ||
      review !== shot.review);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (
      playerState === "ready" &&
      pendingSeek.current !== null &&
      player.current
    ) {
      player.current.seekTo(pendingSeek.current, true);
      pendingSeek.current = null;
    }
  }, [playerState]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    const list = shotList.current;
    const item = list?.querySelector<HTMLButtonElement>(
      `[data-shot-id="${selectedId}"]`,
    );
    if (!list || !item) return;
    const bounds = list.getBoundingClientRect(),
      row = item.getBoundingClientRect();
    if (row.bottom > bounds.bottom)
      list.scrollTop += row.bottom - bounds.bottom;
    else if (row.top < bounds.top + 32)
      list.scrollTop -= bounds.top + 32 - row.top;
  }, [selectedId, playerFilter, endFilter, onlyFlagged, onlyUnlinked]);
  function choose(s: Shot, force = false) {
    if (s.id === selectedId) return;
    if (dirty && !force) {
      setPendingSelection(s);
      return;
    }
    setSelectedId(s.id);
    setTime(timeLabel(s.timestamp));
    setNote(s.note);
    setReview(s.review);
    setError("");
    setMessage("");
    setPendingSelection(null);
    if (s.timestamp !== null) {
      const at = Math.max(0, s.timestamp - leadIn);
      if (player.current) {
        player.current.seekTo(at, true);
        player.current.playVideo();
      } else pendingSeek.current = at;
    }
  }
  function save(advance = false) {
    if (!shot || readOnly) return false;
    const timestamp = parseTime(time);
    if (Number.isNaN(timestamp)) {
      setError("Use m:ss or h:mm:ss for the timestamp.");
      return false;
    }
    const updated = { ...shot, timestamp, note, review };
    if (
      !onChange({
        ...g,
        shots: g.shots.map((s) => (s.id === shot.id ? updated : s)),
      })
    )
      return false;
    setError("");
    setMessage(`Shot ${shot.id} saved on this device.`);
    if (advance && next) choose(next, true);
    return true;
  }
  function capture(advance: boolean) {
    if (!shot || readOnly || !player.current || playerState !== "ready") return;
    const current = player.current.getCurrentTime();
    if (!Number.isFinite(current) || current < 0) {
      setError("The video time is not available. Enter a timestamp manually.");
      return;
    }
    const timestamp = Math.floor(current);
    if (!advance) {
      setTime(timeLabel(timestamp));
      setMessage("Video time captured. Save when ready.");
      return;
    }
    const updated = { ...shot, timestamp, note, review };
    if (
      onChange({
        ...g,
        shots: g.shots.map((s) => (s.id === shot.id ? updated : s)),
      })
    ) {
      setError("");
      setTime(timeLabel(timestamp));
      setMessage(`Shot ${shot.id} saved.`);
      if (next) choose(next, true);
    }
  }
  function playShot() {
    if (!shot || shot.timestamp === null || !player.current) return;
    player.current.seekTo(Math.max(0, shot.timestamp - leadIn), true);
    player.current.playVideo();
  }
  function changeFilter(update: () => void) {
    if (dirty) {
      setError("Save or discard your changes before changing filters.");
      return;
    }
    update();
  }
  const ends = [...new Set(ordered.map((s) => s.end))];
  return (
    <div className="review-page">
      <div className="page-heading compact">
        <div>
          <h1>Video review</h1>
          <p>
            {g.event} · vs. {g.opponent}
          </p>
        </div>
        <select
          className="game-picker"
          aria-label="Select game"
          value={g.id}
          onChange={(e) => {
            if (dirty) {
              setError("Save or discard your changes before switching games.");
              return;
            }
            onSelect(e.target.value);
          }}
        >
          {groupGames(games).map((group) => (
            <optgroup label={group.event} key={group.event}>
              {group.games.map((game) => (
                <option value={game.id} key={game.id}>
                  vs. {game.opponent}
                  {game.date ? " · " + game.date : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="review-workspace">
        <section className="review-player-column">
          <div className="panel review-video">
            <div className="review-video-header">
              <strong>
                <Video size={16} /> Game video
              </strong>
              {g.video && (
                <div>
                  <a href={g.video} target="_blank" rel="noreferrer">
                    Open on YouTube <ExternalLink size={13} />
                  </a>
                  <button
                    className="text-button"
                    disabled={readOnly}
                    onClick={() => setEditingLink(!editingLink)}
                  >
                    {editingLink ? "Close" : "Change link"}
                  </button>
                </div>
              )}
            </div>
            {editingLink && !readOnly && (
              <form
                className="video-url"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!videoId(url.trim())) {
                    setError("Enter a valid YouTube video or livestream URL.");
                    return;
                  }
                  if (onChange({ ...g, video: url.trim() })) {
                    setEditingLink(false);
                    setError("");
                    setMessage("Video link saved.");
                  }
                }}
              >
                <label>
                  YouTube game stream
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=…"
                    required
                  />
                </label>
                <button className="button primary">
                  {g.video ? "Update link" : "Attach video"}
                </button>
              </form>
            )}
            <div className="video-container">
              {id && online ? (
                <>
                  <YouTubePlayer
                    id={id}
                    online={online}
                    initialTime={pendingSeek.current ?? 0}
                    player={player}
                    onStatus={setPlayerState}
                  />
                  {playerState !== "ready" && (
                    <div className="player-status">
                      {playerState === "loading"
                        ? "Loading YouTube player…"
                        : "YouTube could not load this video. Open it on YouTube and enter timestamps manually."}
                    </div>
                  )}
                </>
              ) : (
                <div className="video-placeholder">
                  <Video size={30} />
                  <h3>
                    {id ? "Video unavailable offline" : "Attach a game video"}
                  </h3>
                  <p>
                    {id
                      ? "You can still review and edit saved shot details."
                      : "Add a YouTube link above. Select a shot, find it in the video, then capture the current time."}
                  </p>
                </div>
              )}
            </div>
            {shot && (
              <div className="review-quickbar" data-position={shot.position}>
                <div className="quick-shot-label">
                  <span className="shot-code">{shot.id}</span>
                  <div>
                    <strong>{g.players[shot.position]}</strong>
                    <small>
                      End {shot.end} · {shot.type}{" "}
                      {shot.timestamp !== null
                        ? `· ${timeLabel(shot.timestamp)}`
                        : ""}
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Previous video shot"
                    disabled={!previous}
                    onClick={() => previous && choose(previous)}
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Next video shot"
                    disabled={!next}
                    onClick={() => next && choose(next)}
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>
                <button
                  className="button primary capture-next"
                  type="button"
                  disabled={readOnly || playerState !== "ready" || !online}
                  onClick={() => capture(true)}
                >
                  <Clock3 size={16} /> Capture time, save{next ? " & next" : ""}
                </button>
              </div>
            )}
            <div className="review-playback-controls">
              <label>
                Pre-roll
                <select
                  aria-label="Video pre-roll"
                  value={leadIn}
                  onChange={(e) => setLeadIn(Number(e.target.value))}
                >
                  <option value={0}>0 seconds</option>
                  <option value={5}>5 seconds</option>
                  <option value={10}>10 seconds</option>
                  <option value={15}>15 seconds</option>
                </select>
              </label>
              <button
                className="button secondary"
                disabled={
                  playerState !== "ready" ||
                  !shot ||
                  shot.timestamp === null ||
                  !online
                }
                onClick={playShot}
              >
                <Play size={15} /> Play selected shot
              </button>
            </div>
          </div>
          <section className="panel review-editor" aria-label="Selected shot">
            {shot ? (
              <>
                <div
                  className="review-shot-header"
                  data-position={shot.position}
                >
                  <div>
                    <span className="eyebrow">
                      END {shot.end} · {shot.stone === 1 ? "FIRST" : "SECOND"}{" "}
                      STONE
                    </span>
                    <h2>
                      {g.players[shot.position]}{" "}
                      <span className="shot-code">{shot.id}</span>
                    </h2>
                    <p>
                      {shot.type || "Unclassified"} ·{" "}
                      {shot.turn || "Turn not recorded"} ·{" "}
                      {shot.execution || "Unscored"} ·{" "}
                      {shot.deficiency || "No deficiency recorded"}
                    </p>
                  </div>
                  <span className={`score-badge score-${shot.score ?? "none"}`}>
                    {shot.score ?? "—"}
                    <small>/5</small>
                  </span>
                </div>
                <div className="review-navigation">
                  <button
                    className="button secondary"
                    disabled={!previous}
                    onClick={() => previous && choose(previous)}
                  >
                    <ArrowLeft size={16} /> Previous shot
                  </button>
                  <span>
                    {index >= 0
                      ? `${index + 1} of ${queue.length}`
                      : "Outside current filters"}
                  </span>
                  <button
                    className="button secondary"
                    disabled={!next}
                    onClick={() => next && choose(next)}
                  >
                    Next shot <ArrowRight size={16} />
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save();
                  }}
                >
                  <fieldset disabled={readOnly} className="video-edit-fields">
                    <div className="timestamp-capture">
                      <label>
                        Video timestamp
                        <input
                          aria-label="Shot video timestamp"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          placeholder="m:ss or h:mm:ss"
                        />
                      </label>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={
                          readOnly || playerState !== "ready" || !online
                        }
                        onClick={() => capture(false)}
                      >
                        <Clock3 size={16} /> Use current video time
                      </button>
                    </div>
                    <div className="review-detail-fields">
                      <label>
                        Mark for review
                        <select
                          aria-label="Mark for review"
                          value={review}
                          onChange={(e) => setReview(e.target.value)}
                        >
                          <option value="">No flag</option>
                          {reviews.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Coach’s note
                        <textarea
                          aria-label="Coach’s note"
                          rows={2}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Shot notes…"
                        />
                      </label>
                    </div>
                    <div className="review-save-controls">
                      {dirty && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setTime(timeLabel(shot.timestamp));
                            setNote(shot.note);
                            setReview(shot.review);
                            setError("");
                          }}
                        >
                          Discard changes
                        </button>
                      )}
                      <button className="button secondary">
                        <Check size={16} /> Save timestamp
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={!next}
                        onClick={() => save(true)}
                      >
                        Save & next <ArrowRight size={16} />
                      </button>
                    </div>
                  </fieldset>
                </form>
              </>
            ) : (
              <div className="empty">
                <h3>No recorded shots</h3>
                <p>
                  Record shots in Live scoring before adding video timestamps.
                </p>
              </div>
            )}
            {error && (
              <p className="review-feedback field-error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="review-feedback inline-success" role="status">
                {message}
              </p>
            )}
            {pendingSelection && (
              <div className="unsaved-review" role="alert">
                <strong>Unsaved changes to shot {selectedId}.</strong>
                <div>
                  <button
                    className="button secondary"
                    onClick={() => setPendingSelection(null)}
                  >
                    Keep editing
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => choose(pendingSelection, true)}
                  >
                    Discard & switch
                  </button>
                  <button
                    className="button primary"
                    onClick={() => {
                      if (save()) choose(pendingSelection, true);
                    }}
                  >
                    Save & switch
                  </button>
                </div>
              </div>
            )}
          </section>
        </section>
        <aside className="panel review-queue" aria-label="Review shot list">
          <div className="review-queue-header">
            <h2>
              Shots <span className="count">{queue.length}</span>
            </h2>
            <span>
              {g.shots.filter((s) => s.timestamp !== null).length} /{" "}
              {g.shots.length} timestamped
            </span>
          </div>
          <div className="queue-filters">
            <label>
              Player
              <select
                aria-label="Video player filter"
                value={playerFilter}
                onChange={(e) =>
                  changeFilter(() => setPlayerFilter(e.target.value))
                }
              >
                <option value="all">All players</option>
                {g.players.map((name, i) => (
                  <option value={i} key={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              End
              <select
                aria-label="Video end filter"
                value={endFilter}
                onChange={(e) =>
                  changeFilter(() => setEndFilter(e.target.value))
                }
              >
                <option value="all">All ends</option>
                {ends.map((e) => (
                  <option value={e} key={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={onlyFlagged}
                onChange={(e) =>
                  changeFilter(() => setOnlyFlagged(e.target.checked))
                }
              />{" "}
              Flagged
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={onlyUnlinked}
                onChange={(e) =>
                  changeFilter(() => setOnlyUnlinked(e.target.checked))
                }
              />{" "}
              Without timestamp
            </label>
          </div>
          <div className="review-shot-list" ref={shotList}>
            {queue.map((s, i) => (
              <div key={s.id}>
                {(i === 0 || queue[i - 1].end !== s.end) && (
                  <h3 className="queue-end-label">End {s.end}</h3>
                )}
                <button
                  className={`review-shot-item ${s.id === selectedId ? "selected" : ""}`}
                  aria-label={`Review shot ${s.id}, ${g.players[s.position]}`}
                  data-shot-id={s.id}
                  data-position={s.position}
                  aria-pressed={s.id === selectedId}
                  onClick={() => choose(s)}
                >
                  <span className="queue-shot-id">{s.id}</span>
                  <div>
                    <strong>{g.players[s.position]}</strong>
                    <small>
                      {s.type || "Unclassified"} · {s.turn || "No turn"}
                    </small>
                    <span className="queue-shot-time">
                      {s.timestamp !== null ? (
                        <>
                          <Clock3 size={11} />
                          {timeLabel(s.timestamp)}
                        </>
                      ) : (
                        "No timestamp"
                      )}
                      {s.review && (
                        <>
                          <Flag size={11} />
                          {s.review}
                        </>
                      )}
                    </span>
                  </div>
                  <span className={`score-badge score-${s.score ?? "none"}`}>
                    {s.score ?? "—"}
                    <small>/5</small>
                  </span>
                </button>
              </div>
            ))}
            {!queue.length && (
              <div className="queue-empty">No shots match these filters.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
