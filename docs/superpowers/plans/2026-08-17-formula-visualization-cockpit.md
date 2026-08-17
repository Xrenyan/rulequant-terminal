# Formula Visualization Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing formula-result visualization into a truthful, responsive analytics cockpit and fix result-chip and evidence-detail layout defects.

**Architecture:** Keep the existing lazy-loaded modal and live formula-summary source. Move all chart derivation into pure typed functions, let React own modal/filter state, let lightweight SVG components own trend/rank/Pareto geometry, and keep the heatmap/evidence layers semantic DOM for keyboard and mobile access.

**Tech Stack:** Next.js 16.2.11, React 19.2.4, TypeScript 5.9.3, Vitest 4.1.9, JSDOM, existing CSS token system, SVG/DOM; no new chart or runtime dependency.

## Global Constraints

- Preserve the current RuleQuant page structure, iOS glass language, typography tokens, daily live-update behavior, counting rules, supported target types, and existing exclude/support semantics.
- Do not add parity or size statistics; keep half-head, half-color, door, and all currently supported result types.
- Use one global heatmap color scale; keep chart values, labels, source text, caveats, and selection states data-bound.
- Desktop and mobile portrait are sibling layouts; mobile must show the insight and trend before the long ranking list.
- Important values must remain visible without hover; touch targets should be at least 44 CSS px where practical.
- Do not add 3D, WebGL, particles, radar charts, gauge decoration, downloadable PingFang files, or Vercel deployment.
- Preserve the unrelated generated `next-env.d.ts` working-tree change and stage only files from this plan.

---

### Task 1: Add typed visualization derivations

**Files:**
- Create: `src/lib/formula-summary/formula-visualization.ts`
- Create: `tests/formula-result-visualization-data.test.ts`

**Interfaces:**
- Consumes: `FormulaSummaryPeriod`, `FormulaSummaryAction`, `FormulaSummaryContribution`, `FormulaSummaryTargetType` from `formula-summary.ts`.
- Produces: `buildFormulaVisualizationModel`, `buildFormulaInsight`, `buildFormulaParetoRows`, `selectRankSeries`, and their exported result types.

- [ ] **Step 1: Write failing model tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildFormulaInsight,
  buildFormulaParetoRows,
  buildFormulaVisualizationModel,
  selectRankSeries,
} from "@/lib/formula-summary/formula-visualization";

it("uses one global heatmap maximum and calculates median comparison values", () => {
  const model = buildFormulaVisualizationModel(periods, "exclude", "zodiac");
  expect(model.globalMax).toBe(4);
  expect(model.medianValues).toEqual([2, 1.5, 2]);
  expect(model.series.every((item) => item.values.length === periods.length)).toBe(true);
});

it("builds dense ranks per issue and always keeps the selected series", () => {
  const model = buildFormulaVisualizationModel(periods, "exclude", "zodiac");
  const selected = selectRankSeries(model, "string:鸡", 3);
  expect(selected.some((item) => item.targetKey === "string:鸡")).toBe(true);
  expect(selected.every((item) => item.ranks.every((rank) => rank >= 1))).toBe(true);
});

it("aggregates the Pareto tail so the last cumulative point is 100 percent", () => {
  const rows = buildFormulaParetoRows(contributions, 4);
  expect(rows).toHaveLength(4);
  expect(rows.at(-1)?.label).toBe("其他公式");
  expect(rows.at(-1)?.cumulativeShare).toBe(100);
});

it("creates a verifiable Chinese insight from the selected series", () => {
  const model = buildFormulaVisualizationModel(periods, "exclude", "zodiac");
  const insight = buildFormulaInsight(model, "string:鸡");
  expect(insight.latestValue).toBe(4);
  expect(insight.text).toContain("高于十期均值");
  expect(insight.text).toContain("当前排名第");
});
```

- [ ] **Step 2: Run the new tests and verify red state**

Run: `pnpm test -- --run tests/formula-result-visualization-data.test.ts`

Expected: FAIL because `formula-visualization.ts` does not exist.

- [ ] **Step 3: Implement typed pure functions**

```ts
export type FormulaVisualizationSeries = {
  targetKey: string;
  label: string;
  total: number;
  values: number[];
  ranks: number[];
};

