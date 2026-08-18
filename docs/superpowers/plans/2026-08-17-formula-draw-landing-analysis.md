# Formula Draw Landing Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every result in the formula matrix and add an auditable latest-ten completed-draw analysis that identifies the actual result, its formula count, and its same-period rank on desktop and mobile.

**Architecture:** Extend each formula summary period with the normalized next draw, then derive complete domains, per-period counts, competition ranks, landing records, KPIs, and insight in a new pure data module. Keep React responsible only for focus state and orchestration; place the combination chart and complete matrix in focused components that consume the derived model and reuse the existing RuleQuant glass tokens.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Vitest 4 with jsdom, CSS design tokens in `src/app/globals.css`, Lucide React icons, existing worker-based summary pipeline, hand-authored accessible SVG charts.

## Global Constraints

- Preserve the existing RuleQuant iOS glass visual language, typography tokens, radii, spacing, dark mode, reduced transparency, and reduced motion behavior.
- Do not add parity or size statistics; retain half-head and half-color statistics.
- Exclusion mode copy is `被排除次数`; support mode copy is `被支持次数`; use neutral `实际开奖落点` wording and never describe exclusion of the actual result as a successful hit.
- Calculation issue `N` is evaluated only against the next record in sorted draw order; never create the target issue by arithmetic string manipulation.
- The landing window contains the latest ten completed target issues; the newest pending target is displayed separately and excluded from KPIs.
- Competition ranking uses `1, 2, 2, 4`; ties display `并列第 N 位`; zero-count results remain in the complete domain.
- Complete domains are: 12 configured zodiacs, tails 0–9, heads 0–4, sums 1–13, configured segments, configured elements, configured colors, ten half-head labels, six half-color labels, doors 1–5, and numbers 01–49.
- The complete matrix shows the latest ten calculation rows, including the pending row when present; number results use seven-column blocks instead of a 49-column strip.
- No new chart dependency, route, third-level modal, 3D/WebGL effect, Vercel deployment, or publication is permitted.
- Load and verify locally first; publish only after the user explicitly asks after reviewing the local result.

---

## File Responsibility Map

- `src/lib/formula-summary/formula-summary.ts`: attach a serializable normalized next-draw result and a scoped target-normalization warning to each period.
- `src/lib/formula-summary/formula-draw-landing.ts`: own complete domains, actual-result resolution, complete counts, competition ranks, landing records, KPIs, and deterministic insight copy.
- `src/components/formula-draw-landing-chart.tsx`: render the accessible count-bar/rank-line combination chart and period interaction targets.
- `src/components/formula-complete-matrix.tsx`: render all target values, actual-result markers, sticky period labels, and the seven-column number layout.
- `src/components/formula-result-visualization.tsx`: orchestrate one shared focused issue, insert landing analytics, feed the complete matrix, and filter evidence.
- `src/components/formula-result-statistics-view.tsx`: request eleven source periods so ten completed target pairs plus the pending pair are available while keeping the existing “最近十期” surface at ten calculation rows.
- `src/app/globals.css`: style only the new landing and complete-matrix states with existing variables and responsive conventions.
- `tests/formula-summary.test.ts`: verify next-draw attachment, pending behavior, and isolated normalization warnings.
- `tests/formula-draw-landing.test.ts`: verify every complete domain, actual-key resolution, count/rank semantics, completed window, KPI values, and copy.
- `tests/formula-result-statistics-view.test.ts`: verify the eleven-period worker request and ten-row visible range.
- `tests/formula-draw-landing-chart.test.tsx`: verify chart semantics, labels, average reference, and keyboard/click focus.
- `tests/formula-complete-matrix.test.tsx`: verify all-domain rendering, actual markers, number blocks, pending state, and interactions.
- `tests/formula-result-visualization.test.ts`: verify panel order, shared focus state, record-to-evidence filtering, clear behavior, and accessible modal behavior.

### Task 1: Attach the Actual Next Draw to Formula Summary Periods

**Files:**
- Modify: `src/lib/formula-summary/formula-summary.ts:35-62,294-378`
- Modify: `tests/formula-summary.test.ts:43-199`

**Interfaces:**
- Consumes: `normalizeDraw(draw: DrawRecord, config: RuleQuantConfig): NormalizedDraw`.
- Produces: `FormulaSummaryTargetResult`, `FormulaSummaryPeriod.targetResult`, and `FormulaSummaryPeriod.targetResultWarning` for the landing derivation module.

- [ ] **Step 1: Write failing target-result and warning tests**

Add these assertions to the period-alignment test and add a dedicated invalid-target test:

```ts
expect(report.periods[0].targetResult).toMatchObject({
  issue: "102",
  number: 14,
  head: 1,
  tail: 4,
  sum: 5,
  segment: 2,
  parity: "双",
});
expect(report.latestPeriod?.targetResult).toBeUndefined();
expect(report.latestPeriod?.targetResultWarning).toBeUndefined();

it("isolates an invalid target draw without discarding source contributions", () => {
  const invalidTarget = { ...draws[1], special: 50 };
  const report = buildFormulaSummaryReport({
    draws: [draws[0], invalidTarget],
    config: defaultConfig,
    rules: [makeRule("kill-a", "kill_zodiac", "平1")],
  });

  expect(report.periods[0].contributions).toHaveLength(1);
  expect(report.periods[0].targetResult).toBeUndefined();
  expect(report.periods[0].targetResultWarning).toContain("号码必须在 1-49 之间");
});
```

- [ ] **Step 2: Run the focused summary test and confirm the new assertions fail**

Run: `pnpm exec vitest run tests/formula-summary.test.ts`

Expected: FAIL because `targetResult` and `targetResultWarning` do not exist.

- [ ] **Step 3: Add the serializable result type and period fields**

Add this public type next to `FormulaSummaryPeriod`:

