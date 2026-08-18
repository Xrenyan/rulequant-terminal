# Formula Analysis Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long formula-visualization dialog with a route-based four-tab analysis cockpit that adds 10/30/50-period formula health, formula conflict/duplication diagnostics, actual draw-landing distributions, data health, comparisons, and saved views.

**Architecture:** Existing draws, rules, configuration, formula-engine truth, and formula-summary output remain the only business sources. Focused pure modules derive health, pair diagnostics, data health, saved-view state, and a combined worker report; a lazy route-level React cockpit owns URL filters and four independently loaded workspaces. The main statistics page becomes the quick entry and links into the cockpit instead of mounting all charts in a long dialog.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript 5.9, Vitest/jsdom, existing Zustand/Dexie state, Web Worker, existing DOM/SVG and Lucide components.

**Spec:** `docs/superpowers/specs/2026-08-18-formula-analysis-and-system-guide-design.md`

## Global Constraints

- Keep the existing RuleQuant iOS glass design tokens, typography, colors, radii, icon language, dark mode, and reduced-transparency behavior.
- Do not add parity or size to formula-result statistics, comparison filters, health target summaries, or draw-landing analysis.
- Formula success must reuse `checkRuleSuccess`; an excluded actual result is not a success.
- Completed target draws only contribute to health, landing KPIs, distributions, and comparisons; pending rows stay visible but excluded from metrics.
- Preserve complete result domains, zero-count targets, calculation-issue → actual next-draw mapping, standard competition ranks, and direct evidence.
- Default to 10 completed target periods; prepare 11/31/51 calculation periods for 10/30/50 ranges.
- No WebGL, 3D, radar, gauge, particles, predictive claims, new betting features, or Vercel deployment.
- Build locally and verify; do not publish until the user explicitly says “发布”.
- Do not stage or revert the runtime-generated `next-env.d.ts` change.

---

## File Map

### New analysis data files

- `src/lib/formula-analysis/types.ts` — shared filter, health, pair-diagnostic, data-health, saved-view, and report contracts.
- `src/lib/formula-analysis/formula-health.ts` — 10/30/50 formula outcome and streak derivation using existing backtest truth.
- `src/lib/formula-analysis/formula-conflicts.ts` — same-target-type duplicate and opposite-direction overlap diagnostics.
- `src/lib/formula-analysis/data-health.ts` — draw/rule/config/source freshness validation.
- `src/lib/formula-analysis/saved-views.ts` — versioned local persistence and URL filter codec.
- `src/lib/formula-analysis/build-analysis-report.ts` — combined report coordinator and LRU cache.
- `src/workers/formula-analysis.worker.ts` — worker transport for the combined report.

### New analysis UI files

- `src/components/formula-analysis/formula-analysis-cockpit.tsx` — route shell, URL state, fixed toolbar, status, lazy tab orchestration.
- `src/components/formula-analysis/formula-analysis-overview.tsx` — one-screen summary.
- `src/components/formula-analysis/formula-landing-workspace.tsx` — aligned count/rank charts and distributions.
- `src/components/formula-analysis/formula-health-workspace.tsx` — formula health and pair diagnostics.
- `src/components/formula-analysis/formula-evidence-workspace.tsx` — complete matrix and contextual evidence.
- `src/components/formula-analysis/formula-analysis-loading.tsx` — stable route/tab loading states.
- `src/components/formula-analysis/formula-analysis-toolbar.tsx` — range/action/type/group/compare/view controls.
- `src/app/formula-result-statistics/analysis/page.tsx` — route binding.
- `src/app/api/health/route.ts` — optional read-only dynamic health metadata.

### Modified files

- `src/components/formula-result-statistics-view.tsx` — replace modal launch with cockpit link and keep quick statistics.
- `src/components/rulequant-terminal.tsx` — hidden analysis view, nav highlighting, props/data-source metadata, dynamic import.
- `src/app/globals.css` — cockpit desktop/mobile, focus, dark, reduced-mode styles.
- Existing formula visualization/matrix/chart files — reuse focused primitives; remove obsolete dialog-only composition after migration.
- `scripts/build-static-pages.mjs` — ensure nested cockpit route exports while API disabling/restoration remains safe.

### Tests

