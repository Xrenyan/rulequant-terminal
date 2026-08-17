# Formula Result Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenth RuleQuant feature named “公式结果统计” that equally counts all eligible formula outputs for the latest calculation period or recent ten periods and provides a polished iOS-style visualization drill-down on desktop and mobile.

**Architecture:** Build a pure TypeScript aggregation module on top of the existing `normalizeDraw` and `calculateRule` engine, then render its derived report in focused React components. The terminal shell owns routing and passes live `activeDraws`, rules, and configuration into the new view; all results stay memoized, client-side, and automatically refresh with the existing daily data synchronization. A portal-based dialog renders only the selected action/category and becomes a safe-area-aware full-screen sheet on mobile.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript 5.9.3, Vitest 4.1.9, Tailwind CSS 4.3.1, existing CSS design tokens, Lucide React 1.21.0, native CSS/SVG charts

## Global Constraints

- The visible feature name is exactly `公式结果统计`.
- Count every enabled, eligible formula equally: one unique target from one formula in one calculation period contributes exactly 1.
- Never mix exclusion counts and support counts or apply success-rate, reference, confirmation, or signal weights.
- Do not include `kill_parity`, `include_parity`, `kill_size`, or `include_size` in this feature.
- Do include semantic statistics for half-head and half-color formulas, plus door formulas.
- Use latest calculation period and recent ten calculation periods; show the next draw as the corresponding issue when known and `下期待开奖` for the latest output.
- Derive results from live `activeDraws`, rules, and config so daily synchronization refreshes the page without a separate stored snapshot.
- Preserve the existing RuleQuant iOS 26 visual language and complete both desktop and mobile states.
- Do not add a chart dependency or a new backend/database endpoint.
- Do not push, deploy, or publish until the user explicitly says `发布`.
- Keep the existing generated `next-env.d.ts` working-tree change out of feature commits.

---

### Task 1: Build the equal-weight formula summary engine

**Files:**
- Create: `tests/formula-summary.test.ts`
- Create: `src/lib/formula-summary/formula-summary.ts`

**Interfaces:**
- Consumes: `DrawRecord[]`, `RuleRecord[]`, `RuleQuantConfig`, `normalizeDraw`, and `calculateRule`.
- Produces:
  - `buildFormulaSummaryReport(input: { draws: DrawRecord[]; rules: RuleRecord[]; config: RuleQuantConfig; maxPeriods?: number }): FormulaSummaryReport`
  - `buildFormulaSummaryGroups(periods: FormulaSummaryPeriod[]): FormulaSummaryGroup[]`
  - `formulaSummaryTargetLabel(targetType: FormulaSummaryTargetType): string`
  - exported types `FormulaSummaryAction`, `FormulaSummaryTargetType`, `FormulaSummaryContribution`, `FormulaSummaryPeriod`, `FormulaSummaryRankItem`, `FormulaSummaryGroup`, and `FormulaSummaryReport`.

- [ ] **Step 1: Write a failing module-contract and equal-weight test**

Create `tests/formula-summary.test.ts` with a dynamic import so the test process runs and fails on an assertion before the module exists:

```ts
import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import type { DrawRecord, RuleRecord } from "@/types/domain";

const draws: DrawRecord[] = [
  { issue: "101", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: 7 },
  { issue: "102", n1: 8, n2: 9, n3: 10, n4: 11, n5: 12, n6: 13, special: 14 },
  { issue: "103", n1: 15, n2: 16, n3: 17, n4: 18, n5: 19, n6: 20, special: 21 },
];

function rule(id: string, category: RuleRecord["category"], formula: string, enabled = true): RuleRecord {
  return {
    id, name: id, category, formula, enabled, orderMode: "L", normalizer: "auto",
    target: "next_special", verifyMode: "next_special", positionPattern: [], periodSpan: 1,
    tags: [], description: "", sourceFile: "unit", examples: [],
    createdAt: "2026-08-17T00:00:00.000Z", updatedAt: "2026-08-17T00:00:00.000Z",
  };
}

describe("formula result statistics", () => {
  it("loads the summary engine and counts two formulas as two equal votes", async () => {
    const summary = await import("@/lib/formula-summary/formula-summary").catch(() => undefined);
    expect(summary, "formula summary module should exist").toBeDefined();
    const report = summary!.buildFormulaSummaryReport({
      draws,
      config: defaultConfig,
      rules: [rule("kill-a", "kill_zodiac", "平1"), rule("kill-b", "kill_zodiac", "平1")],
    });
    const groups = summary!.buildFormulaSummaryGroups([report.periods.at(-1)!]);
    expect(groups.find((group) => group.action === "exclude" && group.targetType === "zodiac")?.items[0].count).toBe(2);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the expected red state**

Run:

```powershell
pnpm test -- --run tests/formula-summary.test.ts
```

Expected: one failed assertion with `formula summary module should exist`; Vitest itself starts normally.

- [ ] **Step 3: Implement the typed report and category mapping**

Create `src/lib/formula-summary/formula-summary.ts` with these exact unions and mappings:

```ts
export type FormulaSummaryAction = "exclude" | "include";
export type FormulaSummaryTargetType =
  | "zodiac" | "color" | "sum" | "tail" | "head" | "half-head"
  | "half-color" | "door" | "element" | "segment" | "number";

const IGNORED_CATEGORIES = new Set<RuleCategory>([
  "kill_parity", "include_parity", "kill_size", "include_size",
]);
```

Implement semantic extraction as follows:

```ts
function contributionsForRule(rule: RuleRecord, calculation: FormulaEngineCalculation, period: PeriodIdentity): FormulaSummaryContribution[] {
  if (rule.category === "kill_three_as_nine") {
    return [
      makeContribution(rule, calculation, period, "exclude", "zodiac", calculation.secondaryMappedResult ?? []),
      makeContribution(rule, calculation, period, "include", "zodiac", calculation.mappedResult),
    ];
  }
  if (rule.category === "kill_half_head") return [makeContribution(rule, calculation, period, "exclude", "half-head", calculation.secondaryMappedResult ?? calculation.mappedResult, calculation.mappedResult)];
  if (rule.category === "kill_half_color") return [makeContribution(rule, calculation, period, "exclude", "half-color", calculation.secondaryMappedResult ?? calculation.mappedResult, calculation.mappedResult)];
  if (rule.category === "kill_door") return [makeContribution(rule, calculation, period, "exclude", "door", calculation.secondaryMappedResult ?? calculation.mappedResult, calculation.mappedResult)];
  const mapping = categoryTarget(rule.category);
  return mapping ? [makeContribution(rule, calculation, period, mapping.action, mapping.targetType, calculation.mappedResult)] : [];
}
```

`categoryTarget` maps zodiac/color/sum/tail/head/element/segment and custom set exactly as stated in the design spec, returns `undefined` for ignored categories, and leaves no default that silently converts an unknown category. `makeContribution` deduplicates targets by `typeof target + ":" + String(target)`.

`buildFormulaSummaryReport` sorts all draws, selects the last `maxPeriods ?? 10` source indices, normalizes each source draw, calls every enabled non-ignored rule with its original sorted `periodIndex`, records errors in `skippedRules`, and keeps periods in ascending order. `targetIssue` is the next sorted draw issue or undefined; `isPending` is true only when no next draw exists.

`buildFormulaSummaryGroups` groups by action + target type, increments each unique target once per contribution, attaches matching contribution evidence, and sorts items by descending count then Chinese numeric label order.

- [ ] **Step 4: Expand tests for every business boundary**

Add focused cases that assert:

```ts
expect(report.periods.map((period) => [period.calculationIssue, period.targetIssue])).toEqual([
  ["101", "102"], ["102", "103"], ["103", undefined],
]);
expect(report.periods.at(-1)?.targetLabel).toBe("下期待开奖");
expect(allTargetTypes).not.toContain("parity");
expect(allTargetTypes).not.toContain("size");
expect(report.ignoredRuleCount).toBe(2);
```

Also prove disabled formulas contribute nothing, duplicate targets within one formula contribute once, half-head/half-color/door use semantic labels and retain `affectedTargets`, kill-three-as-nine creates separate exclude/include zodiac contributions, custom sets count each member once, failures enter `skippedRules`, and `maxPeriods: 2` retains only issues 102 and 103.

- [ ] **Step 5: Run the engine tests and type checking**

Run:

```powershell
pnpm test -- --run tests/formula-summary.test.ts tests/formula-engine.test.ts tests/formula-ledger.test.ts
pnpm typecheck
```

Expected: all selected tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit the pure engine**

```powershell
git add -- tests/formula-summary.test.ts src/lib/formula-summary/formula-summary.ts
git commit -m "feat: add formula result summary engine"
```

---

### Task 2: Build the responsive statistics page and exact formula evidence

**Files:**
- Create: `tests/formula-result-statistics-view.test.ts`
- Create: `src/components/formula-result-statistics-view.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `FormulaSummaryReport`, `buildFormulaSummaryReport`, `buildFormulaSummaryGroups`, `DrawRecord[]`, `RuleRecord[]`, and `RuleQuantConfig` from Task 1.
- Produces: `FormulaResultStatisticsView({ draws, rules, config }: FormulaResultStatisticsViewProps)` and the CSS class family `.rq-formula-stats-*`.