```ts
export type FormulaSummaryTargetResult = {
  issue: string;
  number: number;
  zodiac: string;
  tail: number;
  head: number;
  sum: number;
  segment: number;
  element: string;
  color: string;
  parity: "单" | "双";
};

export type FormulaSummaryPeriod = {
  calculationIssue: string;
  calculationDate?: string;
  targetIssue?: string;
  targetLabel: string;
  isPending: boolean;
  targetResult?: FormulaSummaryTargetResult;
  targetResultWarning?: string;
  contributions: FormulaSummaryContribution[];
  skippedRules: FormulaSummarySkippedRule[];
};
```

- [ ] **Step 4: Normalize the target draw independently from the source calculation**

Immediately after creating `periodIdentity`, derive target state before normalizing the source draw:

```ts
const targetDraw = sortedDraws[index + 1];
let targetResult: FormulaSummaryTargetResult | undefined;
let targetResultWarning: string | undefined;

if (targetDraw) {
  try {
    const target = normalizeDraw(targetDraw, input.config).specialAttributes;
    targetResult = {
      issue: targetDraw.issue,
      number: target.number,
      zodiac: target.zodiac,
      tail: target.tail,
      head: target.head,
      sum: target.sum,
      segment: target.segment,
      element: target.element,
      color: target.color,
      parity: target.parity,
    };
  } catch (error) {
    targetResultWarning = error instanceof Error ? error.message : String(error);
  }
}
```

Include `targetResult` and `targetResultWarning` in both `periods.push(...)` branches, but do not spread them into `FormulaSummaryContribution`.

- [ ] **Step 5: Run summary tests, typecheck, and commit**

Run: `pnpm exec vitest run tests/formula-summary.test.ts && pnpm typecheck`

Expected: both commands exit 0.

Commit:

```bash
git add src/lib/formula-summary/formula-summary.ts tests/formula-summary.test.ts
git commit -m "feat: attach actual target draws to formula periods"
```

### Task 2: Derive Complete Domains, Landing Counts, Ranks, KPIs, and Insight

**Files:**
- Create: `src/lib/formula-summary/formula-draw-landing.ts`
- Create: `tests/formula-draw-landing.test.ts`

**Interfaces:**
- Consumes: `FormulaSummaryPeriod[]`, `FormulaSummaryAction`, `FormulaSummaryTargetType`, and `RuleQuantConfig`.
- Produces: `buildFormulaDrawLandingAnalysis(input): FormulaDrawLandingAnalysis`, used by the chart, matrix, and dialog.

- [ ] **Step 1: Write failing complete-domain tests**

Create the test file with a table that checks every domain size and exact representative labels:

```ts
describe("formula draw landing domains", () => {
  it.each([
    ["zodiac", 12, "马", "羊"],
    ["tail", 10, "0", "9"],
    ["head", 5, "0", "4"],
    ["sum", 13, "1", "13"],
    ["segment", 7, "1", "7"],
    ["element", 5, "金", "土"],
    ["color", 3, "红", "绿"],
    ["half-head", 10, "0头单", "4头双"],
    ["half-color", 6, "红波单", "绿波双"],
    ["door", 5, "1门", "5门"],
    ["number", 49, "01", "49"],
  ] as const)("builds the complete %s domain", (targetType, size, first, last) => {
    const domain = buildFormulaTargetDomain(targetType, defaultConfig);
    expect(domain).toHaveLength(size);
    expect(domain[0].label).toBe(first);
    expect(domain.at(-1)?.label).toBe(last);
  });
});
```

- [ ] **Step 2: Write failing record, ranking, window, and KPI tests**

Add these fixture builders so the expected counts are visible in the test itself:

```ts
const actual14: FormulaSummaryTargetResult = {
  issue: "102",
  number: 14,
  zodiac: "蛇",
  tail: 4,
  head: 1,
  sum: 5,
  segment: 2,
  element: "水",
  color: "蓝",
  parity: "双",
};

function zodiacContribution(issue: string, ruleId: string, targets: string[]): FormulaSummaryContribution {
  return {
    id: `${issue}:${ruleId}`,
    calculationIssue: issue,
    targetIssue: String(Number(issue) + 1),
    targetLabel: String(Number(issue) + 1),
    isPending: false,
    ruleId,
    ruleName: ruleId,
    category: "kill_zodiac",
    formula: "平1",
    expression: "平1",
    action: "exclude",
    targetType: "zodiac",
    targets,
    process: [],
  };
}

function completedPeriod(
  calculationIssue: string,
  zodiac: string,
  contributions: FormulaSummaryContribution[],
): FormulaSummaryPeriod {
  const targetIssue = String(Number(calculationIssue) + 1);
  return {
    calculationIssue,
    targetIssue,
    targetLabel: targetIssue,
    isPending: false,
    targetResult: { ...actual14, issue: targetIssue, zodiac },
    contributions,
    skippedRules: [],
  };
}

const periods = [
  completedPeriod("101", "龙", [
    zodiacContribution("101", "r1", ["龙", "兔"]),
    zodiacContribution("101", "r2", ["龙"]),
  ]),
  completedPeriod("102", "龙", [
    zodiacContribution("102", "r1", ["龙"]),
    zodiacContribution("102", "r2", ["兔"]),
    zodiacContribution("102", "r3", ["兔"]),
  ]),
  completedPeriod("103", "龙", []),
];

const analysis = buildFormulaDrawLandingAnalysis({
  periods,
  action: "exclude",
  targetType: "zodiac",
  config: defaultConfig,
});
```

Assert the actual 龙 landing counts `[2, 1, 0]` and ranks `[1, 2, 1]`:

```ts
expect(analysis.records.map((record) => ({
  issue: record.targetIssue,
  label: record.actualLabel,
  count: record.count,
  rank: record.rank,
}))).toEqual([
  { issue: "102", label: "龙", count: 2, rank: 1 },
  { issue: "103", label: "龙", count: 1, rank: 2 },
  { issue: "104", label: "龙", count: 0, rank: 1 },
]);
expect(analysis.kpis).toEqual({
  averageCount: 1,
  topThreePeriods: 3,
  averageRank: 1.3,
  maxCount: 2,
});
```

