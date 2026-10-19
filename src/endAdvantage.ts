export type EndAdvantageTone =
  | "strong-good"
  | "good"
  | "slight-good"
  | "slight-bad"
  | "bad"
  | "strong-bad"
  | "start-bad"
  | "win"
  | "loss";
/** Scoreboard Analysis palette, indexed by the actual completed end.
 * The workbook leaves some first-end combinations blank; those positions use
 * the first populated shade for that score/hammer combination instead.
 */
export function endAdvantageTone(
  difference: number,
  hammer: boolean,
  end: number,
  ends: number,
): EndAdvantageTone {
  if (end >= ends) {
    if (difference > 0) return "win";
    if (difference < 0) return "loss";
    return hammer ? (ends === 10 ? "good" : "slight-good") : "slight-bad";
  }
  if (difference === 0) {
    if (hammer) return ends === 10 && end >= 9 ? "good" : "slight-good";
    return ends === 10 && end === 0
      ? "start-bad"
      : ends === 10 && end >= 9
        ? "bad"
        : "slight-bad";
  }
  if (difference >= 4) return "strong-good";
  if (difference <= -4) return "strong-bad";
  if (ends === 8) {
    if (difference === 3) return hammer || end >= 5 ? "strong-good" : "good";
    if (difference === 2)
      return hammer
        ? end >= 5
          ? "strong-good"
          : "good"
        : end === 1
          ? "slight-good"
          : "good";
    if (difference === 1)
      return hammer ? (end >= 7 ? "strong-good" : "good") : "slight-good";
    if (difference === -1)
      return hammer ? "slight-bad" : end >= 7 ? "strong-bad" : "bad";
    if (difference === -2)
      return hammer
        ? end === 1
          ? "slight-bad"
          : "bad"
        : end >= 5
          ? "strong-bad"
          : "bad";
    return hammer ? (end >= 5 ? "strong-bad" : "bad") : "strong-bad";
  }
  if (difference === 3) return hammer || end >= 2 ? "strong-good" : "good";
  if (difference === 2) return end >= 8 ? "strong-good" : "good";
  if (difference === 1) return hammer ? "good" : "slight-good";
  if (difference === -1) return hammer ? "slight-bad" : "bad";
  if (difference === -2) return end >= 8 ? "strong-bad" : "bad";
  return hammer ? (end >= 2 ? "strong-bad" : "bad") : "strong-bad";
}
