# Formula Draw Landing Analysis Design

**Date:** 2026-08-17
**Status:** Approved direction; written specification awaiting user review
**Selected approach:** A — complete result matrix + draw-landing trend + period records

## 1. Purpose

Extend the existing Formula Result Statistics visualization so the user can answer, for every recently completed draw:

1. What actually opened?
2. How many formulas excluded or supported that actual result?
3. Where did that count rank among the complete result domain for the same calculation period?
4. How has that actual draw landing changed across the latest ten completed target periods?

The feature must preserve the current RuleQuant iOS glass language, existing live-data behavior, desktop/mobile support, and cross-filter interactions. It must not add parity or size statistics and must not publish until the user explicitly requests publication.

## 2. Current Problem

The matrix currently calls `selectRankSeries(..., 6)`, so it renders only six leading results (with selected-result retention). For生肖 this means the complete twelve-result set is not visible even though the ranking panel may contain all twelve.

The current visualization also knows each calculation issue and target issue but does not attach the target draw's actual special number and attributes to the summary period. Consequently, it cannot identify the actual result cell, calculate its same-period position, or produce a verified ten-period landing trend.

## 3. Terminology and Statistical Contract

### 3.1 Period mapping

- **Calculation issue:** the source draw used to calculate formulas.
- **Target issue:** the next draw the formula output corresponds to.
- **Actual draw landing:** the actual special number/result from the target issue.
- A record is verified only when the target draw exists and its special number can be normalized.
- The newest calculation issue may correspond to `下期待开奖`; this row remains pending and never contributes to verified KPIs.

There must be no off-by-one ambiguity: calculation issue `N` is always evaluated against target issue `N+1` as already determined by sorted draw order, not by arithmetic string manipulation.

### 3.2 Count

- In exclusion mode, the landing count is the number of unique eligible formula contributions whose output contains the actual target result. The UI copy is `被排除次数`.
- In support mode, it is the number of unique eligible formula contributions whose output contains the actual target result. The UI copy is `被支持次数`.
- Each formula contribution counts once per unique target, matching the existing statistics contract.
- The feature uses neutral copy such as `实际开奖落点`; exclusion of the actual result must not be mislabeled as a successful formula hit.

### 3.3 Position

Position is the actual target result's rank among the **complete target domain for the same calculation period**, sorted by count descending.

- Rank 1 means the highest count.
- Equal counts share a standard competition rank: `1, 2, 2, 4`.
- A tie is displayed as `并列第 N 位` and retains the number of tied results for accessible detail.
- Zero-count results remain part of the domain and therefore remain rankable.

### 3.4 Ten-period window

- The landing chart and record list show the latest **ten completed target issues**, not nine completed issues plus one pending issue.
- The summary engine therefore prepares enough calculation periods to obtain ten verified pairs and the newest pending pair when present.
- The complete matrix continues to show the latest ten calculation rows, including the pending row when applicable.
- The UI reports exact coverage, for example `10期已验证 · 1期待开奖`.

## 4. Complete Result Domains

The matrix must not infer completeness only from formula outputs. It uses an explicit domain for the selected result type so zero-count results remain visible:

| Result type | Complete domain |
| --- | --- |
| 生肖 | configured 12-zodiac order |
| 尾数 | 0–9 |
| 头数 | 0–4 |
| 合数 | 1–13 |
| 段位 | 1–7 |
| 五行 | every configured element |
| 波色 | every configured color |
| 半头 | 0头单/双 through 4头单/双 |
| 半波 | 红/蓝/绿 × 单/双 |
| 门数 | 1门–5门 |
| 号码 | 01–49 |

For 号码, the matrix uses compact seven-column number blocks instead of a forty-nine-column horizontal strip. All other domains use one column per result and horizontal scrolling only when the available width requires it.

## 5. Actual Target Resolution

Each verified period stores the normalized target draw's special number and attributes. The actual target key for the selected result type is resolved as follows:

- 生肖 → special zodiac
- 尾数 → special tail
- 头数 → special head
- 合数 → special sum
- 段位 → special segment
- 五行 → special element
- 波色 → special color
- 半头 → special head + special parity
- 半波 → special color + special parity
- 门数 → the defined 1–9 / 10–18 / 19–27 / 28–37 / 38–49 range
- 号码 → special number

