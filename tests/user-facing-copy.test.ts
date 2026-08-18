import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = [
  "src/components/rulequant-terminal.tsx",
  "src/components/formula-analysis/formula-analysis-loading.tsx",
  "src/components/formula-result-statistics-view.tsx",
  "src/components/fixed-pattern-analysis-workspace.tsx",
  "src/components/formula-analysis/formula-health-workspace.tsx",
  "src/content/system-guide/troubleshooting.ts",
  "src/content/system-guide/secondary-tools.ts",
].map((path) => readFileSync(path, "utf8")).join("\n");

describe("user-facing copy", () => {
  test("keeps implementation vocabulary out of visible product labels and help copy", () => {
    expect(source).not.toMatch(/>raw(?:Result)?<|>finalResult<|header:\s*"raw"|后台线程|主线程|统计线程|消息无法读取|技术明细|issue,n1|\{row\.ruleId\}<\/small>|\{item\.targetType\}|归一化：\{normalizer\}/);
  });
});