Create a fourth period with four 龙 contributions, three 兔 contributions, three 虎 contributions, and one 牛 contribution, set 兔 as the actual result, and assert:

```ts
expect(tiedRecord.rank).toBe(2);
expect(tiedRecord.tieCount).toBe(2);
expect(tiedRecord.rankLabel).toBe("并列第 2 位");
```

Build twelve source periods and assert `records` contains the newest ten completed target issues, `pendingPeriod` is separate, and `matrixPeriods` contains only the latest ten calculation rows.

Add a table-driven resolver test for one normalized target result:

```ts
it.each([
  ["zodiac", "蛇"],
  ["tail", "4"],
  ["head", "1"],
  ["sum", "5"],
  ["segment", "2"],
  ["element", "水"],
  ["color", "蓝"],
  ["half-head", "1头双"],
  ["half-color", "蓝波双"],
  ["door", "2门"],
  ["number", "14"],
] as const)("resolves the actual %s landing", (targetType, label) => {
  expect(resolveFormulaActualTarget(actual14, targetType).label).toBe(label);
});
```

- [ ] **Step 3: Run the new test and confirm the module is missing**

Run: `pnpm exec vitest run tests/formula-draw-landing.test.ts`

Expected: FAIL because `@/lib/formula-summary/formula-draw-landing` cannot be resolved.

- [ ] **Step 4: Define the public landing model and stable target keys**

Create the module with these exact interfaces:

```ts
export type FormulaLandingDomainItem = {
  target: FormulaSummaryTarget;
  targetKey: string;
  label: string;
};

export type FormulaLandingSeries = FormulaLandingDomainItem & {
  total: number;
  values: number[];
  ranks: number[];
};

export type FormulaDrawLandingRecord = {
  calculationIssue: string;
  targetIssue: string;
  specialNumber: number;
  actualTarget: FormulaSummaryTarget;
  actualTargetKey: string;
  actualLabel: string;
  count: number;
  rank: number;
  tieCount: number;
  rankLabel: string;
  contributions: FormulaSummaryContribution[];
};

export type FormulaLandingKpis = {
  averageCount: number;
  topThreePeriods: number;
  averageRank: number;
  maxCount: number;
};

export type FormulaDrawLandingAnalysis = {
  domain: FormulaLandingDomainItem[];
  matrixPeriods: FormulaSummaryPeriod[];
  series: FormulaLandingSeries[];
  records: FormulaDrawLandingRecord[];
  pendingPeriod?: FormulaSummaryPeriod;
  kpis: FormulaLandingKpis;
  insight: string;
  globalMax: number;
  warningCount: number;
};

export type FormulaDrawLandingInput = {
  periods: FormulaSummaryPeriod[];
  action: FormulaSummaryAction;
  targetType: FormulaSummaryTargetType;
  config: RuleQuantConfig;
  completedLimit?: number;
  matrixLimit?: number;
};

export function formulaTargetKey(target: FormulaSummaryTarget): string {
  return `${typeof target}:${String(target)}`;
}

export function buildFormulaTargetDomain(
  targetType: FormulaSummaryTargetType,
  config: RuleQuantConfig,
): FormulaLandingDomainItem[];

export function resolveFormulaActualTarget(
  result: FormulaSummaryTargetResult,
  targetType: FormulaSummaryTargetType,
): FormulaLandingDomainItem;

export function buildFormulaDrawLandingAnalysis(
  input: FormulaDrawLandingInput,
): FormulaDrawLandingAnalysis;
```

- [ ] **Step 5: Implement every complete domain and actual-result resolver**

Implement `buildFormulaTargetDomain(targetType, config)` with configured ordering and these exact derived labels:

```ts
const halfHeads = Array.from({ length: 5 }, (_, head) =>
  (["单", "双"] as const).map((parity) => `${head}头${parity}`),
).flat();
const halfColors = Object.keys(config.colorTable).flatMap((color) => [
  `${color}波单`,
  `${color}波双`,
]);
const doors = Array.from({ length: 5 }, (_, index) => `${index + 1}门`);
```

Implement and export `resolveFormulaActualTarget(result, targetType)` using `result.zodiac`, `tail`, `head`, `sum`, `segment`, `element`, `color`, `${head}头${parity}`, `${color}波${parity}`, a 1–9/10–18/19–27/28–37/38–49 door resolver, or `result.number` respectively. Format only the `number` domain with two digits.

- [ ] **Step 6: Implement unique-contribution counts and competition ranks**

For each period, filter contributions by action/type, deduplicate each contribution’s target list with `formulaTargetKey`, and increment each target once. For each domain value use:

```ts
const count = counts.get(item.targetKey)?.length ?? 0;
const rank = 1 + domain.filter((candidate) =>
  (counts.get(candidate.targetKey)?.length ?? 0) > count,
).length;
const tieCount = domain.filter((candidate) =>
  (counts.get(candidate.targetKey)?.length ?? 0) === count,
).length;
const rankLabel = tieCount > 1 ? `并列第 ${rank} 位` : `第 ${rank} 位`;
```

Derive `series` against `periods.slice(-10)`, `records` from the latest ten periods with `targetResult`, `pendingPeriod` from the newest `isPending` period, and `warningCount` from defined `targetResultWarning` values.

- [ ] **Step 7: Implement rounded KPIs and deterministic action-aware insight**

Use one-decimal rounding for averages and this copy structure:

```ts
const actionCopy = action === "exclude" ? "被排除" : "被支持";
const insight = records.length === 0
  ? "当前暂无已开奖期可验证实际结果。"
  : `最近${records.length}个已开奖期中，实际结果平均${actionCopy}${averageCount}次，${topThreePeriods}期落在前三位；最近一期为${latest.actualLabel}，${actionCopy}${latest.count}次，${latest.rankLabel}。`;
```