- [ ] **Step 1: Write a failing source contract for page copy and controls**

Create `tests/formula-result-statistics-view.test.ts` to read the future component source and styles, then assert:

```ts
expect(viewSource).toContain("公式结果统计");
expect(viewSource).toContain("最新输出");
expect(viewSource).toContain("最近十期");
expect(viewSource).toContain("排除统计");
expect(viewSource).toContain("支持统计");
expect(viewSource).toContain("查看可视化");
expect(viewSource).not.toContain("单双统计");
expect(viewSource).not.toContain("大小统计");
expect(styles).toContain(".rq-formula-stats");
```

Use `existsSync` before `readFileSync` and assert the file exists so the initial failure is a clear assertion, not a file-system exception.

- [ ] **Step 2: Run the view test and verify it fails because the component is absent**

Run:

```powershell
pnpm test -- --run tests/formula-result-statistics-view.test.ts
```

Expected: failed `statistics view should exist` assertion.

- [ ] **Step 3: Implement the page state and memoized data path**

Create a client component with these states:

```ts
type RangeMode = "latest" | "ten";
const [rangeMode, setRangeMode] = useState<RangeMode>("latest");
const [action, setAction] = useState<FormulaSummaryAction>("exclude");
const [targetType, setTargetType] = useState<FormulaSummaryTargetType | "">("");
const [selectedTarget, setSelectedTarget] = useState<string>("");
const [visualizationOpen, setVisualizationOpen] = useState(false);

const report = useMemo(() => buildFormulaSummaryReport({ draws, rules, config, maxPeriods: 10 }), [draws, rules, config]);
const visiblePeriods = rangeMode === "latest" ? report.periods.slice(-1) : report.periods;
const groups = useMemo(() => buildFormulaSummaryGroups(visiblePeriods), [visiblePeriods]);
```

When the action or available groups change, select the first valid target type and first ranked item without overwriting a valid current selection. Render:

- one open introductory header with exact title/subtitle and a primary `查看可视化` button;
- a compact status rail for calculation issue, corresponding issue, participating formulas, period count, and skipped formulas;
- glass segmented controls for range and action;
- horizontally scrollable target-type controls;
- one sorted horizontal ranking surface with direct labels and exact counts;
- one evidence list for the selected target, showing rule name, calculation/corresponding issue, formula, output targets, and expandable process lines;
- honest empty and skipped states.

Every ranking row is a real button with `aria-label="查看{目标}的公式明细"`, a 44px minimum hit area, keyboard focus styling, direct count text, and no hover-only information.

- [ ] **Step 4: Add desktop and mobile page styling**

Append a single final CSS section using existing variables only:

```css
.rq-formula-stats { display: grid; gap: 16px; }
.rq-formula-stats__hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 20px; }
.rq-formula-stats__status { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
.rq-formula-stats__filters { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
.rq-formula-stats__rank-row { display: grid; grid-template-columns: minmax(72px, .34fr) minmax(120px, 1fr) auto; min-height: 52px; }
.rq-formula-stats__bar { transform-origin: left center; }

@media (max-width: 767px) {
  .rq-formula-stats__hero { grid-template-columns: 1fr; }
  .rq-formula-stats__status { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rq-formula-stats__rank-row { grid-template-columns: minmax(64px, .38fr) minmax(96px, 1fr) auto; }
}
```

