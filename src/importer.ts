import ExcelJS from "exceljs";
import {
  emptyShot,
  type Game,
  type EndScore,
  draws,
  hits,
  turns,
  executions,
  deficiencies,
  reviews,
} from "./model";
export interface ImportResult {
  games: Game[];
  warnings: string[];
  filename: string;
}
function value(
  sheet: ExcelJS.Worksheet | undefined,
  row: number,
  col: number,
): unknown {
  const v = sheet?.getCell(row, col).value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return v.result;
    if ("richText" in v) return v.richText.map((x) => x.text).join("");
    if ("error" in v) return null;
    return null;
  }
  return v;
}
function text(s: ExcelJS.Worksheet | undefined, r: number, c: number) {
  const v = value(s, r, c);
  return v == null ? "" : String(v).trim();
}
function clean(s: string) {
  return ["Select", "#N/A", "#REF!"].includes(s) ? "" : s;
}
function dateString(v: unknown, context: string) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  if (!s) return "";
  const withYear = /\b20\d\d\b/.test(s)
    ? s
    : s + " " + (context.match(/20\d\d/)?.[0] || "");
  const n = Date.parse(withYear);
  return Number.isNaN(n) ? "" : new Date(n).toISOString().slice(0, 10);
}

function endPoints(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && /^\d+$/.test(v.trim())
        ? Number(v)
        : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 8)
    throw new Error(
      "An end score is not an integer from 0 to 8. Review the scoreboard in the workbook.",
    );
  return n;
}

