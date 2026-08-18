import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGuideHref,
  FORMULA_ANALYSIS_GUIDE_TARGETS,
  PRIMARY_VIEW_GUIDE_TARGETS,
} from "@/components/system-guide/context-help-link";

const terminal = readFileSync(resolve(process.cwd(), "src/components/rulequant-terminal.tsx"), "utf8");
const helpPage = readFileSync(resolve(process.cwd(), "src/app/help/page.tsx"), "utf8");
const cockpit = readFileSync(resolve(process.cwd(), "src/components/formula-analysis/formula-analysis-cockpit.tsx"), "utf8");

describe("system guide navigation", () => {
  it("adds a fifth Settings item with the promised learning hint and lazy guide", () => {
    expect(terminal).toContain('["guide", "使用说明", "3分钟学会使用"]');
    expect(terminal).toContain("const SystemGuide = dynamic(");
    expect(terminal).toContain('settingsTab === "guide"');
  });

  it("uses the same guide for Settings and the compatible help route", () => {
    expect(helpPage).toContain('<RuleQuantTerminal activeView="help" />');
    expect(terminal).toContain('activeView === "help" && (');
    expect(terminal).not.toContain("function RuleUnderstandingPage");
    expect(terminal).not.toContain("function HelpContent");
  });

  it("preserves topic, section, and return path query inputs", () => {
    expect(terminal).toContain('initialTopicSlug={searchParams.get("topic") ?? undefined}');
    expect(terminal).toContain('initialSection={searchParams.get("section") ?? undefined}');
    expect(terminal).toContain('returnTo={searchParams.get("returnTo") ?? undefined}');
  });

  it("builds contextual guide links for every primary workflow", () => {
    expect(Object.keys(PRIMARY_VIEW_GUIDE_TARGETS)).toEqual([
      "dashboard", "one-click", "formula-result-statistics", "candidate-pool", "special-analysis", "draws", "rules", "sample-check", "formula-discovery", "config",
    ]);
    expect(buildGuideHref(PRIMARY_VIEW_GUIDE_TARGETS["formula-result-statistics"], "/formula-result-statistics?range=10")).toBe(
      "/config?tab=guide&topic=formula-result-statistics&returnTo=%2Fformula-result-statistics%3Frange%3D10",
    );
    expect(terminal).toContain("<ContextHelpLink");
  });

  it("keeps formula analysis explanations in Settings without another page-level help button", () => {
    expect(FORMULA_ANALYSIS_GUIDE_TARGETS).toEqual({
      overview: { topic: "formula-result-statistics" },
      landing: { topic: "landing-trend" },
      diagnostics: { topic: "formula-health" },
      evidence: { topic: "evidence-matrix" },
    });
    expect(cockpit).not.toContain("ContextHelpLink");
    expect(terminal).toContain('activeView !== "formula-analysis" && activeView !== "config"');
  });
});
