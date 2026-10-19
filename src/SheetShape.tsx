import { useState } from "react";
import { IceCrossSection } from "./IceCrossSection";
import type { Game } from "./model";
import { estimateSheetShape } from "./iceModel";
export function SheetShape({
  game,
  onReview,
}: {
  game: Game;
  onReview: (shotId: string) => void;
}) {
  const [includeHits, setIncludeHits] = useState(false);
  const [target, setTarget] = useState<"all" | "C" | "S">("all");
  const [player, setPlayer] = useState<"all" | number>("all");
  const [selectedGroup, setSelectedGroup] = useState("");
  const result = estimateSheetShape(game, "away", {
    includeHits,
    target,
    player,
  });
  const [exaggeration, setExaggeration] = useState(3);
  const directional = result.status === "directional";
  const side = result.side;
  const active = result.groups.find(
    (g) => `${g.direction}-${g.turn}` === selectedGroup,
  );
  const label = directional
    ? `Possible fall toward the ${side}`
    : result.status === "mixed"
      ? "No consistent cross-slope signal"
      : "Not enough directional evidence";
  return (
    <details className="panel sheet-shape">
      <summary>
        <span>
          Sheet shape <span className="pill neutral">Experimental</span>
        </span>
        <span aria-hidden="true">+</span>
      </summary>
      <div className="sheet-shape-body">
        <div className="sheet-shape-toolbar">
          <span>Odd ends: away · Even ends: home</span>
          <label>
            Shots
            <select
              aria-label="Sheet shape shot types"
              value={includeHits ? "all" : "draws"}
              onChange={(e) => setIncludeHits(e.target.value === "all")}
            >
              <option value="draws">Draws</option>
              <option value="all">Draws and hits</option>
            </select>
          </label>
          <label>
            Target
            <select
              aria-label="Sheet shape target"
              value={target}
              onChange={(e) => setTarget(e.target.value as typeof target)}
            >
              <option value="all">All targets</option>
              <option value="C">Centre (C)</option>
              <option value="S">Side (S)</option>
            </select>
          </label>
          <label>
            Player
            <select
              aria-label="Sheet shape player"
              value={player}
              onChange={(e) =>
                setPlayer(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                )
              }
            >
              <option value="all">All players</option>
              {game.players.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="sheet-shape-result">
          <div className="sheet-shape-diagram">
            <IceCrossSection
              bias={result.bias}
              showShape={directional}
              label={label}
              exaggeration={exaggeration}
            />
            <label className="ice-exaggeration">
              Exaggeration{" "}
              <input
                type="range"
                aria-label="Ice shape exaggeration"
                disabled={!directional}
                min="1"
                max="5"
                step="1"
                value={exaggeration}
                onChange={(e) => setExaggeration(Number(e.target.value))}
              />
              <output>{exaggeration} / 5</output>
            </label>
            <p className="ice-diagram-caption">
              {directional
                ? "Illustrative profile · no measured elevation or slope angle"
                : "No profile inferred for this selection"}
            </p>
          </div>
          <div className="sheet-shape-evidence">
            <h3>{label}</h3>
            <div className="sheet-shape-counts">
              <span>
                <strong>{result.left}</strong> leftward
              </span>
              <span>
                <strong>{result.right}</strong> rightward
              </span>
              <span>
                <strong>{result.made}</strong> makes
              </span>
            </div>
            <p>
              {result.evidence.length} usable shots · {result.players} players
              with curl misses · {result.excluded} excluded shots
            </p>
            <p>
              {directional
                ? "Both playing directions show a net pull toward the same side."
                : result.status === "mixed"
                  ? "The direction groups disagree, balance out, or the miss pattern is weak relative to makes."
                  : "A cross-slope suggestion needs at least 8 curl misses, including 3 in each playing direction."}
            </p>
            {result.players === 1 && (
              <p className="sheet-shape-caution">
                All curl-miss evidence comes from one player.
              </p>
            )}
            <p className="sheet-shape-caution">
              This is a curl-bias hypothesis. Release, weight, sweeping, stone
              differences and the called line can produce the same pattern.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="shots-table">
            <thead>
              <tr>
                <th>Direction</th>
                <th>Turn</th>
                <th>Overcurl</th>
                <th>Undercurl</th>
                <th>Make</th>
                <th>Net pull</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {result.groups.map((group) => (
                <tr key={`${group.direction}-${group.turn}`}>
                  <td>
                    {group.direction === "away" ? "Away (odd)" : "Home (even)"}
                  </td>
                  <td>{group.turn}</td>
                  <td>{group.over}</td>
                  <td>{group.under}</td>
                  <td>{group.made}</td>
                  <td>
                    {!group.shots.length
                      ? "—"
                      : group.net === 0
                        ? "Balanced"
                        : `${Math.abs(group.net)} ${group.net > 0 ? "right" : "left"}`}
                  </td>
                  <td>
                    <button
                      className="text-button"
                      disabled={!group.shots.length}
                      aria-pressed={
                        selectedGroup === `${group.direction}-${group.turn}`
                      }
                      onClick={() =>
                        setSelectedGroup(`${group.direction}-${group.turn}`)
                      }
                    >
                      View shots
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {active && (
          <div className="sheet-shape-shot-evidence">
            <h4>
              {active.direction === "away" ? "Away" : "Home"} · {active.turn}
            </h4>
            <div>
              {active.shots.map(({ shot }) => (
                <button
                  key={shot.id}
                  className="button secondary"
                  onClick={() => onReview(shot.id)}
                >
                  {shot.id} · {game.players[shot.position]} · {shot.deficiency}
                </button>
              ))}
            </div>
          </div>
        )}
        <details className="sheet-shape-method">
          <summary>How the estimate works</summary>
          <p>
            All left/right directions are viewed from the home end, looking
            away. CW curls right when playing away and left when coming home;
            CCW reverses that. Overcurl adds one observation in the curling
            direction; undercurl adds one against it. Makes count as neutral
            observations.
          </p>
          <p>
            The illustration requires at least 8 curl misses, 3 in each
            direction, agreement on the net side in both directions, and a net
            directional difference of at least 20% of usable shots. These are
            exploratory rules, not a calibrated ice model. Light, heavy,
            management, unscored and unclassified shots are excluded. Draws are
            selected initially; hits can be included explicitly.
          </p>
          <p>
            Without broom coordinates, rock paths or measured break, this cannot
            map specific runs, infer bumps or measure slope. Filter by target or
            player and review the underlying shots to check other explanations.
          </p>
        </details>
      </div>
    </details>
  );
}
