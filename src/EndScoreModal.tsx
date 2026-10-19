import { useState } from "react";
import { Check } from "lucide-react";
import { hammerAt, total, type Game } from "./model";
import { Modal } from "./Modal";
export function EndScoreModal({
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