Resolution is independent of whether a formula happened to output that result. An actual result with zero contributions still appears with count 0 and its correct rank.

## 6. Interface Design

### 6.1 Complete period matrix

Rename the matrix subtitle to communicate completeness: `期次 × 全部结果 · 点击交叉筛选`.

- Render the complete domain instead of `visibleSeries`.
- Preserve the existing global heat scale and visible cell values.
- Keep the calculation issue/target issue row header sticky during horizontal scrolling.
- Mark the verified actual target cell with a non-color-only treatment: target icon from the existing Lucide library, stronger outline, and `实际开奖` accessible text.
- The marked cell visibly includes the special number where space permits; the full accessible label always includes target issue, special number, target label, count, and position.
- The pending row displays `待开奖` in its row header and has no actual-cell marker.
- Clicking any ordinary cell keeps current target/period cross-filter behavior.
- Clicking the actual marked cell additionally focuses the landing record and filters evidence to formulas contributing to the actual result for that calculation issue.

Desktop shows the full matrix inside the existing panel. Mobile keeps the same complete matrix in a horizontally scrollable region, with a sticky row label and no page-level horizontal overflow.

### 6.2 Latest-ten draw landing trend

Add a new full-width panel immediately after the rank trajectory and Pareto row and before the complete matrix.

Title: `近十期开奖落点趋势`
Subtitle: `实际结果 · 次数 · 当期位置`

Use a Power BI-style combination chart:

- X-axis: target issues, oldest to newest.
- Bars: actual result count for the active action (`被排除次数` or `被支持次数`).
- Line: same-period rank with rank 1 at the top.
- Direct point label: actual result label and special number, for example `狗 · 18`.
- The selected point is visibly emphasized and remains understandable without hover.
- A count-average reference line is shown only when at least two completed periods exist.
- The legend explicitly distinguishes count bars, rank line, and average reference.
- Clicking a point focuses that calculation/target pair, updates the matrix emphasis, KPI cards, and evidence records.

The chart must not imply that two y-axes share the same unit. Both axes are directly titled, and the rank axis is visually reversed and labeled `第1位在上`.

### 6.3 Landing KPI strip and automatic insight

The new panel starts with four compact KPIs computed only from completed target periods:

1. `实际结果平均次数`
2. `落在前三期数`
3. `实际结果平均位置`
4. `单期最高次数`

The insight sentence is deterministic and evidence-based, for example:

> 最近10个已开奖期中，实际结果平均被排除4.6次，4期落在前三位；最近一期为狗，被排除2次，位于第9位。

If fewer than ten completed target issues exist, the sentence says the exact available count. Zero completed issues show a neutral empty state and no fabricated values.

### 6.4 Landing record list

Add a semantic list/table directly below the combination chart.

Columns on desktop:

- 计算期
- 开奖期
- 实际特码 / 结果
- 次数
- 当期位置
- 贡献公式

Each completed row includes a `查看` control that filters the evidence section to the matching calculation issue and actual target. `贡献公式` shows the distinct contributing-formula count; the filtered evidence section provides the exact formula names and outputs so the number is auditable. The newest pending record, when present, is visually separate and reads `下期待开奖 · 待验证`.

Mobile renders the same information as compact stacked cards in this order:

1. 开奖期 + actual result
2. Count + rank
3. Calculation issue
4. `查看贡献公式` action

No essential value is hover-only.

### 6.5 Reading order

Desktop grid order:

1. Analysis overview
2. Relative trend + complete ranking
3. Rank trajectory + Pareto
4. Draw landing trend and KPIs
5. Complete matrix
6. Landing record list
7. Formula evidence

Mobile order keeps the analytical narrative:

1. Analysis overview
2. Relative trend
3. Draw landing trend and KPIs
4. Landing record cards
5. Complete ranking
6. Rank trajectory
7. Pareto
8. Complete matrix
9. Formula evidence

## 7. Interaction State

Use the existing ephemeral dialog state. Do not persist a selected issue or target because daily data changes.

Add one state concept: `focusedLandingIssue`, represented by the calculation issue that owns the verified target pair. Selecting a trend point, landing row, actual matrix cell, or period filter updates the same state rather than creating separate filters.