- `tests/formula-analysis-health.test.ts`
- `tests/formula-analysis-conflicts.test.ts`
- `tests/formula-analysis-data-health.test.ts`
- `tests/formula-analysis-saved-views.test.ts`
- `tests/formula-analysis-worker.test.ts`
- `tests/formula-analysis-navigation.test.ts`
- `tests/formula-analysis-cockpit.test.tsx`
- Extend existing landing, matrix, statistics-view, API, mobile-navigation, and static-build coverage.

---

### Task 1: Shared contracts and formula health

**Files:**
- Create: `src/lib/formula-analysis/types.ts`
- Create: `src/lib/formula-analysis/formula-health.ts`
- Test: `tests/formula-analysis-health.test.ts`

**Interfaces:**
- Consumes: `DrawRecord[]`, `RuleRecord[]`, `RuleQuantConfig`, `runBacktest`, and existing `BacktestDetail.success`.
- Produces: `FormulaAnalysisWindow`, `FormulaHealthMetric`, `FormulaHealthRow`, `FormulaHealthReport`, and `buildFormulaHealthReport(input)`.

- [ ] **Step 1: Write failing health tests**

Cover exclusion success, support success, 10/30/50 slicing, completed-only samples, current success/failure streaks, longest failure streak, errors, sample-under-10, three consecutive failures, and 15-point recent volatility. Use deterministic draws/rules and assert exact counts rather than snapshots.

```ts
const report = buildFormulaHealthReport({ draws, rules, config: defaultConfig });
const row = report.rows.find((item) => item.ruleId === "kill-zodiac")!;
expect(row.windows[10]).toMatchObject({ sampleSize: 10, successes: 7, failures: 3, successRate: 70 });
expect(row.currentFailureStreak).toBe(3);
expect(row.status).toBe("consecutive-failure");
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm exec vitest run tests/formula-analysis-health.test.ts`

Expected: FAIL because `@/lib/formula-analysis/formula-health` does not exist.

- [ ] **Step 3: Define exact shared types**

```ts
export type FormulaAnalysisWindow = 10 | 30 | 50;
export type FormulaHealthStatus = "normal" | "sample-low" | "consecutive-failure" | "volatile" | "calculation-error";
export type FormulaHealthMetric = { window: FormulaAnalysisWindow; sampleSize: number; successes: number; failures: number; successRate: number };
export type FormulaHealthRow = {
  ruleId: string; ruleName: string; category: RuleRecord["category"];
  windows: Record<FormulaAnalysisWindow, FormulaHealthMetric>;
  currentSuccessStreak: number; currentFailureStreak: number; longestFailureStreak: number;
  skippedCount: number; error?: string; status: FormulaHealthStatus; latestFailureIssues: string[];
};
export type FormulaHealthReport = { generatedAt: string; rows: FormulaHealthRow[]; counts: Record<FormulaHealthStatus, number> };
```

- [ ] **Step 4: Implement health derivation with existing engine truth**

Sort draws deterministically, run the existing backtest once, slice the last completed details for each window, compute streaks in one pass, and derive status in this priority: calculation error → sample below 10 → failure streak at least 3 → absolute 10-vs-30 rate delta at least 15 → normal.

- [ ] **Step 5: Run focused and existing backtest tests**

Run: `pnpm exec vitest run tests/formula-analysis-health.test.ts tests/backtest.test.ts tests/formula-engine.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/formula-analysis/types.ts src/lib/formula-analysis/formula-health.ts tests/formula-analysis-health.test.ts
git commit -m "feat: derive formula health windows"
```

### Task 2: Formula duplication and direction conflicts

**Files:**
- Create: `src/lib/formula-analysis/formula-conflicts.ts`
- Test: `tests/formula-analysis-conflicts.test.ts`

**Interfaces:**
- Consumes: `FormulaSummaryPeriod[]` with unified `action`, `targetType`, `ruleId`, and `targets` contributions.
- Produces: `FormulaPairDiagnostic`, `FormulaPairDiagnosticsReport`, `jaccardSimilarity`, and `buildFormulaPairDiagnostics(input)`.

- [ ] **Step 1: Write failing pair-diagnostic tests**

