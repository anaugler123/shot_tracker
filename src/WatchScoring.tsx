import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { emptyShot, nextShot, type Game, type Shot } from "./model";
import { ShotForm } from "./ShotForm";
import { EndScoreModal } from "./EndScoreModal";
import { Modal } from "./Modal";
import type { VideoPlayer } from "./YouTubePlayer";
export function WatchScoring({
  game,
  player,
  ready,
  initialShot,
  onChange,
  onDirtyChange,
  hidden,
}: {
  game: Game;
  player: RefObject<VideoPlayer | null>;
  ready: boolean;
  initialShot: Shot | null;
  onChange: (game: Game) => boolean;
  onDirtyChange: (dirty: boolean) => void;
  hidden: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(() =>
    game.status === "complete" && initialShot ? initialShot : nextShot(game),
  );
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [pending, setPending] = useState<Shot | null>(null);
  const [side, setSide] = useState<"right" | "left" | "bottom">(() => {
    try {
      const saved = localStorage.getItem("hack.watchPanelPosition");
      return saved === "left" || saved === "bottom" ? saved : "right";
    } catch {
      return "right";
    }
  });
  function changePosition(value: "right" | "left" | "bottom") {
    setSide(value);
    try {
      localStorage.setItem("hack.watchPanelPosition", value);
    } catch {
      /* Keep the position for this session when storage is unavailable. */
    }
  }
  const [version, setVersion] = useState(0);
  const [scoreEnd, setScoreEnd] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [current.id, version]);
  const editing = game.shots.some((s) => s.id === current.id);
  const handleDirty = useCallback(
    (value: boolean) => {
      dirtyRef.current = value;
      setDirty(value);
      onDirtyChange(value);
    },
    [onDirtyChange],
  );
  const ordinal =
    (current.end - 1) * 8 + current.position * 2 + current.stone - 1;
  function adjacent(step: number) {
    const n = ordinal + step;
    const shot = emptyShot(
      Math.floor(n / 8) + 1,
      Math.floor((n % 8) / 2),
      (n % 2) + 1,
    );
    choose(game.shots.find((s) => s.id === shot.id) || shot);
  }
  function choose(shot: Shot, force = false) {
    if (dirtyRef.current && !force) {
      setPending(shot);
      return;
    }
    setCurrent(shot);
    if (shot.timestamp !== null && ready) {
      player.current?.seekTo(Math.max(0, shot.timestamp - 5), true);
    }
    setVersion((v) => v + 1);
    setPending(null);
    setError("");
    setMessage("");
  }
  function captureTime() {
    if (!ready || !player.current) return null;
    try {
      const time = player.current.getCurrentTime();
      return Number.isFinite(time) && time >= 0 ? Math.floor(time) : null;
    } catch {
      return null;
    }
  }
  function save(shot: Shot) {
    const existed = game.shots.some((s) => s.id === shot.id);
    const updated = {
      ...game,
      shots: [...game.shots.filter((s) => s.id !== shot.id), shot],
    };
    if (!onChange(updated)) {
      setError("Could not save this shot. Your entries are still here.");
      return;
    }
    setCurrent(existed ? shot : nextShot(updated));
    setVersion((v) => v + 1);
    setMessage(
      `${shot.id} saved${shot.timestamp === null ? " without a timestamp" : " with video time"}.`,
    );
    setError("");
    if (
      !existed &&
      (updated.shots.filter((s) => s.end === shot.end).length === 8 ||
        (shot.position === 3 && shot.stone === 2)) &&
      (game.scores[shot.end - 1]?.us === null ||
        game.scores[shot.end - 1]?.them === null)
    ) {
      setScoreEnd(shot.end);
      player.current?.pauseVideo?.();
    }
  }
  return (
    <>
      <aside
        className={`watch-score-panel ${side}`}
        aria-label="Video shot scoring"
        data-unsaved={dirty}
        hidden={hidden}
      >
        <div className="watch-score-heading" data-position={current.position}>
          <div>
            <span className="shot-code">{current.id}</span>
            <div>
              <strong>{game.players[current.position]}</strong>
              <span>
                End {current.end} · {current.stone === 1 ? "First" : "Second"}{" "}
                stone
              </span>
            </div>
          </div>
          <div className="watch-score-navigation">
            <button
              className="icon-button"
              aria-label="Previous scoring shot"
              disabled={ordinal === 0}
              onClick={() => adjacent(-1)}
            >
              <ArrowLeft size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Next scoring shot"
              disabled={ordinal >= (game.ends + 1) * 8 - 1}
              onClick={() => adjacent(1)}
            >
              <ArrowRight size={16} />
            </button>
            <select
              className="watch-position"
              aria-label="Scoring panel position"
              value={side}
              onChange={(e) => changePosition(e.target.value as typeof side)}
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>
        </div>
        <div className="watch-score-body" ref={body}>
          <div className="watch-shot-tools">
            <button
              className="text-button"
              onClick={() => choose(nextShot(game))}
            >
              Next unrecorded shot
            </button>
            <button
              className="text-button"
              onClick={() => {
                if (dirtyRef.current) {
                  setError(
                    "Save or discard this shot before changing the end score.",
                  );
                  return;
                }
                setScoreEnd(current.end);
              }}
            >
              End score
            </button>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="inline-success" role="status">
              {message}
            </p>
          )}
          <ShotForm
            key={current.id + "-" + version}
            game={game}
            shot={current}
            editing={editing}
            captureTime={captureTime}
            onSave={save}
            onSelect={choose}
            onCancel={() => choose(nextShot(game))}
            onDirtyChange={handleDirty}
          />
        </div>
      </aside>
      {pending && (
        <Modal title="Unsaved shot" onClose={() => setPending(null)}>
          <p className="modal-description">
            Shot {current.id} has unsaved changes.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setPending(null)}
            >
              Keep editing
            </button>
            <button
              className="button primary"
              onClick={() => choose(pending, true)}
            >
              Discard & switch
            </button>
          </div>
        </Modal>
      )}
      {scoreEnd !== null && (
        <EndScoreModal
          key={scoreEnd}
          game={game}
          end={scoreEnd}
          advance={game.shots.filter((s) => s.end === scoreEnd).length === 8}
          onClose={() => setScoreEnd(null)}
          onSave={(scores, finish = false, continueToNext = true) => {
            if (
              onChange({
                ...game,
                scores,
                status: finish ? "complete" : game.status,
              })
            ) {
              if (
                continueToNext &&
                game.shots.filter((s) => s.end === scoreEnd).length === 8 &&
                scoreEnd < game.ends + 1
              )
                choose(
                  game.shots.find(
                    (s) => s.id === emptyShot(scoreEnd + 1, 0, 1).id,
                  ) || emptyShot(scoreEnd + 1, 0, 1),
                  true,
                );
              setScoreEnd(null);
            } else setError("Could not save the end score. Try again.");
          }}
        />
      )}
    </>
  );
}
