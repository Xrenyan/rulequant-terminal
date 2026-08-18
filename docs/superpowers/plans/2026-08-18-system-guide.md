# RuleQuant System Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a beautiful, searchable, plain-language, image-and-text system guide inside Settings that covers every primary module and secondary tool, with contextual help links from the real interface.

**Architecture:** A typed static content model is the single source for guide navigation, search, glossary, chart explanations, and page anchors. The Settings guide tab loads lazily, uses real locally captured interface screenshots with accessible HTML callouts, and links back into live pages; the old `/help`, `RuleUnderstandingPage`, and unused `HelpContent` are consolidated instead of duplicated.

**Tech Stack:** Next.js 16.2.11, React 19.2.4, TypeScript, Vitest/jsdom, existing RuleQuant components/tokens, in-app Browser screenshots, responsive local image assets.

**Spec:** `docs/superpowers/specs/2026-08-18-formula-analysis-and-system-guide-design.md`

## Global Constraints

- Cover all ten primary modules and all listed secondary tools.
- Every topic must include purpose, when to use, real screenshot, steps, result interpretation, common misunderstanding, troubleshooting, and related learning.
- Use real RuleQuant screenshots and real UI labels; no fabricated interface, placeholder art, emoji icons, or generic stock imagery.
- Use plain Chinese first and retain professional names in parentheses/technical details.
- Images complement the complete text path; no instruction may exist only inside an image.
- Keep the existing iOS design language, mobile parity, keyboard access, dark/reduced modes, and system font stack.
- Total guide image target: at most 3 MB; below-fold images lazy-load.
- Do not make predictive or betting guarantees and do not add parity/size to formula-result statistics explanations.
- Do not publish until explicitly requested; do not stage/revert `next-env.d.ts`.

---

## File Map

- `src/content/system-guide/types.ts` — guide topic, section, callout, step, glossary, chart-guide contracts.
- `src/content/system-guide/index.ts` — ordered catalog and search index.
- `src/content/system-guide/getting-started.ts` — three-minute workflow.
- `src/content/system-guide/primary-modules.ts` — ten primary module topics.
- `src/content/system-guide/secondary-tools.ts` — detail/import/editor/backtest/output/reports topics.
- `src/content/system-guide/charts-and-terms.ts` — chart reading, formula terms, Mark Six 6+1 structure, data/sync concepts.
- `src/content/system-guide/troubleshooting.ts` — deterministic problem → cause → action guidance.
- `src/components/system-guide/system-guide.tsx` — search, catalog, topic routing, back links.
- `src/components/system-guide/guide-topic.tsx` — standard topic renderer.
- `src/components/system-guide/annotated-screenshot.tsx` — real image, numbered accessible hotspots, zoom dialog.
- `src/components/system-guide/context-help-link.tsx` — reusable “本页说明” link.
- `public/help/screens/*` — verified desktop/mobile screenshots.
- `src/components/rulequant-terminal.tsx` — Settings guide tab, old-help consolidation, contextual link placement.
- `src/app/help/page.tsx` — compatibility redirect/binding.
- `src/app/globals.css` — guide layout and responsive styles.
- Tests: `tests/system-guide-content.test.ts`, `tests/system-guide-search.test.ts`, `tests/system-guide-ui.test.tsx`, `tests/system-guide-navigation.test.ts`.

---

### Task 1: Typed content model and search

**Files:**
- Create: `src/content/system-guide/types.ts`
- Create: `src/content/system-guide/index.ts`
- Test: `tests/system-guide-content.test.ts`
- Test: `tests/system-guide-search.test.ts`

**Interfaces:**
- Produces: `GuideTopic`, `GuideSection`, `GuideScreenshot`, `GuideCallout`, `GuideStep`, `GuideSearchResult`, `guideTopics`, `getGuideTopic`, and `searchGuideTopics(query)`.

- [ ] **Step 1: Write failing schema/catalog tests**

Assert unique slugs, unique section anchors per topic, ten required primary topics, required secondary topics, complete standard sections, valid related-topic links, nonempty alt text/captions, unique callout numbers, and no placeholder words.

