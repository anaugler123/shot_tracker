import { percentage, positions, type Game, type Shot } from "./model";
function Trend({
  points,
  onGame,
}: {
  points: { label: string; value: number | null; count: number; game?: Game }[];
  onGame?: (id: string) => void;
}) {
  const width = 600,
    height = 200,
    left = 38,
    right = 15,
    top = 15,
    bottom = 40;
  const x = (i: number) =>
    left +
    (width - left - right) *
      (points.length === 1 ? 0.5 : i / Math.max(1, points.length - 1));
  const y = (n: number) => top + (height - top - bottom) * (1 - n / 100);
  const valid = points
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.value !== null);
  return (
    <div className="trend-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Shooting percentage trend from 0 to 100 percent"
      >
        {[0, 25, 50, 75, 100].map((n) => (
          <g key={n}>
            <line
              x1={left}
              x2={width - right}
              y1={y(n)}
              y2={y(n)}
              stroke="#e0e7d9"
            />
            <text
              x={left - 7}
              y={y(n) + 4}
              textAnchor="end"
              fontSize="10"
              fill="#7a8b6e"
            >
              {n}%
            </text>
          </g>
        ))}
        <polyline
          points={valid.map((p) => `${x(p.i)},${y(p.value!)}`).join(" ")}
          fill="none"
          stroke="#567d48"
          strokeWidth="3"
        />
        {points.map((p, i) => (
          <g key={i}>
            <text
              x={x(i)}
              y={height - 17}
              textAnchor="middle"
              fontSize="10"
              fill="#718269"
            >
              {p.label.length > 13 ? p.label.slice(0, 12) + "…" : p.label}
            </text>
            {p.value !== null && (
              <g
                role={p.game && onGame ? "button" : undefined}
                tabIndex={p.game && onGame ? 0 : undefined}
                aria-label={`${p.label}: ${p.value}%, ${p.count} shots${p.game && onGame ? ", open game dashboard" : ""}`}
                onClick={() => p.game && onGame?.(p.game.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (p.game) onGame?.(p.game.id);
                  }
                }}
              >
                <circle cx={x(i)} cy={y(p.value)} r="12" fill="transparent" />
                <circle
                  cx={x(i)}
                  cy={y(p.value)}
                  r="5"
                  fill="#567d48"
                  stroke="#fbfcf8"
                  strokeWidth="2"
                />
                <title>
                  {p.label}: {p.value}% from {p.count} scored shots
                </title>
              </g>
            )}
          </g>
        ))}
      </svg>
      {!valid.length && (
        <p className="helper">No scored shots for this selection.</p>
      )}
    </div>
  );
}
function Bars({
  rows,
  percentageScale = false,
}: {
  rows: { label: string; value: number | null; count: number }[];
  percentageScale?: boolean;
}) {
  const max = percentageScale
    ? 100
    : Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <div className="performance-bars">
      {rows.map((r) => (
        <div className="performance-bar" key={r.label}>
          <div>
            <span>{r.label}</span>
            <small>{percentageScale ? `${r.count} shots` : ""}</small>
          </div>
          <div className="performance-track">
            <span style={{ width: `${((r.value ?? 0) / max) * 100}%` }} />
          </div>
          <strong>
            {r.value === null ? "—" : `${r.value}${percentageScale ? "%" : ""}`}
          </strong>
        </div>
      ))}
    </div>
  );
}
export function TeamCharts({
  games,
  onGame,
}: {
  games: Game[];
  onGame?: (id: string) => void;
}) {
  const shots = games.flatMap((g) => g.shots);
  const scored = shots.filter((s) => s.score !== null);
  const single = games.length === 1;
  const trend = single
    ? [...new Set(shots.map((s) => s.end))]
        .sort((a, b) => a - b)
        .map((end) => {
          const list = shots.filter((s) => s.end === end);
          return {
            label: `End ${end}`,
            value: percentage(list),
            count: list.filter((s) => s.score !== null).length,
          };
        })
    : [...games]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((g) => ({
          label: g.opponent,
          value: percentage(g.shots),
          count: g.shots.filter((s) => s.score !== null).length,
          game: g,
        }));
  const players = [...new Set(games.flatMap((g) => g.players))].map((name) => {
    const list = games.flatMap((g) =>
      g.shots.filter((s) => g.players[s.position] === name),
    );
    return {
      label: name,
      value: percentage(list),
      count: list.filter((s) => s.score !== null).length,
    };
  });
  const misses = ["Light", "Heavy", "Undercurl", "Overcurl", "Management"].map(
    (label) => ({
      label,
      value: scored.filter((s) => s.deficiency === label).length,
      count: 0,
    }),
  );
  return (
    <section className="team-charts" aria-label="Team performance charts">
      <div className="charts-summary">
        <span>
          <strong>{games.length}</strong> games
        </span>
        <span>
          <strong>{scored.length}</strong> scored shots
        </span>
        <span>
          <strong>
            {percentage(shots) ?? "—"}
            {percentage(shots) !== null ? "%" : ""}
          </strong>{" "}
          team shooting
        </span>
      </div>
      <div className="performance-chart-grid">
        <section className="panel trend-panel">
          <div className="chart-heading">
            <h2>{single ? "Shooting by end" : "Team shooting by game"}</h2>
            <p>
              Points earned / possible points ·{" "}
              {single ? "each played end" : "select a point to open the game"}
            </p>
          </div>
          <Trend points={trend} onGame={onGame} />
        </section>
        <section className="panel">
          <div className="chart-heading">
            <h2>Player shooting</h2>
            <p>Numeric scores out of 5, with shot counts</p>
          </div>
          <Bars rows={players} percentageScale />
        </section>
        <section className="panel">
          <div className="chart-heading">
            <h2>Deficiencies</h2>
            <p>
              Recorded deficiency counts, excluding makes and unscored shots
            </p>
          </div>
          <Bars rows={misses} />
        </section>
      </div>
    </section>
  );
}
export function GameDashboard({
  game: g,
  games,
  onSelect,
  onScore,
  onVideo,
  children,
  readOnly = false,
}: {
  game: Game;
  games: Game[];
  onSelect: (id: string) => void;
  onScore: () => void;
  onVideo: (shotId?: string) => void;
  children: React.ReactNode;
  readOnly?: boolean;
}) {
  const scored = g.shots.filter((s) => s.score !== null);
  const [us, them] = g.scores.reduce(
    (a, s) => [a[0] + (s.us ?? 0), a[1] + (s.them ?? 0)],
    [0, 0],
  );
  const ends = g.scores.filter((s) => s.us !== null && s.them !== null).length;
  const types = [...new Set(g.shots.map((s) => s.type).filter(Boolean))].map(
    (type) => {
      const list = g.shots.filter((s) => s.type === type);
      return {
        type,
        count: list.filter((s) => s.score !== null).length,
        percentage: percentage(list),
      };
    },
  );
  return (
    <>
      <div className="page-heading compact">
        <div>
          <h1>Game dashboard</h1>
          <p>
            {g.event} · {g.date || "Date not set"} ·{" "}
            {g.venue || "Venue not set"}
          </p>
        </div>
        <select
          className="game-picker"
          aria-label="Dashboard game"
          value={g.id}
          onChange={(e) => onSelect(e.target.value)}
        >
          {games.map((game) => (
            <option value={game.id} key={game.id}>
              {game.event} · vs. {game.opponent}
            </option>
          ))}
        </select>
      </div>
      <section className="game-overview panel">
        <div>
          <span className={`pill ${g.status === "live" ? "live" : "neutral"}`}>
            {g.status === "live" ? "IN PROGRESS" : "FINAL"}
          </span>
          <h2>
            Our team {us} – {them} {g.opponent}
          </h2>
          <p>
            {ends} ends with scores · Starting hammer:{" "}
            {g.firstHammer ? "our team" : g.opponent} · Sheet{" "}
            {g.sheet || "not set"}
          </p>
        </div>
        <div className="heading-actions">
          {!readOnly && (
            <button className="button secondary" onClick={onScore}>
              Score / edit game
            </button>
          )}
          <button className="button primary" onClick={() => onVideo()}>
            Video review
          </button>
        </div>
      </section>
      {children}
      <TeamCharts games={[g]} />
      <div className="dashboard-detail-grid">
        <section className="panel">
          <div className="chart-heading">
            <h2>Shot type performance</h2>
          </div>
          <div className="table-scroll">
            <table className="shots-table">
              <thead>
                <tr>
                  <th>Shot type</th>
                  <th>Scored shots</th>
                  <th>Shooting</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.type}>
                    <td>{t.type}</td>
                    <td>{t.count}</td>
                    <td>{t.percentage === null ? "—" : t.percentage + "%"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="chart-heading">
            <h2>Shots for review</h2>
            <p>
              {g.shots.filter((s) => s.review || s.note).length} flagged or
              noted shots
            </p>
          </div>
          <div className="game-review-list">
            {g.shots
              .filter((s) => s.review || s.note)
              .map((s) => (
                <button key={s.id} onClick={() => onVideo(s.id)}>
                  <strong>
                    {s.id} · {g.players[s.position]}
                  </strong>
                  <span>
                    {s.review || s.type} · {s.score ?? "Unscored"}
                    {s.score !== null ? "/5" : ""}
                  </span>
                  <p>{s.note}</p>
                </button>
              ))}
            {!g.shots.some((s) => s.review || s.note) && (
              <p className="helper">No review flags or notes recorded.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