Assert: different target types never compare; fewer than five common periods do not qualify; same-direction pairs with average Jaccard `>= 0.80` qualify as duplicate; exact-set rate `>= 0.70` also qualifies; opposite-direction pairs require average overlap `>= 0.50` and at least three overlap periods; every row exposes common sample count and issue examples.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/formula-analysis-conflicts.test.ts`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement normalized per-period formula sets**

Build `Map<targetType, Map<rule-action-key, Map<issue, Set<targetKey>>>>`; combine multiple contributions from the same formula/action/type/period before comparing. Use stable sorted rule-pair keys and never compare parity/size because they are absent from summary contributions.

- [ ] **Step 4: Implement pair scoring and explanations**

```ts
export type FormulaPairDiagnostic = {
  kind: "duplicate" | "conflict";
  leftRuleId: string; leftRuleName: string; rightRuleId: string; rightRuleName: string;
  targetType: FormulaSummaryTargetType; commonPeriods: number; score: number;
  exactMatchPeriods: number; overlapPeriods: number; exampleIssues: string[];
};
```

Round display scores only after aggregation. Keep raw period sets out of React props.

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run tests/formula-analysis-conflicts.test.ts tests/formula-summary.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/formula-analysis/formula-conflicts.ts tests/formula-analysis-conflicts.test.ts
git commit -m "feat: detect formula conflicts and duplicates"
```

### Task 3: Data health and safe read-only health API

**Files:**
- Create: `src/lib/formula-analysis/data-health.ts`
- Create: `src/app/api/health/route.ts`
- Test: `tests/formula-analysis-data-health.test.ts`
- Modify: `tests/api-routes.test.ts`

**Interfaces:**
- Consumes: raw/active draws, rules, config, `cloudStateMeta`, latest sync string, source label, and server `loadSharedCloudState`.
- Produces: `DataHealthReport`, `buildDataHealthReport(input)`, and `GET /api/health` with `{ ok, updatedAt, latestIssue, recordCount, ruleCount, mode }`.

- [ ] **Step 1: Write failing client health tests**

Cover identical duplicate issues, conflicting same-issue records, out-of-range/repeated numbers, normalization errors, config errors, formula summary errors, stale/partial/offline states, and “unknown” rather than fabricated gaps.

- [ ] **Step 2: Write failing API tests**

Mock `loadSharedCloudState`; assert the endpoint returns only counts/metadata, sets `Cache-Control: no-store`, never returns formulas/config/logs, and returns a sanitized 503 body when loading fails.

- [ ] **Step 3: Run RED**

Run: `pnpm exec vitest run tests/formula-analysis-data-health.test.ts tests/api-routes.test.ts`

Expected: FAIL because the module and route are missing.

- [ ] **Step 4: Implement deterministic client report**

Validate every seven-number draw, group raw records by issue before merge, distinguish identical duplicates from conflicting duplicates, call current config validation, and accept formula error summaries without recalculating formulas.

- [ ] **Step 5: Implement safe server metadata**

Use the existing server-state loader; calculate latest issue without exposing data values. Catch errors and return `{ ok: false, mode, error: "健康状态暂时不可用" }`.

- [ ] **Step 6: Run focused tests**

Run: `pnpm exec vitest run tests/formula-analysis-data-health.test.ts tests/api-routes.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- src/lib/formula-analysis/data-health.ts src/app/api/health/route.ts tests/formula-analysis-data-health.test.ts tests/api-routes.test.ts
git commit -m "feat: expose formula data health"
```

### Task 4: Versioned saved views and URL filter state

**Files:**
- Create: `src/lib/formula-analysis/saved-views.ts`
- Test: `tests/formula-analysis-saved-views.test.ts`

**Interfaces:**
- Produces: `FormulaAnalysisFilters`, `FormulaAnalysisTab`, `SavedFormulaAnalysisView`, `parseAnalysisSearchParams`, `serializeAnalysisSearchParams`, `readSavedViews`, `writeSavedViews`, `saveAnalysisView`, `deleteAnalysisView`, and `restoreAnalysisView`.

- [ ] **Step 1: Write failing codec/storage tests**