- [ ] **Step 8: Run pure tests, typecheck, and commit**

Run: `pnpm exec vitest run tests/formula-draw-landing.test.ts tests/formula-summary.test.ts && pnpm typecheck`

Expected: all tests pass and typecheck exits 0.

Commit:

```bash
git add src/lib/formula-summary/formula-draw-landing.ts tests/formula-draw-landing.test.ts
git commit -m "feat: derive formula draw landing analysis"
```

### Task 3: Load Ten Completed Targets Plus Pending Without Changing the Main Ten-Period View

**Files:**
- Modify: `src/components/formula-result-statistics-view.tsx:125-180,325-393`
- Modify: `tests/formula-result-statistics-view.test.ts:27-144`

**Interfaces:**
- Consumes: the unchanged worker request contract `{ draws, rules, config, maxPeriods }`.
- Produces: an eleven-period report for the dialog and a ten-calculation-period `visiblePeriods` list for the existing page ranking.

- [ ] **Step 1: Add a failing eleven-period worker assertion and ten-row range test**

Change the worker expectation and add twelve valid draws to a new test:

```ts
expect(WorkerStub.instance?.postMessage).toHaveBeenCalledWith({
  draws,
  rules,
  config: defaultConfig,
  maxPeriods: 11,
});

it("keeps the page recent range at ten calculation periods", async () => {
  const longDraws = Array.from({ length: 12 }, (_, index) => ({
    issue: String(101 + index),
    n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6,
    special: index % 49 + 1,
  }));
  await renderView({ draws: longDraws });
  await act(async () => findButton("最近十期").click());
  expect(host?.textContent).toContain("10 个计算期");
});
```

Adjust the local `renderView` helper to accept `{ draws?: DrawRecord[] }` while defaulting to the existing fixture.

- [ ] **Step 2: Run the view test and confirm it fails on maxPeriods 10**

Run: `pnpm exec vitest run tests/formula-result-statistics-view.test.ts`

Expected: FAIL because the request still sends `maxPeriods: 10`.

- [ ] **Step 3: Introduce explicit prepared and visible window constants**

Add and use:

```ts
const FORMULA_SUMMARY_PREPARED_PERIODS = 11;
const FORMULA_SUMMARY_VISIBLE_PERIODS = 10;

const visiblePeriods = useMemo(
  () => rangeMode === "latest"
    ? report.periods.slice(-1)
    : report.periods.slice(-FORMULA_SUMMARY_VISIBLE_PERIODS),
  [rangeMode, report.periods],
);
```

Pass `FORMULA_SUMMARY_PREPARED_PERIODS` to both synchronous `buildFormulaSummaryReport` and the worker message. Keep `periods={report.periods}` on the visualization so its pure derivation can select ten completed records.

- [ ] **Step 4: Pass configuration into the visualization dialog with a complete typed contract**

Add `config={config}` to `LazyFormulaResultVisualizationDialog` and add `config: RuleQuantConfig` to `FormulaResultVisualizationDialogProps`. Task 6 will consume the already-valid prop.

- [ ] **Step 5: Run the view tests, typecheck, and commit**

Run: `pnpm exec vitest run tests/formula-result-statistics-view.test.ts && pnpm typecheck`

Expected: tests pass and typecheck exits 0; the typed dialog prop exists even though its first consumer is added in Task 6.

Commit:

```bash
git add src/components/formula-result-statistics-view.tsx src/components/formula-result-visualization.tsx tests/formula-result-statistics-view.test.ts
git commit -m "feat: prepare complete formula landing window"
```

### Task 4: Build the Count-Bar and Rank-Line Combination Chart

**Files:**
- Create: `src/components/formula-draw-landing-chart.tsx`
- Create: `tests/formula-draw-landing-chart.test.tsx`

**Interfaces:**
- Consumes: `FormulaDrawLandingRecord[]`, `focusedIssue: string`, `unitLabel: string`, and `onFocusIssue(issue: string): void`.
- Produces: `FormulaDrawLandingChart`, with interactive `data-landing-issue` points and an accessible chart summary.

- [ ] **Step 1: Write failing semantic and interaction tests**

Render these three records:

```ts
const records: FormulaDrawLandingRecord[] = [
  { calculationIssue: "101", targetIssue: "102", specialNumber: 14, actualTarget: "龙", actualTargetKey: "string:龙", actualLabel: "龙", count: 2, rank: 1, tieCount: 1, rankLabel: "第 1 位", contributions: [] },
  { calculationIssue: "102", targetIssue: "103", specialNumber: 21, actualTarget: "兔", actualTargetKey: "string:兔", actualLabel: "兔", count: 1, rank: 3, tieCount: 1, rankLabel: "第 3 位", contributions: [] },
  { calculationIssue: "103", targetIssue: "104", specialNumber: 28, actualTarget: "虎", actualTargetKey: "string:虎", actualLabel: "虎", count: 3, rank: 2, tieCount: 2, rankLabel: "并列第 2 位", contributions: [] },
];
const onFocusIssue = vi.fn();
await act(async () => root.render(
  <FormulaDrawLandingChart records={records} focusedIssue="all" unitLabel="被排除次数" onFocusIssue={onFocusIssue} />,
));
```

Then assert:

```ts
expect(host.querySelector('svg[aria-label*="第1位在上"]')).not.toBeNull();
expect(host.querySelectorAll(".rq-formula-landing-chart__bar")).toHaveLength(3);
expect(host.querySelectorAll(".rq-formula-landing-chart__rank-line")).toHaveLength(1);
expect(host.querySelector(".rq-formula-landing-chart__average-line")).not.toBeNull();
expect(host.textContent).toContain("龙 · 14");

const point = host.querySelector<SVGGElement>('[data-landing-issue="101"]')!;
await act(async () => point.dispatchEvent(new MouseEvent("click", { bubbles: true })));
expect(onFocusIssue).toHaveBeenCalledWith("101");
await act(async () => point.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
expect(onFocusIssue).toHaveBeenCalledTimes(2);
```