- [ ] **Step 2: Write failing search tests**

Assert normalized Chinese/Latin search, aliases (`杀几次` → landing position, `打不开` → troubleshooting), title priority, keyword priority, excerpt fallback, deterministic ranking, empty query returning catalog groups, and unknown query returning a helpful empty state.

- [ ] **Step 3: Run RED**

Run: `pnpm exec vitest run tests/system-guide-content.test.ts tests/system-guide-search.test.ts`

- [ ] **Step 4: Implement contracts and pure search**

```ts
export type GuideTopic = {
  slug: string; title: string; summary: string; group: "start" | "module" | "chart" | "term" | "data" | "troubleshooting";
  keywords: string[]; aliases: string[]; route?: string; sections: GuideSection[]; related: string[];
};
```

Normalize case, spaces, punctuation, full-width characters, and common Chinese aliases. Return matched field and a short excerpt for UI emphasis.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm exec vitest run tests/system-guide-content.test.ts tests/system-guide-search.test.ts`

```powershell
git add -- src/content/system-guide/types.ts src/content/system-guide/index.ts tests/system-guide-content.test.ts tests/system-guide-search.test.ts
git commit -m "feat: add typed system guide catalog"
```

### Task 2: Guide shell, Settings integration, and old-help consolidation

**Files:**
- Create: `src/components/system-guide/system-guide.tsx`
- Create: `src/components/system-guide/guide-topic.tsx`
- Modify: `src/components/rulequant-terminal.tsx`
- Modify: `src/app/help/page.tsx`
- Test: `tests/system-guide-ui.test.tsx`
- Test: `tests/system-guide-navigation.test.ts`

**Interfaces:**
- `SystemGuide` consumes `topic`, `section`, and callbacks/route state; Settings owns only selected tab.
- `/help?topic=x&section=y` resolves to the same content as `/config?tab=guide&topic=x&section=y`.

- [ ] **Step 1: Write failing Settings/UI tests**

Assert fifth Settings item `使用说明`, hint `3分钟学会使用`, guide lazy rendering, search landmark, six catalog groups, topic breadcrumbs, exact section headings, related links, and no simultaneous rendering of old `RuleUnderstandingPage`/`HelpContent` copies.

- [ ] **Step 2: Write failing compatibility tests**

Assert `/help` preserves topic/section into the guide view, unknown topics fall back to guide home, and back navigation returns to the originating live route when provided.

- [ ] **Step 3: Run RED**

Run: `pnpm exec vitest run tests/system-guide-ui.test.tsx tests/system-guide-navigation.test.ts`

- [ ] **Step 4: Implement lazy guide shell**

Add `guide` to the Settings tab union and load the guide component only when selected. Use one search input, topic cards, breadcrumb, sticky local table of contents on desktop, and compact section picker on mobile.

- [ ] **Step 5: Consolidate old help content**

Move useful rule explanations into typed content, delete the unused `HelpContent`, replace the old `help` render path with the shared guide, and preserve public route compatibility.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm exec vitest run tests/system-guide-ui.test.tsx tests/system-guide-navigation.test.ts tests/mobile-navigation.test.ts`

```powershell
git add -- src/components/system-guide/system-guide.tsx src/components/system-guide/guide-topic.tsx src/components/rulequant-terminal.tsx src/app/help/page.tsx tests/system-guide-ui.test.tsx tests/system-guide-navigation.test.ts
git commit -m "feat: add system guide to settings"
```

### Task 3: Complete plain-language content for the whole system

**Files:**
- Create: `src/content/system-guide/getting-started.ts`
- Create: `src/content/system-guide/primary-modules.ts`
- Create: `src/content/system-guide/secondary-tools.ts`
- Create: `src/content/system-guide/charts-and-terms.ts`
- Create: `src/content/system-guide/troubleshooting.ts`
- Modify: `src/content/system-guide/index.ts`
- Modify: `tests/system-guide-content.test.ts`

**Interfaces:**
- Every topic conforms to the schema from Task 1 and exports stable anchors used by contextual links.

- [ ] **Step 1: Strengthen content tests before writing content**