Assert valid 10/30/50 windows, default exclude/zodiac/overview, one comparison dimension, sorted formula IDs, no saved concrete issue/target, schema version 1, corrupt JSON recovery, deleted-rule degradation, default-view uniqueness, and URL round trips.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/formula-analysis-saved-views.test.ts`

- [ ] **Step 3: Implement minimal versioned persistence**

Use key `rulequant:formula-analysis-views:v1`; inject a `Storage` interface in pure functions for tests; cache reads per browser session and invalidate the cache on writes.

- [ ] **Step 4: Implement URL codec**

Use compact readable parameters: `tab`, `range`, `action`, `type`, `rules`, `compare`, `compareValue`, `view`. Ignore unknown values and never serialize transient `issue` or `target` into a saved view.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm exec vitest run tests/formula-analysis-saved-views.test.ts`

```powershell
git add -- src/lib/formula-analysis/saved-views.ts tests/formula-analysis-saved-views.test.ts
git commit -m "feat: persist formula analysis views"
```

### Task 5: Combined report worker with bounded caching and recovery

**Files:**
- Create: `src/lib/formula-analysis/build-analysis-report.ts`
- Create: `src/workers/formula-analysis.worker.ts`
- Test: `tests/formula-analysis-worker.test.ts`

**Interfaces:**
- Consumes: `{ draws, rules, config, window, action, targetType, ruleIds?, sourceMeta? }`.
- Produces: `FormulaAnalysisReport` containing filtered summary periods, landing model, health report, pair diagnostics, data health, generated time, and cache identity.

- [ ] **Step 1: Write failing report/cache tests**

Assert 10→11, 30→31, 50→51 summary preparation; identical inputs reuse an LRU report; changed issue/rule timestamp/config invalidates; pending target remains separate; filter rules are applied before pair analysis.

- [ ] **Step 2: Write failing worker lifecycle tests**

Cover constructor throw, postMessage/DataCloneError, `onerror`, `onmessageerror`, `{ok:false}`, late success after recovery, unmount disposal, and stale response after prop/filter change. Reuse the single-settlement pattern already proven in formula-summary tests.

- [ ] **Step 3: Run RED**

Run: `pnpm exec vitest run tests/formula-analysis-worker.test.ts`

- [ ] **Step 4: Implement combined builder and LRU**

Cap the report cache at four entries. Derive each subreport once and return serializable data only.

- [ ] **Step 5: Implement worker and guarded client helper**

Export a hook/helper used by the cockpit. Recover synchronously once, terminate unsettled workers during cleanup, and ignore all late/stale callbacks.

- [ ] **Step 6: Run relevant suites and commit**

Run: `pnpm exec vitest run tests/formula-analysis-worker.test.ts tests/formula-result-statistics-view.test.ts tests/formula-summary.test.ts`

```powershell
git add -- src/lib/formula-analysis/build-analysis-report.ts src/workers/formula-analysis.worker.ts tests/formula-analysis-worker.test.ts
git commit -m "feat: build formula analysis reports off thread"
```

### Task 6: Route, toolbar, and statistics-page entry

**Files:**
- Create: `src/app/formula-result-statistics/analysis/page.tsx`
- Create: `src/components/formula-analysis/formula-analysis-cockpit.tsx`
- Create: `src/components/formula-analysis/formula-analysis-toolbar.tsx`
- Create: `src/components/formula-analysis/formula-analysis-loading.tsx`
- Modify: `src/components/formula-result-statistics-view.tsx`
- Modify: `src/components/rulequant-terminal.tsx`
- Test: `tests/formula-analysis-navigation.test.ts`
- Modify: `tests/formula-result-statistics-view.test.ts`
- Modify: `tests/mobile-navigation.test.ts`

**Interfaces:**
- `FormulaAnalysisCockpit` receives `draws`, `rules`, `config`, `dataSourceLabel`, `lastSyncAt`, and `cloudStateMeta`.
- The route binds `RuleQuantTerminal activeView="formula-analysis"`; nav highlights `formula-result-statistics` for both view keys.

- [ ] **Step 1: Write failing route and entry tests**

