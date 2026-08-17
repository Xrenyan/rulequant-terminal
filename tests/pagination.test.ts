import { describe, expect, it } from "vitest";
import { paginateItems } from "@/lib/pagination";
import { uniqueResolvedUrls } from "@/lib/network/urls";

describe("paginateItems", () => {
  it("renders only the requested page instead of the full collection", () => {
    const result = paginateItems(Array.from({ length: 63 }, (_, index) => index + 1), 2, 15);

    expect(result.items).toEqual(Array.from({ length: 15 }, (_, index) => index + 31));
    expect(result.page).toBe(2);
    expect(result.pageCount).toBe(5);
    expect(result.start).toBe(31);
    expect(result.end).toBe(45);
  });

  it("clamps a stale page after the collection becomes shorter", () => {
    const result = paginateItems(["a", "b", "c"], 7, 2);

    expect(result.page).toBe(1);
    expect(result.items).toEqual(["c"]);
    expect(result.start).toBe(3);
    expect(result.end).toBe(3);
  });
});

describe("uniqueResolvedUrls", () => {
  it("deduplicates relative paths that resolve to the same resource", () => {
    expect(uniqueResolvedUrls([
      "/static-cloud-state.json",
      "../static-cloud-state.json",
      "https://example.com/static-cloud-state.json",
    ], "https://example.com/dashboard/"))
      .toEqual(["https://example.com/static-cloud-state.json"]);
  });
});