Add a one-record case that asserts the average line is absent.

Add a zero-record case that asserts the component renders `当前暂无已开奖期可验证实际结果` and does not render an SVG with fabricated axes.

- [ ] **Step 2: Run the chart test and confirm the component is missing**

Run: `pnpm exec vitest run tests/formula-draw-landing-chart.test.tsx`

Expected: FAIL because the chart component cannot be resolved.

- [ ] **Step 3: Implement truthful dual axes and geometry**

Use a fixed `760 × 300` viewBox, a left count axis, and a right rank axis whose `rank = 1` maps to the plot top:

```ts
const yCount = (count: number) => top + plotHeight - count / maxCount * plotHeight;
const yRank = (rank: number) => top + (rank - 1) / Math.max(1, maxRank - 1) * plotHeight;
const average = records.reduce((sum, record) => sum + record.count, 0) / records.length;
```

Return the tested neutral empty state when `records.length === 0`. Otherwise render count bars with `.rq-formula-landing-chart__bar`, one rank path with `.rq-formula-landing-chart__rank-line`, and the dashed average reference only when `records.length >= 2`. Title axes with visible `次数` and `当期位置 · 第1位在上` text.

- [ ] **Step 4: Add direct labels and keyboard-operable points**

Each point group must use:

```tsx
<g
  role="button"
  tabIndex={0}
  data-landing-issue={record.calculationIssue}
  aria-label={`${record.targetIssue}期，实际${record.actualLabel}，特码${String(record.specialNumber).padStart(2, "0")}，${unitLabel}${record.count}，${record.rankLabel}`}
  onClick={() => onFocusIssue(record.calculationIssue)}
  onKeyDown={(event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onFocusIssue(record.calculationIssue);
    }
  }}
>
```

Place `${record.actualLabel} · ${twoDigitNumber}` beside each point and expose the whole sequence in the parent SVG `aria-label`.

- [ ] **Step 5: Run chart tests, typecheck, and commit**

Run: `pnpm exec vitest run tests/formula-draw-landing-chart.test.tsx && pnpm typecheck`

Expected: both commands exit 0.

Commit:

```bash
git add src/components/formula-draw-landing-chart.tsx tests/formula-draw-landing-chart.test.tsx
git commit -m "feat: add formula landing combination chart"
```

### Task 5: Build the Complete Result Matrix and Actual-Draw Marker

**Files:**
- Create: `src/components/formula-complete-matrix.tsx`
- Create: `tests/formula-complete-matrix.test.tsx`

**Interfaces:**
- Consumes: `FormulaDrawLandingAnalysis`, target type, selected target key, focused issue, and shared selection/focus callbacks.
- Produces: `FormulaCompleteMatrix`, replacing the dialog’s six-series inline matrix.

- [ ] **Step 1: Write failing zodiac completeness and actual-marker tests**

Build a zodiac analysis whose contributions mention only 龙 and 兔:

```ts
const period: FormulaSummaryPeriod = {
  calculationIssue: "101",
  targetIssue: "102",
  targetLabel: "102",
  isPending: false,
  targetResult: {
    issue: "102",
    number: 15,
    zodiac: "龙",
    tail: 5,
    head: 1,
    sum: 6,
    segment: 3,
    element: "水",
    color: "蓝",
    parity: "单",
  },
  contributions: [
    contribution("101", "r1", ["龙", "兔"]),
    contribution("101", "r2", ["龙"]),
  ],
  skippedRules: [],
};
const analysis = buildFormulaDrawLandingAnalysis({
  periods: [period],
  action: "exclude",
  targetType: "zodiac",
  config: defaultConfig,
});
```

Use a local `contribution(issue, ruleId, targets)` factory with the complete `FormulaSummaryContribution` shape from Task 2, render the component, and assert:

```ts
expect(host.querySelectorAll("[data-matrix-target]")).toHaveLength(12);
expect(host.textContent).toContain("马");
expect(host.textContent).toContain("羊");
const actual = host.querySelector<HTMLButtonElement>('[data-actual-landing="true"]')!;
expect(actual).not.toBeNull();
expect(actual.getAttribute("aria-label")).toContain("实际开奖");
expect(actual.getAttribute("aria-label")).toContain("当期位置");
await act(async () => actual.click());
expect(onSelectTarget).toHaveBeenCalledWith("string:龙");
expect(onFocusIssue).toHaveBeenCalledWith("101");
```

Add a pending-period assertion for `待开奖` and no actual marker.

- [ ] **Step 2: Write a failing 49-number seven-column layout test**

Render one number period and assert:

```ts
expect(host.querySelector(".rq-formula-complete-matrix.is-number")).not.toBeNull();
expect(host.querySelectorAll("[data-number-cell]")).toHaveLength(49);
expect(host.querySelector("[data-number-cell='01']")).not.toBeNull();
expect(host.querySelector("[data-number-cell='49']")).not.toBeNull();
```

- [ ] **Step 3: Run the matrix test and confirm the component is missing**

Run: `pnpm exec vitest run tests/formula-complete-matrix.test.tsx`

Expected: FAIL because `FormulaCompleteMatrix` cannot be resolved.

- [ ] **Step 4: Implement the non-number complete-domain grid**

Use `analysis.domain` for headers and `analysis.series` for values. Build `recordByIssue` and render `Target` from `lucide-react` only in the matching cell. The marked cell visibly renders the two-digit special number beside the icon; its accessible label contains calculation issue, target issue, special number, actual label, count, and `rankLabel`. Apply `.is-actual` and `data-actual-landing="true"` in addition to heat color.

Set the grid template from the full domain:

```tsx
style={{
  gridTemplateColumns: `minmax(112px, 1.25fr) repeat(${analysis.domain.length}, minmax(66px, 1fr))`,
}}
```

