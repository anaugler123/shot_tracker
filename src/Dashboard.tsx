import { useEffect, useState } from "react";
import { TeamCharts } from "./PerformanceCharts";
import {
  filterDashboardGames,
  seasonForDate,
  percentage,
  total,
  type Game,
} from "./model";
export type DashboardScope = "season" | "event" | "game";
export function Dashboard({
  games,
  teamId,
  teamName,
  scope,
  onScope,
  selected,
  onSelect,
  renderGame,
  renderInsights,
}: {
  games: Game[];
  teamId: string;
  teamName: string;
  scope: DashboardScope;
  onScope: (s: DashboardScope) => void;
  selected: string;
  onSelect: (id: string) => void;
  renderGame: (game: Game) => React.ReactNode;
  renderInsights: (games: Game[]) => React.ReactNode;
}) {
  const [saved] = useState(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("hack.dashboard." + teamId) || "{}",
      );
    } catch {
      return {};
    }
  });
  const [season, setSeason] = useState<string>(saved.season || "all");
  const [from, setFrom] = useState<string>(saved.from || "");
  const [to, setTo] = useState<string>(saved.to || "");
  const [event, setEvent] = useState<string>(saved.event || "");
  const [includeUndated, setIncludeUndated] = useState<boolean>(
    !!saved.includeUndated,
  );
  useEffect(() => {
    sessionStorage.setItem(
      "hack.dashboard." + teamId,
      JSON.stringify({ season, from, to, event, includeUndated }),
    );
  }, [teamId, season, from, to, event, includeUndated]);
  const seasons = [
    ...new Set(games.map((g) => seasonForDate(g.date)).filter(Boolean)),
  ]
    .sort()
    .reverse();
  const inRange = filterDashboardGames(games, { from, to, includeUndated });
  const events = [...new Set(inRange.map((g) => g.event))].sort();
  const selectedEvent = events.includes(event) ? event : events[0] || "";
  const filtered =
    scope === "event"
      ? inRange.filter((g) => g.event === selectedEvent)
      : inRange;
  const game = games.find((g) => g.id === selected) || games[0];
  function openGame(g: Game) {
    onSelect(g.id);
    onScope("game");
  }
  function chooseSeason(value: string) {
    setSeason(value);
    if (value === "all") {
      setFrom("");
      setTo("");
    } else if (value !== "custom") {
      setFrom(`${value}-07-01`);
      setTo(`${Number(value) + 1}-06-30`);
    }
  }
  const groups = [...new Set(inRange.map((g) => g.event))]
    .sort()
    .map((name) => ({ name, games: inRange.filter((g) => g.event === name) }));
  return (
    <>
      <div className="page-heading compact">
        <h1>Dashboard</h1>
        <span className="dashboard-team-name">{teamName}</span>
      </div>
      <div
        className="dashboard-levels"
        role="tablist"
        aria-label="Dashboard level"
      >
        {(["season", "event", "game"] as const).map((level) => (
          <button
            role="tab"
            aria-selected={scope === level}
            key={level}
            onClick={() => onScope(level)}
          >
            {level[0].toUpperCase() + level.slice(1)}
          </button>
        ))}
      </div>
      <div className="dashboard-filters">
        {scope !== "game" ? (
          <>
            <label>
              Season
              <select
                aria-label="Dashboard season"
                value={season}
                onChange={(e) => chooseSeason(e.target.value)}
              >
                <option value="all">All seasons</option>
                {seasons.map((year) => (
                  <option key={year} value={year}>
                    {year}–{Number(year) + 1}
                  </option>
                ))}
                <option value="custom">Custom dates</option>
              </select>
            </label>
            <label>
              From
              <input
                type="date"
                aria-label="Dashboard start date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setSeason("custom");
                }}
              />
            </label>
            <label>
              To
              <input
                type="date"
                aria-label="Dashboard end date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setSeason("custom");
                }}
              />
            </label>
            {scope === "event" && (
              <label>
                Event
                <select
                  aria-label="Dashboard event"
                  value={selectedEvent}
                  onChange={(e) => setEvent(e.target.value)}
                >
                  {events.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includeUndated}
                onChange={(e) => setIncludeUndated(e.target.checked)}
              />
              Include undated
            </label>
            <button
              className="text-button"
              onClick={() => {
                chooseSeason("all");
                setEvent("");
                setIncludeUndated(false);
              }}
            >
              Reset filters
            </button>
          </>
        ) : (
          <label className="dashboard-game-filter">
            Game
            <select
              aria-label="Dashboard game"
              value={game?.id || ""}
              onChange={(e) => onSelect(e.target.value)}
            >
              {[...new Set(games.map((g) => g.event))].sort().map((name) => (
                <optgroup key={name} label={name}>
                  {games
                    .filter((g) => g.event === name)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.date || "Undated"} · vs. {g.opponent}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
      </div>
      {scope === "game" ? (
        game ? (
          renderGame(game)
        ) : (
          <div className="empty">
            <h2>No games</h2>
          </div>
        )
      ) : (
        <>
          {from && to && from > to && (
            <p className="field-error" role="alert">
              The start date must be before the end date.
            </p>
          )}
          {scope === "event" && selectedEvent && (
            <h2 className="dashboard-event-title">{selectedEvent}</h2>
          )}
          <TeamCharts
            games={filtered}
            onGame={(id) => {
              const g = games.find((g) => g.id === id);
              if (g) openGame(g);
            }}
          />
          {scope === "season" ? (
            <section className="panel dashboard-records">
              <div className="chart-heading">
                <h2>Events</h2>
              </div>
              <div className="table-scroll">
                <table className="shots-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Games</th>
                      <th>Scored shots</th>
                      <th>Shooting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => (
                      <tr key={group.name}>
                        <td>
                          <button
                            className="table-link"
                            onClick={() => {
                              setEvent(group.name);
                              onScope("event");
                            }}
                          >
                            {group.name}
                          </button>
                        </td>
                        <td>{group.games.length}</td>
                        <td>
                          {
                            group.games
                              .flatMap((g) => g.shots)
                              .filter((s) => s.score !== null).length
                          }
                        </td>
                        <td>
                          {percentage(group.games.flatMap((g) => g.shots)) ===
                          null
                            ? "—"
                            : `${percentage(group.games.flatMap((g) => g.shots))}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className="panel dashboard-records">
              <div className="chart-heading">
                <h2>Games</h2>
              </div>
              <div className="table-scroll">
                <table className="shots-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Opponent</th>
                      <th>Score</th>
                      <th>Shooting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((g) => (
                      <tr key={g.id}>
                        <td>{g.date || "Undated"}</td>
                        <td>
                          <button
                            className="table-link"
                            onClick={() => openGame(g)}
                          >
                            {g.opponent}
                          </button>
                        </td>
                        <td>{total(g).join(" – ")}</td>
                        <td>
                          {percentage(g.shots) === null
                            ? "—"
                            : `${percentage(g.shots)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {!filtered.length && (
            <div className="empty">
              <h3>No games in this selection</h3>
            </div>
          )}
          <details className="dashboard-shot-filters">
            <summary>Shot analysis</summary>
            {renderInsights(filtered)}
          </details>
        </>
      )}
    </>
  );
}