Assert nested route binding, one active sidebar item, one active mobile-more item, “进入分析驾驶舱” href, absence of a dialog launch, four tab labels, filter summary, saved-view menu, and no parity/size target controls.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/formula-analysis-navigation.test.ts tests/formula-result-statistics-view.test.ts tests/mobile-navigation.test.ts`

- [ ] **Step 3: Add hidden view and dynamic boundary**

Add `formula-analysis` to `ViewKey` and labels but not `navItems`; dynamically import the cockpit only for the nested route. Use a helper `isNavItemActive(itemKey, activeView)` so the statistics nav remains active.

- [ ] **Step 4: Implement URL-backed toolbar**

Use `useSearchParams` for initial parse and `router.replace` inside `startTransition` for changes. On mobile collapse secondary filters into a bottom sheet with current summary visible on the closed trigger.

- [ ] **Step 5: Replace dialog trigger with route link**

Preserve current action/type in the href. Keep the page’s quick ranking and evidence; remove modal-open state and portal composition once no call sites remain.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm exec vitest run tests/formula-analysis-navigation.test.ts tests/formula-result-statistics-view.test.ts tests/mobile-navigation.test.ts`

```powershell
git add -- src/app/formula-result-statistics/analysis/page.tsx src/components/formula-analysis src/components/formula-result-statistics-view.tsx src/components/rulequant-terminal.tsx tests/formula-analysis-navigation.test.ts tests/formula-result-statistics-view.test.ts tests/mobile-navigation.test.ts
git commit -m "feat: add formula analysis cockpit route"
```

### Task 7: Overview and landing workspaces

**Files:**
- Create: `src/components/formula-analysis/formula-analysis-overview.tsx`
- Create: `src/components/formula-analysis/formula-landing-workspace.tsx`
- Modify: `src/components/formula-draw-landing-chart.tsx` or split reusable aligned count/rank primitives beside it.
- Test: `tests/formula-analysis-cockpit.test.tsx`
- Modify: `tests/formula-draw-landing-chart.test.tsx`

**Interfaces:**
- Overview consumes `FormulaAnalysisReport` and calls `onSelectLandingRecord(record)`.
- Landing workspace consumes the report landing records and exposes modes `timeline | count-distribution | rank-distribution`.

- [ ] **Step 1: Write failing overview tests**

Assert one deterministic insight, four KPIs, health/data summaries, latest three completed rows, one contextual detail action after row selection, exact short-coverage copy, and stale-but-visible warning.

- [ ] **Step 2: Write failing landing tests**

Assert aligned shared issue axis, separate count/rank units, rank 1 at top, exact count histogram bins including zero, exact rank distribution including ties, direct actual labels, 44px controls, keyboard selection, and completed-only totals.

- [ ] **Step 3: Run RED**

Run: `pnpm exec vitest run tests/formula-analysis-cockpit.test.tsx tests/formula-draw-landing-chart.test.tsx`

- [ ] **Step 4: Implement overview with one-screen hierarchy**

Use one primary KPI, three secondary KPI cards, a concise health/status band, and no full ranking/pareto/matrix. Use existing Badge/Button/Panel and data tokens.

- [ ] **Step 5: Implement landing mode switcher**