Complete this family with existing content surfaces for evidence, glass only for controls, visible focus, selected row treatment, empty states, dark/light compatibility, `prefers-reduced-motion`, and `prefers-reduced-transparency`. Bars use a solid semantic root color and start at zero.

- [ ] **Step 5: Run view and engine tests**

```powershell
pnpm test -- --run tests/formula-result-statistics-view.test.ts tests/formula-summary.test.ts
pnpm typecheck
```

Expected: all tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit the page**

```powershell
git add -- tests/formula-result-statistics-view.test.ts src/components/formula-result-statistics-view.tsx src/app/globals.css
git commit -m "feat: add formula result statistics page"
```

---

### Task 3: Add the commercial-grade visualization drill-down

**Files:**
- Create: `tests/formula-result-visualization.test.ts`
- Create: `src/components/formula-result-visualization.tsx`
- Modify: `src/components/formula-result-statistics-view.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: selected `FormulaSummaryPeriod[]`, action, target type, selected target, `onSelectTarget`, `onClose`, and a return-focus ref.
- Produces: `FormulaResultVisualizationDialog(props: FormulaResultVisualizationDialogProps)` and `.rq-formula-viz-*` styles.

- [ ] **Step 1: Write failing accessibility and visualization contracts**

Assert the new source contains:

```ts
expect(source).toContain('role="dialog"');
expect(source).toContain('aria-modal="true"');
expect(source).toContain("createPortal(");
expect(source).toContain("document.body");
expect(source).toContain("Escape");
expect(source).toContain("公式贡献排行");
expect(source).toContain("最近十期变化");
expect(source).toContain("贡献公式明细");
expect(styles).toContain(".rq-formula-viz__sheet");
expect(styles).toContain("env(safe-area-inset-bottom)");
```

- [ ] **Step 2: Run the drill-down test and verify the expected red state**

```powershell
pnpm test -- --run tests/formula-result-visualization.test.ts
```

Expected: failed `visualization component should exist` assertion.

- [ ] **Step 3: Implement focus-safe portal behavior**

The dialog must:

- render only when open and only in the browser;
- store the previous `document.body.style.overflow`, set it to `hidden`, and restore it on cleanup;
- focus the close button after mount;
- close on Escape and backdrop pointer activation;
- stop propagation inside the sheet;
- restore focus to the exact trigger element on close;
- include `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and an accessible subtitle describing action, category, range, and units.

- [ ] **Step 4: Implement three evidence layers without a chart library**

Render:

1. `公式贡献排行`: all ranked targets as zero-based horizontal bars with direct count labels and selectable rows;
2. `最近十期变化`: a compact period-by-target matrix for up to six leading targets, with visible numeric cells, period labels, a text summary, and intensity expressed through opacity plus numbers;
3. `贡献公式明细`: exact evidence for the selected target with formula, issue mapping, semantic output, affected numbers for half-head/half-color/door, and expandable process.

For the selected target and at least four periods, render a native SVG line with an explicit zero baseline, direct point values, circles at each period, `role="img"`, and an accessible description. For fewer than four periods, render discrete period bars instead of a line. Do not use gradient mark fills or a detached legend.

- [ ] **Step 5: Add iOS-style desktop dialog and mobile sheet CSS**

Desktop requirements:

- fixed inset overlay with a dimmed/backdrop-blurred backdrop;
- sheet width `min(1120px, calc(100vw - 48px))`, max height `calc(100vh - 48px)`, 28px radius;
- sticky glass toolbar, readable opaque evidence body, 44px controls;
- restrained scale/translate entrance using the existing spring timing.

Mobile requirements under 767px:

- sheet fills the viewport from a small top safe margin to the bottom;
- radius only on top corners, fixed handle/toolbar, internal scroll;
- bottom padding includes `calc(24px + env(safe-area-inset-bottom))`;
- ranking/matrix/evidence becomes a single column and no label clips;
- no hover dependency and all controls remain at least 44px.

