import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("formula analysis cockpit navigation", () => {
  it("binds the nested route to a hidden terminal view and one statistics nav highlight", () => {
    const route = read("src/app/formula-result-statistics/analysis/page.tsx");
    const terminal = read("src/components/rulequant-terminal.tsx");

    expect(route).toContain('<RuleQuantTerminal activeView="formula-analysis" />');
    expect(terminal).toContain('| "formula-analysis"');
    expect(terminal).toContain('const FormulaAnalysisCockpit = dynamic(');
    expect(terminal).toContain('itemKey === "formula-result-statistics" && activeView === "formula-analysis"');
    expect(terminal.match(/key: "formula-analysis"/g)).toBeNull();
  });

  it("uses a route entry instead of reopening the long visualization dialog", () => {
    const statistics = read("src/components/formula-result-statistics-view.tsx");

    expect(statistics).toContain('href={analysisHref}');
    expect(statistics).toContain("进入分析驾驶舱");
    expect(statistics).not.toContain("LazyFormulaResultVisualizationDialog");
    expect(statistics).not.toContain("visualizationOpen");
  });

  it("exposes four plain-language tabs and supported Mark Six result types", () => {
    const cockpit = read("src/components/formula-analysis/formula-analysis-cockpit.tsx");
    const toolbar = read("src/components/formula-analysis/formula-analysis-toolbar.tsx");

    for (const label of ["概览", "落点趋势", "公式诊断", "明细核验"]) {
      expect(cockpit).toContain(label);
    }
    for (const label of ["最近10期", "最近30期", "最近50期", "保存视图", "排除结果", "支持结果"]) {
      expect(toolbar).toContain(label);
    }
    expect(toolbar).not.toContain("单双");
    expect(toolbar).not.toContain("大小");
  });
});