Keep the period button sticky through CSS, show `→ 待开奖` for pending, and call both callbacks from every data cell.

- [ ] **Step 5: Implement number results as seven-column period blocks**

For `targetType === "number"`, render one period article at a time with a sticky issue header and:

```tsx
<div className="rq-formula-complete-matrix__number-grid">
  {analysis.domain.map((item) => (
    <button key={item.targetKey} data-number-cell={item.label} type="button">
      <small>{item.label}</small>
      <strong>{seriesByKey.get(item.targetKey)?.values[periodIndex] ?? 0}</strong>
    </button>
  ))}
</div>
```

Apply the same heat strength, actual marker, aria label, selected target, focused period, and callback behavior as the non-number grid.

- [ ] **Step 6: Run matrix tests, typecheck, and commit**

Run: `pnpm exec vitest run tests/formula-complete-matrix.test.tsx && pnpm typecheck`

Expected: both commands exit 0.

Commit:

```bash
git add src/components/formula-complete-matrix.tsx tests/formula-complete-matrix.test.tsx
git commit -m "feat: show complete formula result matrix"
```

### Task 6: Integrate Landing KPIs, Records, Shared Focus, Matrix, and Evidence

**Files:**
- Modify: `src/components/formula-result-visualization.tsx:1-314`
- Modify: `tests/formula-result-visualization.test.ts:1-190`

**Interfaces:**
- Consumes: `config: RuleQuantConfig`, `buildFormulaDrawLandingAnalysis`, `FormulaDrawLandingChart`, and `FormulaCompleteMatrix`.
- Produces: the finished dialog interaction: chart/record/matrix selections all write one `focusedLandingIssue` and filter formula evidence consistently.

- [ ] **Step 1: Extend the dialog tests with the new analytical surface**

After opening the visualization, assert:

```ts
expect(dialog.textContent).toContain("近十期开奖落点趋势");
expect(dialog.textContent).toContain("实际结果平均次数");
expect(dialog.textContent).toContain("落在前三期数");
expect(dialog.textContent).toContain("实际结果平均位置");
expect(dialog.textContent).toContain("单期最高次数");
expect(dialog.textContent).toContain("实际开奖落点记录");
expect(dialog.textContent).toContain("期次 × 全部结果");
expect(dialog.querySelector('svg[aria-label*="第1位在上"]')).not.toBeNull();
```

Expand the fixture to at least four draws whose target special results are known, and assert that clicking `[data-landing-issue]`, `[data-landing-record]`, and `[data-actual-landing]` sets the same focused calculation issue and produces evidence rows only for that issue and actual target.

- [ ] **Step 2: Run the dialog test and confirm the new panels are absent**

Run: `pnpm exec vitest run tests/formula-result-visualization.test.ts`

Expected: FAIL because the landing panel and complete matrix have not been integrated.

- [ ] **Step 3: Add config and one shared focus state**

Update props and state:

```ts
export type FormulaResultVisualizationDialogProps = {
  periods: FormulaSummaryPeriod[];
  action: FormulaSummaryAction;
  targetType: FormulaSummaryTargetType;
  config: RuleQuantConfig;
  selectedTargetKey: string;
  onSelectTarget: (targetKey: string) => void;
  onClose: () => void;
  returnFocusRef: MutableRefObject<HTMLElement | null>;
};

const [focusedLandingIssue, setFocusedLandingIssue] = useState("all");
const landing = useMemo(() => buildFormulaDrawLandingAnalysis({
  periods,
  action,
  targetType,
  config,
  completedLimit: 10,
  matrixLimit: 10,
}), [action, config, periods, targetType]);
```

Replace every use of `focusedIssue` with `focusedLandingIssue`. Existing comparison-period buttons, landing chart points, landing records, and matrix cells must all toggle or set this same value.

- [ ] **Step 4: Insert the landing analysis panel**

After the trajectory/Pareto row and before the matrix, render a full-width section containing:

```tsx
<section className="rq-formula-viz__landing-panel" aria-labelledby="formula-landing-title">
  <header>
    <div><span>实际结果 · 次数 · 当期位置</span><h3 id="formula-landing-title">近十期开奖落点趋势</h3></div>
    <Badge tone={action === "exclude" ? "rose" : "cyan"}>{landing.records.length}期已验证{landing.pendingPeriod ? " · 1期待开奖" : ""}</Badge>
  </header>
  <div className="rq-formula-viz__landing-insight"><strong>{landing.insight}</strong></div>
  <div className="rq-formula-viz__landing-kpis">
    <article><span>实际结果平均次数</span><strong>{landing.kpis.averageCount}<small>次</small></strong></article>
    <article><span>落在前三期数</span><strong>{landing.kpis.topThreePeriods}<small>期</small></strong></article>
    <article><span>实际结果平均位置</span><strong>{landing.kpis.averageRank}<small>位</small></strong></article>
    <article><span>单期最高次数</span><strong>{landing.kpis.maxCount}<small>次</small></strong></article>
  </div>
  <FormulaDrawLandingChart
    records={landing.records}
    focusedIssue={focusedLandingIssue}
    unitLabel={unitLabel}
    onFocusIssue={setFocusedLandingIssue}
  />
</section>
```

When `landing.warningCount > 0`, render `<p role="status">{landing.warningCount}期开奖数据暂时无法标准化，已从落点分析中排除。</p>` below the badge; do not suppress contribution statistics for those periods.

- [ ] **Step 5: Add the auditable landing record list**

Render a semantic table below the chart on desktop and the same rows as CSS-stacked cards on mobile. Each row uses `data-landing-record={record.calculationIssue}` and contains calculation issue, target issue, `${twoDigitSpecial} · ${actualLabel}`, action count, `rankLabel`, `new Set(contributions.map(ruleId)).size`, and a `查看` button. Pending appears after completed rows with `下期待开奖 · 待验证` and no invented number.