export type FormulaVisualizationModel = {
  calculationIssues: string[];
  targetLabels: string[];
  series: FormulaVisualizationSeries[];
  medianValues: number[];
  leaderValues: number[];
  leaderLabels: string[];
  globalMax: number;
};

export type FormulaParetoRow = {
  id: string;
  label: string;
  count: number;
  cumulativeShare: number;
  isRemainder: boolean;
};
```

Implement stable target keys, per-period counts, dense rank calculation (`1, 2, 2, 3`), numeric median, selected-series retention, zero-safe insight comparison, and tail aggregation. Sort ties with `localeCompare("zh-CN")` so repeated runs are deterministic.

- [ ] **Step 4: Run the focused test file and verify green state**

Run: `pnpm test -- --run tests/formula-result-visualization-data.test.ts`

Expected: PASS with 0 failed tests.

- [ ] **Step 5: Commit the derivation layer**

```bash
git add src/lib/formula-summary/formula-visualization.ts tests/formula-result-visualization-data.test.ts
git commit -m "feat: add formula visualization analytics model"
```

### Task 2: Build truthful chart components

**Files:**
- Create: `src/components/formula-visualization-charts.tsx`
- Modify: `src/components/formula-result-visualization.tsx`
- Modify: `tests/formula-result-visualization.test.ts`

**Interfaces:**
- Consumes: `FormulaVisualizationModel`, `FormulaVisualizationSeries`, `FormulaParetoRow` from Task 1.
- Produces: `FormulaComparisonTrend`, `FormulaRankTrajectory`, and `FormulaParetoChart` React components.

- [ ] **Step 1: Extend the component test with new analytical surfaces**

```ts
expect(dialog.textContent).toContain("自动洞察");
expect(dialog.textContent).toContain("相对趋势");
expect(dialog.textContent).toContain("十期排名轨迹");
expect(dialog.textContent).toContain("公式贡献帕累托");
expect(dialog.textContent).toContain("统一色阶");
expect(dialog.textContent).not.toContain("结果构成");
```

Add assertions that SVG accessibility text includes the selected result, median comparison, and rank start/end summary.

- [ ] **Step 2: Run the component test and verify red state**

Run: `pnpm test -- --run tests/formula-result-visualization.test.ts`

Expected: FAIL because the new surfaces do not exist.

- [ ] **Step 3: Implement lightweight SVG chart ownership**

```tsx
export function FormulaComparisonTrend(props: {
  model: FormulaVisualizationModel;
  selected: FormulaVisualizationSeries;
  focusedIssue: string;
  onFocusPeriod: (issue: string) => void;
}) { /* zero-baseline selected/leader/median paths with direct endpoint labels */ }

export function FormulaRankTrajectory(props: {
  model: FormulaVisualizationModel;
  series: FormulaVisualizationSeries[];
  selectedTargetKey: string;
  onSelectTarget: (key: string) => void;
}) { /* rank 1 at top, direct start/end labels, selected stroke emphasis */ }