For every topic require section kinds `purpose`, `when`, `orientation`, `steps`, `interpretation`, `misunderstanding`, `troubleshooting`, `related`. Require 3–6 actionable steps for task pages; chart topics require question, axes/encoding, first-look cue, worked example, and caveat.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/system-guide-content.test.ts`

- [ ] **Step 3: Write the three-minute workflow**

Use the real path: check latest draw/data source → one-click calculate → read formula result statistics → enter analysis cockpit → inspect actual landing/evidence → use comprehensive reference only after evidence.

- [ ] **Step 4: Write ten primary-module topics**

Use exact current UI names and plain explanations for 首页、一键算公式、公式结果统计/驾驶舱、综合参考结果、专项概率观察、开奖数据、公式管理、公式校验、公式筛选、设置.

- [ ] **Step 5: Write secondary-tool topics**

Cover 公式逐期明细、数据导入、公式编辑、高级回测、单期输出、导出报告、规则理解. Keep technical expressions behind a `技术细节` section.

- [ ] **Step 6: Write chart and term topics**

Cover ranking, aligned count/rank trend, distributions, matrix, main-contributor/Pareto, evidence table, calculation issue vs draw issue, exclude vs support vs success, 6+1 draw structure, number attributes, L/D order, half-head/half-color/door/segment, and historical-not-predictive caveat.

- [ ] **Step 7: Write troubleshooting topics**

Cover stale data, offline last-known data, missing issue, duplicate/conflicting issue, invalid draw, formula calculation error, worker fallback, empty results, import failure, cloud/static source difference, restore/export, and browser storage reset warning.

- [ ] **Step 8: Run tests and commit**

Run: `pnpm exec vitest run tests/system-guide-content.test.ts tests/system-guide-search.test.ts`

```powershell
git add -- src/content/system-guide tests/system-guide-content.test.ts tests/system-guide-search.test.ts
git commit -m "docs: explain every RuleQuant workflow"
```

### Task 4: Real annotated screenshots and accessible zoom

**Files:**
- Create: `src/components/system-guide/annotated-screenshot.tsx`
- Create: `public/help/screens/*`
- Modify: guide content files with final image paths/callouts.
- Extend: `tests/system-guide-ui.test.tsx`

**Interfaces:**
- `AnnotatedScreenshot` receives `{ src, width, height, alt, caption, callouts[] }`; each callout has normalized `x`, `y`, `number`, `title`, and `body`.

- [ ] **Step 1: Write failing component tests**

Assert native image dimensions, alt/caption, ordered callout list, numbered focusable hotspots, identical information in text, zoom dialog focus lock, Escape, close button, focus return, and graceful image error text.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/system-guide-ui.test.tsx`

- [ ] **Step 3: Implement screenshot component**

Use a real `<picture>`/`<img loading="lazy" decoding="async">`, HTML callouts, Lucide icons for controls, and a portal dialog for zoom. Do not draw fake UI or bake instruction text into the image.

- [ ] **Step 4: Capture verified real pages in the in-app Browser**

Capture ten primary desktop states at 1440×900 and five critical mobile states at 390×844 after cockpit UI is final. Use realistic current project data, close unrelated overlays, and include required open tabs/dropdowns only when the topic explains them.

- [ ] **Step 5: Optimize and verify images**

Convert to responsive WebP using an available deterministic image tool; record dimensions, keep desktop files under 250 KB and mobile files under 120 KB where legibility permits, and verify total guide assets stay under 3 MB. If WebP tooling is unavailable, use quality-controlled JPEG and update the spec/resource tests honestly rather than adding an unmaintained runtime dependency.

- [ ] **Step 6: Measure callout positions from final images**

Store normalized positions and verify every hotspot points at the named real control at desktop and mobile sizes. Pair each hotspot with full prose below the image.

- [ ] **Step 7: Run tests and commit**

Run: `pnpm exec vitest run tests/system-guide-ui.test.tsx tests/system-guide-content.test.ts`

```powershell
git add -- src/components/system-guide/annotated-screenshot.tsx src/content/system-guide public/help/screens tests/system-guide-ui.test.tsx tests/system-guide-content.test.ts
git commit -m "feat: add illustrated RuleQuant guidance"
```

### Task 5: Contextual help from every real workflow

**Files:**
- Create: `src/components/system-guide/context-help-link.tsx`
- Modify: `src/components/rulequant-terminal.tsx`
- Modify: `src/components/formula-result-statistics-view.tsx`
- Modify: formula analysis cockpit components.
- Extend: `tests/system-guide-navigation.test.ts`

**Interfaces:**
- `ContextHelpLink({ topic, section?, returnTo?, label? })` creates `/config?tab=guide&topic=...&section=...&returnTo=...` and exposes `aria-label="打开本页说明：<title>"`.

- [ ] **Step 1: Write failing coverage tests**

Assert every primary view key has exactly one page-level context link, formula cockpit tabs have relevant section links, chart panels link to chart-reading topics, URLs preserve return path, and no raw unknown topic is emitted.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/system-guide-navigation.test.ts`

- [ ] **Step 3: Implement reusable link and route map**

Keep a typed `Record<ViewKey, {topic, section?}>`; use the same component in desktop/mobile headings and do not duplicate links inside every card.

- [ ] **Step 4: Add chart-specific links**

Add one compact help action to each complex chart title, linked to its exact “怎么看” section. Keep the visible label on first occurrence; later occurrences may use the same accessible icon treatment.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm exec vitest run tests/system-guide-navigation.test.ts tests/formula-analysis-cockpit.test.tsx tests/mobile-navigation.test.ts`

```powershell
git add -- src/components/system-guide/context-help-link.tsx src/components/rulequant-terminal.tsx src/components/formula-result-statistics-view.tsx src/components/formula-analysis tests/system-guide-navigation.test.ts tests/formula-analysis-cockpit.test.tsx tests/mobile-navigation.test.ts
git commit -m "feat: link workflows to contextual help"
```

### Task 6: Visual polish, accessibility, performance, and final verification

**Files:**
- Modify: `src/app/globals.css`
- Modify: guide components/content/tests as findings require.

**Interfaces:**
- Produces the finished guide across desktop/mobile and full-system verification.

- [ ] **Step 1: Add behavior-first regression assertions**

Assert search focus/clear, active topic, sticky/compact table of contents semantics, zoom focus, callout target size, image lazy loading, readable text without images, reduced-motion behavior, and 200% reflow DOM order.

- [ ] **Step 2: Implement existing-token visual polish**

Use the project glass only for navigation/search/controls; keep article content sufficiently opaque. Create clear typography for purpose → steps → example → caution, restrained numbered callouts, readable code/terms, and single-column mobile flow.

- [ ] **Step 3: Run full automated verification**

```powershell
pnpm exec vitest run
pnpm typecheck
pnpm lint
pnpm build
pnpm build:static
```

Expected: all exit 0; Settings and `/help` static routes exist; cockpit route remains present; APIs are restored after static build.

- [ ] **Step 4: Run in-app Browser content and visual QA**

Review every topic against the real page, all screenshots and callouts, desktop 1440×900, mobile 390×844, light/dark, keyboard-only, reduced motion/transparency, broken-image simulation, and console. Verify ordinary users can follow the three-minute workflow without opening technical details.

- [ ] **Step 5: Check resource and bundle budgets**

Measure total guide images, verify inactive guide code is dynamically loaded, inspect route chunks, and confirm screenshot loading does not block Settings shell or formula pages.

- [ ] **Step 6: Commit**

```powershell
git add -- src/app/globals.css src/components/system-guide src/content/system-guide public/help/screens tests
git commit -m "feat: finish RuleQuant system guide"
```

## Completion Gate

- All six tasks committed and all guide topics/content contracts complete.
- Every primary page has contextual help; old help content has one canonical replacement.
- Real images, text alternatives, mobile layout, search, zoom, dark/reduced states, and return navigation verified.
- Full test/type/lint/build/static/API/Browser checks pass at the same final commit.
- Keep local preview ready; do not publish without the explicit release instruction.