export async function readWorkbook(
  buffer: ArrayBuffer,
  filename: string,
): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const detail = workbook.getWorksheet("Details");
  if (!detail)
    throw new Error(
      "This workbook needs a Details sheet and Game sheets from the scored shot tracker template.",
    );
  const event = text(detail, 3, 2) || filename.replace(/\.xlsx$/i, "");
  const venue = text(detail, 5, 2);
  const context = text(detail, 4, 2) + " " + filename;
  const players = [7, 8, 9, 10].map(
    (r, i) =>
      [text(detail, r, 3), text(detail, r, 2)].filter(Boolean).join(" ") ||
      ["Lead", "Second", "Third", "Fourth"][i],
  );
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const warnings: string[] = [];
  const games: Game[] = [];
  for (const sheet of workbook.worksheets) {
    if (!/^Game \d+$/.test(sheet.name)) continue;
    if (text(sheet, 10, 1) !== "Shot" || text(sheet, 10, 8) !== "Shot Score")
      throw new Error(
        `${sheet.name} has an unsupported column layout. No data has been imported.`,
      );
    const shots: Game["shots"] = [];
    for (let row = 11; row <= 32; row++)
      for (let position = 0; position < 4; position++) {
        const col = position * 12 + 1;
        const id = text(sheet, row, col);
        const match = id.match(/^(\d+)([A-H])$/);
        if (!match) continue;
        const cells = Array.from({ length: 11 }, (_, i) =>
          clean(text(sheet, row, col + i)),
        );
        const raw = value(sheet, row, col + 7);
        const score =
          typeof raw === "number"
            ? raw
            : typeof raw === "string" && /^[0-5]$/.test(raw)
              ? Number(raw)
              : null;
        if (
          ![
            cells[1],
            cells[2],
            cells[4],
            cells[6],
            cells[8],
            cells[9],
            cells[10],
          ].some(Boolean) &&
          score === null
        )
          continue;
        if (
          score !== null &&
          (!Number.isInteger(score) || score < 0 || score > 5)
        )
          throw new Error(
            `${sheet.name}, ${id}: score must be an integer from 0 to 5.`,
          );
        const shot = emptyShot(
          Number(match[1]),
          position,
          ((match[2].charCodeAt(0) - 65) % 2) + 1,
        );
        Object.assign(shot, {
          turn: cells[1],
          kind: cells[4] ? "Hit" : "Draw",
          type: cells[4] || cells[2],
          execution: cells[6],
          score,
          deficiency: cells[8],
          review: cells[9],
          note: cells[10],
        });
        if (cells[2] && cells[4])
          (warnings.push(
            `${sheet.name}, ${id}: both draw and hit are filled. Hit is selected; original draw retained in notes.`,
          ),
            (shot.note += ` [Imported draw: ${cells[2]}]`));
        for (const [v, choices, label] of [
          [shot.turn, turns, "turn"],
          [shot.type, shot.kind === "Hit" ? hits : draws, "shot type"],
          [shot.execution, executions, "execution"],
          [shot.deficiency, deficiencies, "deficiency"],
          [shot.review, reviews, "review flag"],
        ] as [string, string[], string][]) {
          if (v && !choices.includes(v))
            warnings.push(
              `${sheet.name}, ${id}: unfamiliar ${label} “${v}” retained for review.`,
            );
        }
        shots.push(shot);
      }
    if (!shots.length) continue;
    const date = dateString(value(sheet, 3, 3), context);
    if (!date)
      warnings.push(
        `${sheet.name}: date needs confirmation (“${text(sheet, 3, 3)}”).`,
      );
    const ends = Number(value(sheet, 4, 7)) === 10 ? 10 : 8;
    const board = workbook.getWorksheet("Scoreboard Analysis");
    let boardRow = 0,
      boardCol = 0;
    if (board) {
      for (let row = 1; row <= board.rowCount; row++)
        for (const col of [1, 43])
          if (text(board, row, col) === sheet.name) {
            if ((ends === 8 && col === 1) || (ends === 10 && col === 43)) {
              boardRow = row + 1;
              boardCol = col;
            }
          }
    }
    const scores: EndScore[] = Array.from({ length: ends + 1 }, () => ({
      us: null,
      them: null,
    }));
    // The per-game scoreboard contains the entered values. ExcelJS can omit a
    // cached formula result of zero in the analysis sheet; never infer it.
    const rawBoard =
      text(sheet, 10, 49) === "End" &&
      text(sheet, 11, 49) === "Us" &&
      Array.from({ length: ends + 1 }, (_, i) => [
        value(sheet, 11, 51 + i),
        value(sheet, 12, 51 + i),
      ])
        .flat()
        .some((v) => v !== undefined && v !== null && v !== "");
    if (rawBoard || boardRow) {
      for (let e = 1; e <= ends + 1; e++) {
        const a = endPoints(
          rawBoard
            ? value(sheet, 11, 50 + e)
            : value(board, boardRow, boardCol + e + 2),
        );
        const b = endPoints(
          rawBoard
            ? value(sheet, 12, 50 + e)
            : value(board, boardRow + 1, boardCol + e + 2),
        );
        if (a !== null && b !== null && a > 0 && b > 0)
          throw new Error(
            `${sheet.name}, end ${e}: both teams have points. Correct the workbook scoreboard before importing.`,
          );
        scores[e - 1] = { us: a, them: b };
      }
      // Only import trailing zero pairs if shot data establishes the end was
      // reached. These padded spreadsheet cells are otherwise ambiguous.
      const lastShot = Math.max(...shots.map((s) => s.end));
      const lastScoring = scores.reduce(
        (last, s, i) => ((s.us ?? 0) > 0 || (s.them ?? 0) > 0 ? i + 1 : last),
        0,
      );
      const reached = Math.max(lastShot, lastScoring);
      for (let i = reached; i < scores.length; i++)
        if (!scores[i].us && !scores[i].them)
          scores[i] = { us: null, them: null };
      warnings.push(
        `${sheet.name}: shot data reaches end ${lastShot}. Confirm the last completed end; trailing zeroes may be placeholders and missing end scores remain unknown.`,
      );
    }
    const hammer = clean(text(sheet, 3, 7));
    if (!hammer)
      warnings.push(
        `${sheet.name}: starting hammer was not provided. Confirm it before using scoreboard analysis.`,
      );
    games.push({
      id: `import-${digest.slice(0, 16)}-${sheet.name.replace(" ", "-")}`,
      event,
      opponent: text(sheet, 5, 3) || "Unknown opponent",
      date,
      venue,
      sheet: clean(text(sheet, 6, 3)),
      round: clean(text(sheet, 4, 3)),
      ends,
      players: [...players],
      firstHammer: hammer === "Team",
      scores,
      shots,
      status: "complete",
      video: "",
      source: `${digest}:${sheet.name}`,
    });
  }
  if (!games.length)
    throw new Error(
      "No entered shots were found in the Game sheets. Empty template rows are ignored.",
    );
  return { games, warnings, filename };
}