The existing `清除期次筛选` control clears both ordinary period focus and landing focus. Target selection remains independent so the user can compare an arbitrary target while retaining an actual-period focus.

## 8. Data Architecture

### 8.1 Summary period extension

Extend `FormulaSummaryPeriod` with a serializable optional target result:

```ts
type FormulaSummaryTargetResult = {
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
```

The worker-safe summary builder normalizes the actual next draw and attaches this object. Pending periods omit it. Target normalization failure is recorded as a target-result warning and does not corrupt formula contribution statistics.

### 8.2 Pure landing derivation

Add a focused pure module that owns:

- complete domain construction
- actual target-key resolution
- per-period complete counts and competition ranks
- draw-landing record construction
- KPI and insight derivation

The React dialog consumes the derived model and owns only selection/filter state. Existing chart components receive typed data and do not calculate business semantics.

### 8.3 Performance

- The largest normal workload is 10 × 49 = 490 matrix cells, which does not require virtualization.
- Domain, ranks, landing records, and KPI values are derived in memoized pure functions.
- The visualization remains lazy-loaded.
- Off-screen panels retain `content-visibility: auto`.
- No new chart runtime dependency is added.

## 9. Error and Edge States

- **Pending target:** show `待开奖`; exclude from completed KPIs.
- **Missing target draw:** show `目标期开奖数据缺失`; do not shift to another issue.
- **Target normalization error:** preserve contribution data, surface one concise warning, exclude only that landing record.
- **Zero contributions:** show actual result with count 0 and its full-domain tied rank.
- **Fewer than ten draws:** use every completed pair available and state the exact count.
- **No eligible action/type:** retain the existing empty state.
- **Ties:** always show `并列第 N 位`; do not break ties alphabetically for the displayed position.

## 10. Accessibility and Visual Rules

- Use existing design tokens, typography, glass backgrounds, radii, and spacing.
- Use Lucide icons already in the project; do not introduce emoji or improvised icons.
- The actual landing marker must use outline/icon/text in addition to color.
- SVG charts expose concise `role="img"` labels summarizing latest count/rank and the ten-period sequence.
- Record rows and matrix cells are keyboard-operable with at least 44 CSS px touch targets where practical.
- Charts retain direct labels under reduced motion; animations are disabled when requested.
- Dark mode and reduced-transparency mode remain supported.

## 11. Testing and Acceptance Criteria

### 11.1 Pure data tests

- Complete生肖 domain always has 12 results, including zero-count results.
- Complete tail/head/sum/segment/half-head/half-color/door/number domains have their specified sizes.
- Calculation issue maps to the actual next draw without off-by-one errors.
- Actual result count matches the formula contributions for that period.
- Competition ranks follow `1, 2, 2, 4`.
- Zero-count actual results remain present and rankable.
- Landing window returns ten completed records plus a separate pending record when sufficient data exists.
- KPI and insight values exclude pending and invalid records.

### 11.2 Component tests

- Matrix uses the complete domain rather than six visible series.
- Actual cell has target issue, special number, count, rank, and non-color-only marker.
- Clicking chart point, landing row, and actual cell produces the same focused issue.
- Clearing the period filter restores all-period evidence.
- Mobile DOM order places landing analysis before the long ranking.
- Pending and missing-data states render the specified copy.

### 11.3 Browser acceptance

- Desktop confirms all 12生肖 columns are accessible and the actual cell is visibly identifiable.
- 390 × 844 mobile has no page-level horizontal overflow; only matrix/chart containers may scroll internally.
- A completed point filters to the correct formula evidence and issue.
- Latest pending row never displays a false actual result.
- Light and dark modes have readable axes, markers, table values, and selected states.
- Console contains no errors or warnings.

### 11.4 Full application verification

- Full tests, typecheck, lint, production build, and GitHub Pages static build exit 0.
- Local page and local API routes are checked.
- Publication is not performed unless the user explicitly requests it after reviewing the local result.

## 12. Non-goals

- No parity or size statistics.
- No formula editing, alerting, forecasting score, or claim that excluding the actual result is a successful hit.
- No new route or third-level modal.
- No 3D, radar, gauge, particles, or WebGL.
- No new chart library and no Vercel deployment.
