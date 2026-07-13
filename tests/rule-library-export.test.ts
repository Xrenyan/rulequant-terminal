import { describe, expect, it } from "vitest";
import { buildRuleLibraryWordHtml } from "@/lib/export/exporters";
import { seedRules } from "@/lib/data/seed";

describe("rule library Word export", () => {
  it("includes built-in and newly added formulas with readable styling", () => {
    const manualRule = {
      ...seedRules[0],
      id: "manual-export-check",
      name: "我新增的测试公式",
      formula: "平1 + 特码尾",
      sourceType: "manual" as const,
    };
    const html = buildRuleLibraryWordHtml([...seedRules, manualRule]);

    expect(html).toContain(`>${seedRules.length + 1}</strong><span>全部公式`);
    expect(html).toContain("我新增的测试公式");
    expect(html).toContain("平1 + 特码尾");
    expect(html).toContain("人工新增公式");
    expect(html).toContain("Microsoft YaHei");
    expect(html).toContain("逐条公式详情");
  });
});