Use SVG for the two aligned explanatory charts and DOM horizontal bars for distributions. Keep precise values below/alongside every visual; no hover-only content.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm exec vitest run tests/formula-analysis-cockpit.test.tsx tests/formula-draw-landing-chart.test.tsx tests/formula-draw-landing.test.ts`

```powershell
git add -- src/components/formula-analysis/formula-analysis-overview.tsx src/components/formula-analysis/formula-landing-workspace.tsx src/components/formula-draw-landing-chart.tsx tests/formula-analysis-cockpit.test.tsx tests/formula-draw-landing-chart.test.tsx
git commit -m "feat: add formula landing analysis views"
```

### Task 8: Formula diagnostics and evidence workspace

**Files:**
- Create: `src/components/formula-analysis/formula-health-workspace.tsx`
- Create: `src/components/formula-analysis/formula-evidence-workspace.tsx`
- Modify: `src/components/formula-complete-matrix.tsx`
- Modify or split reusable evidence pieces from: `src/components/formula-result-visualization.tsx`
- Test: extend `tests/formula-analysis-cockpit.test.tsx`
- Modify: `tests/formula-complete-matrix.test.tsx`
- Modify: `tests/formula-result-visualization.test.ts`

**Interfaces:**
- Diagnostics consumes health rows/pair diagnostics and exposes rule/issue focus.
- Evidence consumes current action/type/window/target/issue and filtered periods; actual clicks atomically set issue and target.

- [ ] **Step 1: Write failing health UI tests**

Assert 10/30/50 exact samples, explicit status copy, formula search, status filter, sort, recent failures, technical detail disclosure, duplicate/conflict tabs, thresholds, common sample count, and example issue drill-down.

- [ ] **Step 2: Write failing evidence tests**

Assert full domain, sticky semantic headers, pending row, honest zero evidence, one toolbar, no per-row repeated “查看”, searchable evidence, selected-row detail, actual cell atomic focus, and mobile accessible card labels.

- [ ] **Step 3: Run RED**

Run: `pnpm exec vitest run tests/formula-analysis-cockpit.test.tsx tests/formula-complete-matrix.test.tsx tests/formula-result-visualization.test.ts`

- [ ] **Step 4: Implement diagnostic tables**

Use semantic tables on desktop and header-preserving cards on mobile. Keep raw percentage, numerator/denominator, sample warnings, and thresholds visible; do not use a health score gauge.

- [ ] **Step 5: Implement contextual evidence**

Reuse matrix business logic. Use windowed rendering only for the long formula evidence list; keep complete result counts in the report and accessible text.

- [ ] **Step 6: Remove obsolete long-dialog composition**

Delete only components/styles/imports with no remaining call sites; preserve reusable chart and matrix primitives. Update tests to exercise route workspaces rather than dead dialog UX.

- [ ] **Step 7: Run tests and commit**

Run: `pnpm exec vitest run tests/formula-analysis-cockpit.test.tsx tests/formula-complete-matrix.test.tsx tests/formula-result-visualization.test.ts tests/formula-result-visualization-data.test.ts`

```powershell
git add -- src/components/formula-analysis/formula-health-workspace.tsx src/components/formula-analysis/formula-evidence-workspace.tsx src/components/formula-complete-matrix.tsx src/components/formula-result-visualization.tsx tests
git commit -m "feat: add formula diagnostics and evidence"
```

### Task 9: Visual system, responsive behavior, performance, and final verification

**Files:**
- Modify: `src/app/globals.css`
- Modify: `scripts/build-static-pages.mjs` if nested route is not automatically captured.
- Modify: relevant tests for styles only through behavior/DOM, never by asserting CSS source strings.

**Interfaces:**
- Produces the final desktop/mobile visual contract and static output.

- [ ] **Step 1: Add behavioral regression tests before styling**

Assert tab panels unmount/lazy-load when inactive, filter bottom sheet focus/close behavior, 44px interactive wrappers, screen-reader chart summaries, no nested interactive SVG, header semantics, reduced-motion class behavior, and saved-view restore.

- [ ] **Step 2: Run focused RED**

Run: `pnpm exec vitest run tests/formula-analysis-cockpit.test.tsx tests/formula-analysis-navigation.test.ts`

- [ ] **Step 3: Implement token-based styles**

Create a one-screen desktop overview, fixed toolbar, four-tab hierarchy, internal matrix/evidence scroll, mobile filter sheet, one-chart-at-a-time mobile order, real SVG focus halos, direct labels, and dark/reduced-transparency variants.

- [ ] **Step 4: Verify React performance boundaries**

Confirm direct imports, dynamic tab modules, stable primitive dependencies, memoized expensive derived structures, `startTransition` for filters, passive scroll listeners, versioned localStorage, `content-visibility` for long off-screen content, and no duplicate global listeners.

- [ ] **Step 5: Run complete automated verification**

```powershell
pnpm exec vitest run
pnpm typecheck
pnpm lint
pnpm build
pnpm build:static
```

Expected: all commands exit 0; static output contains `out/formula-result-statistics/analysis/index.html`; `src/app/api` is restored after static build.

- [ ] **Step 6: Run in-app Browser acceptance**

Check `1440×900` and `390×844`, light/dark, reduced motion/transparency, 10/30/50, exclude/support, each supported target type, comparison, save/restore, data error states, keyboard focus, and console. Save screenshots for comparison with the audited current state.

- [ ] **Step 7: Commit**

```powershell
git add -- src/app/globals.css scripts/build-static-pages.mjs tests
git commit -m "feat: finish formula analysis cockpit"
```

## Completion Gate

- All nine tasks committed with focused tests passing at each boundary.
- Full suite, typecheck, lint, production build, static build, API regression, desktop/mobile Browser QA, and clean intended worktree verified.
- Do not publish; keep the verified local server ready for the user.