Use this row structure so desktop columns and mobile `data-label` values share the same source:

```tsx
<tbody>
  {landing.records.map((record) => (
    <tr key={record.calculationIssue} data-landing-record={record.calculationIssue}>
      <td data-label="计算期">{record.calculationIssue}</td>
      <td data-label="开奖期">{record.targetIssue}</td>
      <td data-label="实际特码 / 结果"><strong>{String(record.specialNumber).padStart(2, "0")}</strong><span>{record.actualLabel}</span></td>
      <td data-label="次数">{record.count}次</td>
      <td data-label="当期位置">{record.rankLabel}</td>
      <td data-label="贡献公式">{new Set(record.contributions.map((item) => item.ruleId)).size}条</td>
      <td><button type="button" onClick={() => focusLandingRecord(record)}>查看</button></td>
    </tr>
  ))}
</tbody>
```

The `查看` handler must call:

```ts
function focusLandingRecord(record: FormulaDrawLandingRecord) {
  onSelectTarget(record.actualTargetKey);
  setFocusedLandingIssue(record.calculationIssue);
}
```

- [ ] **Step 6: Replace the inline six-series matrix**

Remove the inline `.rq-formula-viz__matrix-scroll` implementation and render:

```tsx
<FormulaCompleteMatrix
  analysis={landing}
  targetType={targetType}
  selectedTargetKey={effectiveTargetKey}
  focusedIssue={focusedLandingIssue}
  onSelectTarget={onSelectTarget}
  onFocusIssue={setFocusedLandingIssue}
/>
```

Keep `selectRankSeries(model, effectiveTargetKey, 6)` only for `FormulaRankTrajectory`; it must no longer limit the matrix.

- [ ] **Step 7: Filter evidence for actual zero-count and nonzero-count records correctly**

Derive evidence directly from all periods instead of relying only on the aggregate `group` item:

```ts
const selectedContributions = periods.flatMap((period) => period.contributions).filter((contribution) => (
  contribution.action === action
  && contribution.targetType === targetType
  && (focusedLandingIssue === "all" || contribution.calculationIssue === focusedLandingIssue)
  && contribution.targets.some((target) => formulaTargetKey(target) === effectiveTargetKey)
));
```

This must yield an honest empty evidence state when the actual result count is 0 and exact contributing formulas when it is positive. The existing `清除期次筛选` button sets `focusedLandingIssue` back to `all`.

- [ ] **Step 8: Run component tests, all formula tests, typecheck, and commit**

Run:

```bash
pnpm exec vitest run tests/formula-result-visualization.test.ts tests/formula-result-statistics-view.test.ts tests/formula-complete-matrix.test.tsx tests/formula-draw-landing-chart.test.tsx tests/formula-draw-landing.test.ts tests/formula-result-visualization-data.test.ts tests/formula-summary.test.ts
pnpm typecheck
```

Expected: all commands exit 0 with no React `act` warnings.

Commit:

```bash
git add src/components/formula-result-visualization.tsx tests/formula-result-visualization.test.ts
git commit -m "feat: integrate formula draw landing dashboard"
```

### Task 7: Match Existing iOS Glass Styling on Desktop and Mobile

**Files:**
- Modify: `src/app/globals.css:2976-3690`
- Modify: `tests/formula-result-visualization.test.ts:65-190`
- Modify: `tests/formula-complete-matrix.test.tsx`

**Interfaces:**
- Consumes: the class names introduced in Tasks 4–6 and the existing `--rq-*` tokens.
- Produces: desktop/mobile layout, sticky labels, actual markers, scroll containment, dark/reduced modes, and 44 px interaction targets.

- [ ] **Step 1: Add failing user-visible DOM-order and control assertions**

Assert the desktop DOM order contains overview, existing trend/rank, trajectory/pareto, landing, matrix, and evidence. Assert every landing record button and actual matrix cell is a real `button`, and number mode has `.rq-formula-complete-matrix__number-grid`.

Assert the mobile reading order is exposed through the same semantic section sequence and that every interactive landing/matrix control is keyboard reachable:

```ts
const sections = [...dialog.querySelectorAll<HTMLElement>(".rq-formula-viz__body > section")];
expect(sections.map((section) => section.getAttribute("aria-labelledby"))).toEqual([
  "formula-overview-title",
  "formula-trend-title",
  "formula-rank-title",
  "formula-trajectory-title",
  "formula-pareto-title",
  "formula-landing-title",
  "formula-matrix-title",
  "formula-evidence-title",
]);
expect([...dialog.querySelectorAll("[data-landing-record] button, [data-actual-landing='true']")]
  .every((control) => control instanceof HTMLButtonElement)).toBe(true);
```

- [ ] **Step 2: Run the component tests and confirm the new user-visible assertions fail before the UI integration is complete**

Run: `pnpm exec vitest run tests/formula-result-visualization.test.ts tests/formula-complete-matrix.test.tsx`

Expected: FAIL before Tasks 6–7 complete the new section order and controls. If Task 6 already made these assertions pass, record the existing GREEN result as the guard for this CSS/configuration task; visual behavior is verified in Task 8 using real Edge rendering rather than source-text assertions.

- [ ] **Step 3: Add desktop panel, chart, KPI, table, and matrix styles**

Add `.rq-formula-viz__landing-panel` to the shared panel/header selector groups and make it `grid-column: 1 / -1`. Use existing `var(--rq-content)`, `var(--rq-border)`, `var(--rq-shadow-content)`, `var(--rq-viz-mark)`, `var(--font-sans)`, and `var(--font-mono)` only.

Style:

```css
.rq-formula-viz__landing-panel { grid-column: 1 / -1; min-width: 0; overflow: hidden; }
.rq-formula-viz__landing-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.rq-formula-landing-chart { overflow-x: auto; padding: 10px 12px 14px; }
.rq-formula-landing-chart > svg { display: block; width: 100%; min-width: 680px; height: auto; }
.rq-formula-landing-records button { min-height: 44px; }
.rq-formula-complete-matrix__period { position: sticky; left: 0; z-index: 2; }
.rq-formula-complete-matrix__number-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
```

