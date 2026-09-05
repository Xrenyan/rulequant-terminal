"use client";

import { useMemo, useState } from "react";
import { Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { FormulaEffect } from "@/components/formula-analysis/formula-effect";
import { FormulaObservationPanel } from "@/components/formula-observation-panel";
import { evaluateFormulaEffect } from "@/lib/formula-analysis/formula-effect";
import { FORMULA_ANALYSIS_WINDOWS, normalizeFormulaAnalysisWindow } from "@/lib/formula-analysis/windows";
import type { DrawRecord, RuleBacktestResult, RuleQuantConfig, RuleRecord } from "@/types/domain";

export function FormulaDetailInsights({ rule, result, draws, config, onOpenIssue }: {
  rule: RuleRecord; result?: RuleBacktestResult; draws: DrawRecord[]; config: RuleQuantConfig;
  onOpenIssue: (issue: string) => void;
}) {
  const [periods, setPeriods] = useState(10);
  const effect = useMemo(() => evaluateFormulaEffect({ rule, config, draws, details: result?.details ?? [], window: periods, error: result?.error }), [rule, config, draws, result, periods]);
  return <>
    <Panel className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><strong className="font-semibold">历史表现对照</strong>
        <Select aria-label="公式表现期数" value={periods} onChange={(event) => setPeriods(normalizeFormulaAnalysisWindow(event.target.value))} className="w-36">
          {FORMULA_ANALYSIS_WINDOWS.map((count) => <option key={count} value={count}>最近{count}期</option>)}
        </Select>
      </div>
      <FormulaEffect effect={effect} onOpenIssue={onOpenIssue} />
    </Panel>
    <FormulaObservationPanel rule={rule} draws={draws} config={config} />
  </>;
}
