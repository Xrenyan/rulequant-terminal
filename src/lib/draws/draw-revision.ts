import type { DrawRecord } from "@/types/domain";

/** Dates/year and supplied attributes may change interpretation even when numbers do not. */
export function drawRevision(draws: readonly DrawRecord[]) {
  return JSON.stringify([...draws].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true })).map((draw) => [
    draw.issue, draw.date, draw.year, draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special, draw.rawAttributes,
  ]));
}

/** Background snapshots may lag. Never drop newer local periods or overwrite manual records. */
export function mergeCheckedDraws(current: DrawRecord[], incoming: DrawRecord[]) {
  const latest = (items: DrawRecord[]) => items.reduce((max, draw) => Math.max(max, Number(draw.issue) || 0), 0);
  const incomingOlder = latest(incoming) < latest(current);
  const merged = new Map<string, DrawRecord>();
  const ordered = incomingOlder ? [...incoming, ...current] : [...current, ...incoming];
  for (const draw of ordered) merged.set(draw.issue, draw);
  for (const draw of current) {
    if (draw.sourceUrl === "manual://user-input" || draw.rawAttributes?.sourceType === "manual") merged.set(draw.issue, draw);
  }
  return [...merged.values()].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
}
