# Plain-language analysis and mobile completion

## Global Constraints

- User approved the seven-part proposal in this conversation. Local implementation only: do not push, merge remote PRs, deploy, or publish.
- Work in D:/rulequant-terminal/.worktrees/formula-visualization-cockpit on agent/plain-analysis-20260905 (base 0072fa52). Existing iOS glass styling and information-rich pages must remain recognizable.
- Plain Chinese everywhere. Preserve essential freshness, missing-data and formula-error notices; infrastructure details belong in expandable advanced maintenance, not normal reading flows.
- Preserve raw formula-result occurrence counts, complete domains including zero counts, actual draw markers and tied ranks. Statistics exclude standalone parity/size but include half-head and half-color.
- Historical analysis default 10 periods, selectable 10 through 200 in steps of 10. Actual usable count must be clear. All requested details remain accessible, never capped without a continuation control.
- New effects and grouping analysis are advisory only: do not silently change live recommendation scoring, rule enablement or formula library content. Plain-language conclusions must distinguish a historical difference from proof of a future advantage.
- Maintain pure-addition discovery and all-history exploration. Baselines must match actual rule success semantics, numbers covered, verify offset/span and target; explicitly mark unsupported cases rather than guessing.
- Heavy comparison runs on demand in a Worker, caches bounded, stale outputs suppressed and error/retry states usable.
- Current formula snapshots/prospective observation must not fabricate past pre-draw records. Version changes restart observation while preserving earlier records.
- Avoid new network dependencies for product functionality. Use local project patterns. Apply_patch for edits; meaningful tests for analytical and persistence behavior, not trivial copy assertions.

## Task 1: Analytical ranges and formula effect evaluation

Own src/lib/formula-analysis, src/components/formula-analysis (except broad CSS), src/lib/formula-summary as required, and focused tests.

1. Unify analysis window parsing, saved views, compare windows, report limits and UI across 10..200/step10, default10. Reuse a shared exported constant/normalizer. Health reporting must honor selected range in addition to recent comparisons; keep backward compatibility where practical. Fix any max-period caps in underlying summary/landing builders.
2. Add pure formula-effect evaluation reused by health and future formula-detail integration. Inputs existing backtest details + rule/config/draws. Compare actual successes against a uniform-number reference that matches each rule's target and multi-period success semantics, actual mapped number coverage, duplicates removed, valid cases only. Include sample count, expected rate, actual rate, percentage-point difference and uncertainty/sample-aware plain-language interpretation. Do not present ranking score as probability or call a 2-point difference statistically proven. For unsupported rules show a reason and historical actual result without invented baseline.
3. Integrate effect cards and wrong-period links in diagnostics using existing iOS components and natural Chinese (这条公式表现怎么样 / 已统计 / 排除正确 / 选中). Keep pair/conflict diagnostic semantics and raw counts intact. Reuse existing backtest work/cache; no redundant full recalculation per row.
4. Add tests for 10/200/clamped malformed windows, saved-view preservation, zero samples, single-number/5-number exclusions, unequal zodiac coverage, include/exclude and multi-period semantics (or justified unavailable status), supported unsupported targets and error cases. Run focused tests and typecheck, report evidence.

## Task 2: Plain-language interface, full details and mobile layout

Own src/app/globals.css, src/components/ui/expandable-visualization.tsx, src/components/formula-analysis/formula-evidence-workspace.tsx, general interface copy in rulequant-terminal.tsx and help content. Coordinate with root before modifying integration regions.

1. Review and rewrite everyday UI across dashboard, one-click, results, formula analysis, formula detail, discovery, rules, data and settings. Replace sample/threshold/evidence jargon with plain specific Chinese. Remove self-referential implementation commentary and raw Worker/API errors from everyday pages. Technical settings and logs remain available in advanced disclosure; important freshness/error/missing-period facts stay visible. Rename backup downloads with understandable names and keep actual formats available secondarily.
2. Fix evidence list's hard 40-row cap using complete filtering then progressive paging with accurate filtered counts, reset on changed selection/query, a real continuation button and no stale detail selection. Also fix other touched hard caps that have no complete-access path.
3. Add a scoped responsive polish section using existing tokens. Mobile 360/390/430 CSS px: body approx16, secondary13-14, usable44px targets, compact headers, one-column long cards, 2-column short metrics, readable wrapping formulas, no full-document horizontal overflow, sticky controls not obscuring data. Keep filters summarized and sheet scrollable; return, close and help always accessible; respect safe areas.
4. Charts enlarge on desktop and full-screen mobile, focus restored when closing, Escape/backdrop behavior safe, inside content scrollable; no dropped categories or zero values. Wide matrices scroll within a container with fixed issue/context and clear swipe hint. Text enlargement must not clip critical info. Reuse existing enlargement functionality rather than duplicate it.
5. Rewrite relevant guide topics with purpose/steps/read-result/troubleshoot in ordinary language. Main agent captures current desktop/mobile screenshots after integration, then guide should link/use actual files.
6. Focused behavior test for >40 records with search and pagination; existing modal/mobile semantic tests as appropriate, typecheck/lint. Do not run live publishing.

## Task 3: Saved formula groups, prospective tracking and rank changes

Owned by root, bounded new modules/components + integration in rulequant-terminal.tsx. Coordinate existing-file edits with Task2.

1. Save named groups of selected enabled formulas locally with validation, rename/remove, restoration and empty/unavailable state. On candidate-pool combinations UI, compare all vs selected group on the same selected 10..200 resolved issues, using existing historical algorithm with no future result in weights. Show correct/incorrect counts, equal common sample and chronological outcomes. Make run user-triggered in a Worker; reject empty group instead of treating it as all. Saved groups never change rule enablement.
2. Add repeated-output reduction comparison as advisory on-demand mode alongside normal vs group comparison. Reduce exact equivalent outputs by normalized semantic identity within each historical issue, count each rule once including complementary signals, and accurately call it 同一期相同结果只算一份 (do not claim statistical independence or alter raw result statistics). Compare using the same historical issues and don't change default live scoring.
3. Freeze local observation enrollment with rule/config version, latest observed issue and actual timestamp; record formula output before any future target issue appears, then resolve newly arrived draws per engine semantics. No backfilling already-known draws as prospective. Preserve old versions. Bounded persistence with clear storage failure states. Present 加入观察后的表现 and actionable details, no synthetic past claims.
4. Candidate number/zodiac detail shows rank change relative to previous saved compatible issue and actual evidence additions/removals/changed influence. If missing comparable prior snapshot, say not enough records. Explain that prior-order comparison is historical, not causal certainty; don't compare two regenerations of the same issue as separate issues.
5. Meaningful tests: same common periods, no selection-as-all, no future leakage, group persistence validation, duplicated outputs semantics, observation baseline/no backfill/version change/new resolution, same-issue rank exclusion and unavailable context.

## Task 4: Integration verification and guide evidence

1. Run targeted tests throughout; one complete suite, typecheck, lint, normal build and static build once final edits settle. Stop local dev during static build on Windows to avoid directory locks and restart afterward.
2. Browser validation (existing available tooling; regular Playwright if Browser skill unavailable), public read-only content may inform but do not publish. Exercise desktop and mobile loading, default10/select200, detail continuation/search, diagnostic baseline, saved groups/comparison, observation, chart enlarge/close/return, error states and guide links. Capture relevant actual screenshots for guide mobile/desktop.
3. Review all changes against plan for spec and quality. Preserve user changes. Leave local server running at localhost:3000 and final report in plain Chinese with any specific limitations, no release claim.