Use bar fill for counts, a distinct line color for rank, dashed average styling, visible focus rings, and direct-label paint order. Style `.is-actual` with outline, Lucide icon, and text—not color alone.

- [ ] **Step 4: Add mobile reading order and card conversion**

Within `@media (max-width: 767px)`, set the intended order:

```css
.rq-formula-viz__overview { order: 1; }
.rq-formula-viz__trend-panel { order: 2; }
.rq-formula-viz__landing-panel { order: 3; }
.rq-formula-viz__rank-panel { order: 4; }
.rq-formula-viz__trajectory-panel { order: 5; }
.rq-formula-viz__pareto-panel { order: 6; }
.rq-formula-viz__matrix-panel { order: 7; }
.rq-formula-viz__evidence-panel { order: 8; }
.rq-formula-viz__landing-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.rq-formula-landing-records thead { display: none; }
.rq-formula-landing-records tr { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
```

Ensure the page itself never overflows horizontally; only chart and matrix containers use `overflow-x: auto`. Keep the mobile sheet safe-area padding and existing focus trap unchanged.

- [ ] **Step 5: Add dark, reduced-motion, and reduced-transparency behavior**

Reuse tokens so dark mode follows automatically. Add the new chart lines, actual marker, and interactive rows to reduced-motion selectors; add no animation to direct labels. In reduced transparency, keep the solid existing panel backgrounds and never introduce an extra backdrop filter.

- [ ] **Step 6: Run focused tests, lint, typecheck, and commit**

Run:

```bash
pnpm exec vitest run tests/formula-result-visualization.test.ts tests/formula-complete-matrix.test.tsx tests/formula-draw-landing-chart.test.tsx
pnpm lint
pnpm typecheck
```

Expected: all commands exit 0.

Commit:

```bash
git add src/app/globals.css tests/formula-result-visualization.test.ts tests/formula-complete-matrix.test.tsx
git commit -m "style: polish formula landing analytics"
```

### Task 8: Full Regression, Local Browser QA, and Final Handoff

**Files:**
- Modify only if a verification failure identifies a scoped defect in the files above.

**Interfaces:**
- Consumes: the completed feature and project scripts.
- Produces: a locally verified desktop/mobile result with no publication.

- [ ] **Step 1: Run the full automated suite**

Run:

```bash
pnpm exec vitest run
pnpm typecheck
pnpm lint
pnpm build
pnpm build:static
```

Expected: every command exits 0. Preserve the generated local `next-env.d.ts` change and do not stage it unless the build proves the tracked file itself must change.

- [ ] **Step 2: Start the local application and verify data routes**

Run the application: `pnpm dev`

In a second terminal run:

```powershell
Invoke-WebRequest -Uri 'http://localhost:3000/formula-result-statistics' -UseBasicParsing | Select-Object StatusCode
pnpm exec vitest run tests/api-routes.test.ts
```

Expected: the page reports HTTP 200 and the mocked backend route suite passes without sending a real synchronization mutation. Do not start Vercel and do not publish.

- [ ] **Step 3: Verify desktop behavior in the user’s Microsoft Edge browser**

At the existing local URL, open `公式结果统计`, select `最近十期`, choose `生肖`, and open visualization. Confirm:

1. The matrix exposes all 12生肖 even when formulas emitted fewer values.
2. Each completed row marks exactly one actual result with number, count, and rank in its accessible label.
3. The landing chart contains ten completed target issues when data permits; pending is separate.
4. Clicking a chart point, record, and actual cell focuses the same calculation issue and exact contributing formulas.
5. `清除期次筛选` restores all-period evidence.
6. Number mode renders 01–49 in seven columns and remains usable without page-level horizontal overflow.
7. Light/dark colors, labels, borders, typography, and spacing match the existing dialog.

- [ ] **Step 4: Verify the 390 × 844 mobile layout in Edge device emulation**

Confirm the order is overview → relative trend → landing analysis → ranking → rank trajectory → Pareto → complete matrix → evidence; landing records render as cards, controls are at least 44 CSS px, the sheet respects safe areas, and only the chart/matrix scroll internally.

- [ ] **Step 5: Compare visual output with the supplied project screenshot**

Capture the same panel state and viewport as the supplied reference, place the reference and local capture side by side, and check font size, weight, row height, padding, border radius, clipping, marker alignment, and scrollbars. Fix only measured mismatches using existing tokens, then repeat the comparison once.

- [ ] **Step 6: Check console and production output**

Confirm the Edge console has no error/warning introduced by this feature and the dev terminal has no hydration, key, worker, or SVG accessibility warning. Confirm the static output includes the formula result statistics route.

- [ ] **Step 7: Commit any scoped QA corrections**

If QA required changes, run the focused test that covers each correction, then:

```bash
git add src/lib/formula-summary/formula-summary.ts src/lib/formula-summary/formula-draw-landing.ts src/components/formula-result-statistics-view.tsx src/components/formula-result-visualization.tsx src/components/formula-draw-landing-chart.tsx src/components/formula-complete-matrix.tsx src/app/globals.css tests/formula-summary.test.ts tests/formula-draw-landing.test.ts tests/formula-result-statistics-view.test.ts tests/formula-draw-landing-chart.test.tsx tests/formula-complete-matrix.test.tsx tests/formula-result-visualization.test.ts
git commit -m "fix: complete formula landing QA"
```

If no QA change is required, do not create an empty commit.

- [ ] **Step 8: Present the verified local result without publishing**

Return the clickable local Codex Desktop URL first, summarize automated and browser verification, call out that all domains and ten completed landing records are present, and state explicitly that GitHub publication has not occurred because the user has not requested it for this build.
