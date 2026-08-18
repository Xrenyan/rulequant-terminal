import { describe, expect, it } from "vitest";
import { searchGuideTopics } from "@/content/system-guide";

describe("system guide search", () => {
  it("normalizes Chinese punctuation, spaces, and Latin case with title priority", () => {
    expect(searchGuideTopics("  FORMULA   result  ")[0]?.topic.slug).toBe("formula-result-statistics");
    expect(searchGuideTopics("公式，结果统计")[0]?.topic.slug).toBe("formula-result-statistics");
  });

  it("routes ordinary-language aliases to useful explanations", () => {
    expect(searchGuideTopics("杀几次")[0]?.topic.slug).toBe("landing-trend");
    expect(searchGuideTopics("打不开")[0]?.topic.slug).toBe("troubleshooting");
    expect(searchGuideTopics("6+1")[0]?.topic.slug).toBe("draw-structure");
  });

  it("returns grouped catalog data for an empty query and a helpful empty state for unknown text", () => {
    const catalog = searchGuideTopics("");
    expect(new Set(catalog.map((result) => result.topic.group)).size).toBeGreaterThanOrEqual(6);
    expect(searchGuideTopics("绝对不存在的词语xyz123")).toEqual([]);
  });

  it("is deterministic and reports why each item matched", () => {
    const first = searchGuideTopics("矩阵");
    const second = searchGuideTopics("矩阵");
    expect(first.map((item) => item.topic.slug)).toEqual(second.map((item) => item.topic.slug));
    expect(first[0]?.matchedField).toMatch(/title|keyword|alias|content/);
    expect(first[0]?.excerpt.length).toBeGreaterThan(4);
  });
});