export function FormulaParetoChart(props: {
  rows: FormulaParetoRow[];
}) { /* zero-baseline contribution bars, cumulative line, 80% reference */ }
```

Use unique gradient IDs derived from component scope, truthful domains, visible endpoint values, `role="img"`, concise `aria-label`, and no essential hover-only tooltip.

- [ ] **Step 4: Replace the misleading composition panel**

In `FormulaResultVisualizationDialog`, compute the model with `useMemo`, render the automated insight and comparison trend, remove `FormulaComposition`, add the rank trajectory and real Pareto chart, and keep all existing result/period selection callbacks.

- [ ] **Step 5: Run component and data tests**

Run: `pnpm test -- --run tests/formula-result-visualization.test.ts tests/formula-result-visualization-data.test.ts`

Expected: PASS with 0 failed tests.

- [ ] **Step 6: Commit chart replacement**

```bash
git add src/components/formula-visualization-charts.tsx src/components/formula-result-visualization.tsx tests/formula-result-visualization.test.ts
git commit -m "feat: upgrade formula analytics charts"
```

### Task 3: Fix global heatmap scale and evidence details

**Files:**
- Modify: `src/components/formula-result-visualization.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/formula-result-visualization.test.ts`

**Interfaces:**
- Consumes: `model.globalMax` and the existing `FormulaSummaryContribution` fields.
- Produces: globally comparable heatmap cells and compact evidence rows with `.rq-formula-viz__target-chips` and `.rq-formula-viz__process`.

- [ ] **Step 1: Add failing DOM-contract tests**

```ts
expect(dialog.querySelector(".rq-formula-viz__heat-legend")).not.toBeNull();
expect(dialog.querySelector(".rq-formula-viz__target-chips")).not.toBeNull();
const evidence = dialog.querySelector(".rq-formula-viz__evidence-row") as HTMLDetailsElement;
evidence.open = true;
expect(evidence.textContent).toContain("计算过程");
expect(evidence.querySelector(".rq-formula-viz__process")).not.toBeNull();
```

- [ ] **Step 2: Run the focused component test and verify red state**

Run: `pnpm test -- --run tests/formula-result-visualization.test.ts`

Expected: FAIL for missing heat legend and evidence structure.

- [ ] **Step 3: Use one heatmap domain**

Replace row-local `rowMax` with `model.globalMax`, expose `--rq-cell-strength` from the global ratio, and render a low-to-high legend with numeric endpoints. Preserve the cell number so magnitude never depends on color alone.

- [ ] **Step 4: Render each result as an independent chip**

```tsx
<span className="rq-formula-viz__target-chips" aria-label={`对应结果：${contribution.targets.join("、")}`}>
  {contribution.targets.map((target) => <i key={String(target)}>{target}</i>)}
</span>
```

Each chip uses `white-space: nowrap`; the chip group may wrap between chips but never inside a result name.

- [ ] **Step 5: Rebuild expanded evidence hierarchy**

Render a two-column metadata surface for 公式/表达式/影响号码 and a separate labeled ordered process list. Hide the process section when `contribution.process` is empty.

- [ ] **Step 6: Run the focused component test**

Run: `pnpm test -- --run tests/formula-result-visualization.test.ts`

Expected: PASS with 0 failed tests.

- [ ] **Step 7: Commit heatmap and evidence fixes**

```bash
git add src/components/formula-result-visualization.tsx src/app/globals.css tests/formula-result-visualization.test.ts
git commit -m "fix: coordinate formula heatmap and evidence"
```

### Task 4: Complete responsive and theme polish

**Files:**
- Modify: `src/app/globals.css`
- Modify: `tests/formula-result-visualization.test.ts`

**Interfaces:**
- Consumes: the class structure created in Tasks 2–3.
- Produces: desktop, <=767px, and <=390px sibling layouts with the same analytical meaning.

- [ ] **Step 1: Add semantic layout markers to the test**

Assert that overview, comparison trend, ranking, rank trajectory, Pareto, matrix, and evidence panels have stable class names and appear in the intended DOM order.

- [ ] **Step 2: Implement desktop hierarchy**

Use the existing 12-column grid: overview 12, ranking 4, comparison trend 8, rank trajectory 7, Pareto 5, heatmap 12, evidence 12. Keep one focal trend panel and reduce equal-weight card appearance.

- [ ] **Step 3: Implement mobile reading order**

At `max-width: 767px`, use CSS order so overview is first, trend second, ranking third, trajectory fourth, Pareto fifth, matrix sixth, evidence seventh. Remove the ranking list's nested max-height on mobile, keep the matrix horizontally scrollable, and preserve a visible reset path.

- [ ] **Step 4: Polish type, spacing, dark mode, and reduced motion**

Keep `--font-sans`/`--font-mono`, use tabular numerals, make header/body scales consistent, verify rose only means exclusion, add line-style redundancy, and disable transitions under `prefers-reduced-motion`.

- [ ] **Step 5: Run focused tests and static CSS checks**

Run: `pnpm test -- --run tests/formula-result-visualization.test.ts`

Run: `pnpm lint`

Expected: both exit 0.

- [ ] **Step 6: Commit responsive polish**

```bash
git add src/app/globals.css tests/formula-result-visualization.test.ts
git commit -m "style: refine formula analytics responsiveness"
```

### Task 5: Verify the full application and rendered flow

**Files:**
- Modify only if a verified regression is found: files from Tasks 1–4.
- Save QA screenshots outside the repository.

**Interfaces:**
- Consumes: final implementation.
- Produces: fresh automated and browser evidence.

- [ ] **Step 1: Run full automated verification**

Run: `pnpm test -- --run`

Run: `pnpm typecheck`

Run: `pnpm lint`

Run: `pnpm build`

Run: `pnpm build:static`

Expected: every command exits 0; tests report 0 failed cases; static output includes `formula-result-statistics/index.html`.

- [ ] **Step 2: Verify desktop browser flow**

Use the in-app Browser at `http://127.0.0.1:3000/formula-result-statistics`: open visualization, select a result, select and clear a period, inspect the insight, trend, rank trajectory, Pareto, global heatmap, and expand a multi-result evidence row. Require no console warnings/errors, no framework overlay, no clipping, and no vertical result text.

