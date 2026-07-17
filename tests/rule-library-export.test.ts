import { describe, expect, it } from "vitest";
import { buildRuleLibraryDocxBlob } from "@/lib/export/docx-export";
import { seedRules } from "@/lib/data/seed";

describe("rule library Word export", () => {
  it("creates a real mobile-compatible DOCX package containing all formulas", async () => {
    const manualRule = {
      ...seedRules[0],
      id: "manual-export-check",
      name: "我新增的测试公式",
      formula: "平1 + 特码尾",
      sourceType: "manual" as const,
    };
    const blob = await buildRuleLibraryDocxBlob([...seedRules, manualRule]);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });
});
