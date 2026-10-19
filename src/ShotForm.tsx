import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, Clock3 } from "lucide-react";
import {
  positions,
  turns,
  draws,
  hits,
  executions,
  deficiencies,
  reviews,
  emptyShot,
  timeLabel,
  parseTime,
  type Game,
  type Shot,
} from "./model";
export function ShotForm({
  game: g,
  shot,
  editing,
  onSave,
  onSelect,
  onCancel,
  onDirtyChange,
  captureTime,
  compact = false,
}: {
  game: Game;
  shot: Shot;
  editing: boolean;
  onSave: (s: Shot) => void;
  onSelect: (s: Shot) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  captureTime?: () => number | null;
  compact?: boolean;
}) {
  const [s, setS] = useState({ ...shot });
  const [unscored, setUnscored] = useState(shot.score === null && !!shot.note);
  const [error, setError] = useState("");
  const [stamp, setStamp] = useState(timeLabel(shot.timestamp));
  const dirty =
    JSON.stringify(s) !== JSON.stringify(shot) ||
    stamp !== timeLabel(shot.timestamp) ||
    unscored !== (shot.score === null && !!shot.note);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  function update(p: Partial<Shot>) {
    setS((x) => ({ ...x, ...p }));
    onDirtyChange?.(true);
  }
  const options = s.kind === "Draw" ? draws : hits;
  return (
    <form
      className={compact ? "compact-shot-form" : undefined}
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
        onSave({
          ...s,
          score: unscored ? null : s.score,
          timestamp: ts ?? captureTime?.() ?? null,
        });
      }}
    >
      {captureTime && (
        <div className="shot-video-time">
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              const at = captureTime();
              if (at === null) {
                setError(
                  "Video time is unavailable. Enter a timestamp manually.",
                );
                return;
              }
              setStamp(timeLabel(at));
              onDirtyChange?.(true);
              setError("");
            }}
          >
            <Clock3 size={15} /> Mark shot time
          </button>
          <span>{stamp || "Time captured on save"}</span>
        </div>
      )}
      <details className="shot-selection" open={compact ? undefined : true}>
        <summary>Change end / player / stone</summary>
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
                  g.shots.find(
                    (x) => x.id === emptyShot(s.end, p, s.stone).id,
                  ) || emptyShot(s.end, p, s.stone),
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
      </details>

      <>
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
                update({
                  kind: "Draw",
                  type: s.kind === "Draw" ? s.type : "",
                })
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
      </>
      <div className="form-grid">
        <fieldset>
          <legend>Execution</legend>
          <div className="choice-grid execution">
            {executions.map((t) => (
              <button
                key={t}
                type="button"
                data-execution={t}
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
                className={`score-${n} ${s.score === n && !unscored ? "selected" : ""}`}
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
              data-deficiency={t}
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
              onChange={(e) => {
                setStamp(e.target.value);
                onDirtyChange?.(true);
              }}
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
            onChange={(e) => {
              setUnscored(e.target.checked);
              onDirtyChange?.(true);
            }}
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