- [ ] **Step 3: Verify mobile portrait flow**

Set viewport to `390 × 844`; verify insight and trend appear before ranking, all touch controls remain usable, the matrix scrolls only inside its container, evidence chips wrap between items, and the dialog has no page-level horizontal overflow. Reset the temporary viewport afterward.

- [ ] **Step 4: Verify themes and empty/short data behavior**

Toggle light/dark mode, inspect one single-period result type and one sparse/empty target state, and confirm text contrast, selected/comparison redundancy, fallback copy, and stable layout.

- [ ] **Step 5: Record accepted screenshots**

Save and inspect at least: desktop overview, desktop Pareto/trajectory, expanded evidence, mobile overview, and mobile evidence. Keep them under the Codex visualization workspace, not the repository.

- [ ] **Step 6: Commit any verified final corrections**

Stage only the exact correction files and commit with `fix: finalize formula analytics cockpit` if corrections were necessary.

### Task 6: Publish the verified branch to GitHub

**Files:**
- No generated build output is committed to the source repository.
- Preserve unrelated `next-env.d.ts`.

**Interfaces:**
- Consumes: the verified Git commit from Task 5.
- Produces: pushed branch, draft PR, successful CI, and the existing GitHub Pages deployment path for the approved commit.

- [ ] **Step 1: Install/check GitHub CLI and authentication**

Run: `gh --version`

Run: `gh auth status`

If the executable is missing, install official GitHub CLI through Windows package management using the user's standing installation authorization, reopen PATH for the current shell, and rerun both checks. Do not print or request tokens.

- [ ] **Step 2: Confirm exact publish scope**

Run: `git status -sb`

Run: `git diff --stat main...HEAD`

Run: `git diff --check main...HEAD`

Expected: only design, plan, visualization model, visualization components, tests, and scoped CSS changes are in the branch; `next-env.d.ts` remains unstaged.

- [ ] **Step 3: Commit the implementation plan**

```bash
git add docs/superpowers/plans/2026-08-17-formula-visualization-cockpit.md
git commit -m "docs: plan formula analytics cockpit"
```

- [ ] **Step 4: Push with upstream tracking**

Run: `git push -u origin agent/formula-visualization-cockpit`

Expected: push succeeds without force.

- [ ] **Step 5: Open a draft pull request**

Create a draft PR targeting the remote default branch. The body must explain the badge/detail root cause, misleading chart encodings, mobile reading-order fix, test/build/static verification, and remaining deployment notes.

- [ ] **Step 6: Verify CI and GitHub Pages**

Wait for required checks. After the approved commit reaches the publishing branch/workflow, verify the existing public Pages route for `/formula-result-statistics/`, the dashboard, and `static-cloud-state.json` return HTTP 200 and show the same latest issue. Do not use or restore Vercel.