Add reduced-motion and reduced-transparency fallbacks.

- [ ] **Step 6: Wire every main-page visualization trigger**

Keep a `lastVisualizationTriggerRef`, update it from the clicked primary button or ranking row, update `selectedTarget`, and open the dialog. Pass the current filtered periods/action/target type. Closing returns focus to the stored trigger.

- [ ] **Step 7: Run the visualization, page, and type tests**

```powershell
pnpm test -- --run tests/formula-result-visualization.test.ts tests/formula-result-statistics-view.test.ts tests/formula-summary.test.ts
pnpm typecheck
```

Expected: all tests pass and TypeScript exits 0.

- [ ] **Step 8: Commit the drill-down**

```powershell
git add -- tests/formula-result-visualization.test.ts src/components/formula-result-visualization.tsx src/components/formula-result-statistics-view.tsx src/app/globals.css
git commit -m "feat: add formula statistics visualization"
```

---

### Task 4: Integrate the tenth route and harden navigation for desktop/mobile

**Files:**
- Create: `src/app/formula-result-statistics/page.tsx`
- Create: `tests/formula-result-statistics-navigation.test.ts`
- Modify: `src/components/rulequant-terminal.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `FormulaResultStatisticsView` from Task 2.
- Produces: route `/formula-result-statistics`, `ViewKey` value `formula-result-statistics`, a tenth desktop nav item, and a mobile More-sheet entry.

- [ ] **Step 1: Write the failing route/navigation contract**

Read the route and terminal source, then assert:

```ts
expect(routeSource).toContain('activeView="formula-result-statistics"');
expect(terminalSource).toContain('| "formula-result-statistics"');
expect(terminalSource).toContain('href: "/formula-result-statistics"');
expect(terminalSource).toContain('label: "公式结果统计"');
expect(terminalSource).toContain('<FormulaResultStatisticsView draws={activeDraws} rules={rules} config={config} />');
```

Also count `navItems` business labels and assert the new label occurs once.

- [ ] **Step 2: Run the route test and verify it fails**

```powershell
pnpm test -- --run tests/formula-result-statistics-navigation.test.ts
```

Expected: route-existence assertion fails.

- [ ] **Step 3: Add route, view key, label, icon, nav item, and rendering condition**

Create the standard App Router wrapper:

```tsx
import { RuleQuantTerminal } from "@/components/rulequant-terminal";

