import { describe, expect, it } from "vitest";
import { diffRecords } from "@/lib/storage/record-diff";
import { drawRevision, mergeCheckedDraws } from "@/lib/draws/draw-revision";
import { seedDraws } from "@/lib/data/seed";

describe("targeted persistence and draw invalidation", () => {
  it("does not roll back newer local periods or manual rows when an old snapshot arrives", () => {
    const old = { ...seedDraws[0], issue: "2026001" };
    const current = { ...old, issue: "2026002" };
    expect(mergeCheckedDraws([old, current], [{ ...old, special: 49 }])).toEqual([old, current]);
    const manual = { ...current, sourceUrl: "manual://user-input" };
    expect(mergeCheckedDraws([old, manual], [old, { ...current, special: 49 }]).at(-1)).toEqual(manual);
  });
  it("applies same-period corrections when the source has caught up", () => {
    const draw = seedDraws[0];
    expect(mergeCheckedDraws([draw], [{ ...draw, special: 49 }])[0].special).toBe(49);
  });
  it("writes only edited rows and explicitly removed IDs", () => {
    const before = [{ id: "a", enabled: true }, { id: "b", enabled: true }, { id: "c", enabled: false }];
    expect(diffRecords(before, [{ ...before[0] }, { ...before[1], enabled: false }], (row) => row.id)).toEqual({ removed: ["c"], changed: [{ id: "b", enabled: false }] });
  });
  it("keeps unchanged draws stable despite new array instances and ordering", () => {
    expect(drawRevision(seedDraws)).toBe(drawRevision([...seedDraws].reverse().map((draw) => ({ ...draw }))));
  });
  it("detects corrections including dates, numbers and attribute changes", () => {
    const draw = seedDraws[0];
    for (const patch of [{ special: draw.special % 49 + 1 }, { year: 2040 }, { date: "2040-01-01" }, { rawAttributes: { specialZodiac: "龙" } }]) {
      expect(drawRevision([draw])).not.toBe(drawRevision([{ ...draw, ...patch }]));
    }
  });
});
