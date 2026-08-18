import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { getGuideTopic } from "@/content/system-guide";
import type { FormulaAnalysisTab } from "@/lib/formula-analysis/types";

export type GuideTarget = { topic: string; section?: string };

export const PRIMARY_VIEW_GUIDE_TARGETS = {
  dashboard: { topic: "dashboard" },
  "one-click": { topic: "one-click" },
  "formula-result-statistics": { topic: "formula-result-statistics" },
  "candidate-pool": { topic: "candidate-pool" },
  "special-analysis": { topic: "special-analysis" },
  draws: { topic: "draws" },
  rules: { topic: "rules" },
  "sample-check": { topic: "sample-check" },
  "formula-discovery": { topic: "formula-discovery" },
  config: { topic: "config" },
} as const satisfies Record<string, GuideTarget>;

export const FORMULA_ANALYSIS_GUIDE_TARGETS = {
  overview: { topic: "formula-result-statistics" },
  landing: { topic: "landing-trend" },
  diagnostics: { topic: "formula-health" },
  evidence: { topic: "evidence-matrix" },
} as const satisfies Record<FormulaAnalysisTab, GuideTarget>;

export function buildGuideHref(target: GuideTarget, returnTo?: string): string {
  const params = new URLSearchParams({ tab: "guide", topic: target.topic });
  if (target.section) params.set("section", target.section);
  if (returnTo) params.set("returnTo", returnTo);
  return `/config?${params.toString()}`;
}

export function ContextHelpLink({ topic, section, returnTo, label = "本页说明" }: GuideTarget & { returnTo?: string; label?: string }) {
  const guideTopic = getGuideTopic(topic);
  const title = guideTopic?.title ?? "当前页面";
  return (
    <Link
      className="rq-context-help-link"
      href={buildGuideHref({ topic, section }, returnTo)}
      aria-label={`打开本页说明：${title}`}
    >
      <CircleHelp className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}