export default function FormulaResultStatisticsPage() {
  return <RuleQuantTerminal activeView="formula-result-statistics" />;
}
```

In `rulequant-terminal.tsx`:

- import `ChartNoAxesColumnIncreasing` and `FormulaResultStatisticsView`;
- add `"formula-result-statistics"` to `ViewKey`;
- insert the nav item immediately after “一键算公式”;
- add the exact view label;
- keep the existing four primary mobile nav items and let this feature appear in the More sheet;
- add a deferred-ready flag of 40ms and render the view only when ready, otherwise reuse the inline progress pattern;
- pass `activeDraws`, `rules`, and `config` directly.

- [ ] **Step 4: Prevent ten desktop items from clipping**

Make the existing desktop sidebar a flex column, keep the brand fixed, and allow only its `nav` to scroll:

```css
.rq-sidebar { display: flex; min-height: 0; flex-direction: column; }
.rq-sidebar .rq-brand { flex: 0 0 auto; }
.rq-sidebar nav { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
```

Do not change the mobile primary navigation count; verify “公式结果统计” is available in the More dialog with the existing selected state.

- [ ] **Step 5: Run navigation and regression tests**

```powershell
pnpm test -- --run tests/formula-result-statistics-navigation.test.ts tests/mobile-navigation.test.ts tests/pagination.test.ts
pnpm typecheck
```

Expected: all tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit route integration**

```powershell
git add -- src/app/formula-result-statistics/page.tsx tests/formula-result-statistics-navigation.test.ts src/components/rulequant-terminal.tsx src/app/globals.css
git commit -m "feat: integrate formula statistics navigation"
```

---

### Task 5: Verify data accuracy, commercial visual quality, frontend/backend health, and responsive behavior

**Files:**
- Create temporarily and remove before handoff: browser screenshots under a unique QA directory outside tracked source
- Inspect: all files changed in Tasks 1—4
- Do not modify `next-env.d.ts` as part of feature scope

**Interfaces:**
- Consumes: complete local feature and running development server.
- Produces: fresh automated, visual, responsive, performance, and API evidence with no publication.

- [ ] **Step 1: Run the full automated suite**

```powershell
pnpm test -- --run
pnpm typecheck
pnpm lint
```

Expected: zero failures/errors.

- [ ] **Step 2: Run a production build**

```powershell
pnpm build
```

Expected: Next.js exits 0 and includes `/formula-result-statistics` plus the existing API routes.

- [ ] **Step 3: Verify frontend and backend HTTP health**

With the local server running, request:

```powershell
Invoke-WebRequest http://localhost:3000/formula-result-statistics -UseBasicParsing
Invoke-WebRequest http://localhost:3000/dashboard -UseBasicParsing
Invoke-WebRequest http://localhost:3000/api/cloud/state -UseBasicParsing
```

Expected: both pages return 200; the API returns 200 with valid JSON or the existing intentional local-disabled JSON response.

- [ ] **Step 4: Use Browser/IAB for desktop workflow QA**

At approximately 1440×1000:

- open `/formula-result-statistics`;
- verify title/copy and that no 双单/大小 category exists;
- switch latest/recent ten and exclude/include;
- select zodiac, tail, half-head, half-color, and door when available;
- compare displayed counts against one engine-test fixture and spot-check two real formula evidence rows;
- open the visualization from the main button and a ranking row;
- verify ranking, ten-period view, evidence disclosure, Escape close, backdrop close, scroll lock, and exact focus return;
- verify the sidebar can scroll on a short-height desktop without clipping Settings.

- [ ] **Step 5: Use Browser/IAB for mobile workflow QA**

At approximately 390×844:

- open the mobile More sheet and enter “公式结果统计”;
- verify bottom navigation does not cover content;
- verify range/action/category filters are touch-scrollable;
- open the visualization and confirm it becomes a safe-area-aware near-full-screen sheet;
- verify chart labels, values, close control, evidence disclosures, and body scroll behavior;
- verify there is no horizontal overflow at 390px and 360px.

- [ ] **Step 6: Inspect dark/light and accessibility fallbacks**

Use the existing theme control to inspect both themes, then emulate reduced motion and reduced transparency. Verify text contrast, focus rings, direct numeric labels, 44px controls, non-color selected states, dialog semantics, and readable empty/error states.

- [ ] **Step 7: Capture and inspect visual evidence**

Capture desktop main page, desktop visualization dialog, mobile main page, and mobile visualization sheet. Use `view_image` on the user-provided existing-navigation screenshot and each latest implementation screenshot in the same QA pass. Record a fidelity ledger covering:

1. exact copy and tenth nav position;
2. existing typography and Lucide icon weight;
3. content-panel versus glass-control material hierarchy;
4. ranking alignment and direct counts;
5. dialog/sheet radius, safe areas, and motion;
6. mobile no-overflow behavior.

Fix every material mismatch before continuing.

- [ ] **Step 8: Check performance and refresh behavior**

Measure or instrument one report build against the real current data. Confirm the report uses at most ten calculation periods, that ordinary filter changes do not rebuild formula calculations, the dialog mounts only while open, and changing the latest draw/rules/config produces a new report. If the real report build exceeds a visible interaction budget, move only the report calculation to a worker and repeat Tasks 1 and 5 checks.

- [ ] **Step 9: Review scope and repository cleanliness**

```powershell
git diff --check
git status --short
git log -5 --oneline
```

Expected: only reviewed feature files and the known generated `next-env.d.ts` working-tree change are present; no screenshots, browser profiles, build output, secrets, or publication changes are tracked.

- [ ] **Step 10: Keep the result local**

Do not run `git push`, GitHub Pages scripts, deployment commands, or release workflows. Leave the verified local server URL ready for the user to inspect and wait for the explicit word `发布` before publishing.
