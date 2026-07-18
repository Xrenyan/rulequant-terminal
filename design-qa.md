# RuleQuant Design QA

## Target

- Product direction: a full-width desktop workspace and a separately adapted mobile experience, using restrained light and dark SaaS styling with iOS 26-inspired functional glass.
- Reference principles: glass is reserved for controls and navigation, content remains readable, corners are concentric, and the mobile tab bar becomes more compact while scrolling down.
- The desktop experience is not a centered mini-app or enlarged mobile layout. Existing product workflows and data density are preserved across the available viewport.

## Visual System

- Typography uses the native Apple/Windows UI stack with consistent page, section, body, helper, table, badge, and numeric scales.
- Light mode uses opaque high-contrast content surfaces over a cool neutral canvas.
- Dark mode uses deep neutral surfaces without a single-hue wash.
- Blur and translucency are limited to the sidebar, top bar, workflow controls, floating mobile navigation, and other interactive layers.
- Content panels, tables, metrics, and evidence views remain opaque for legibility.

## Interaction Review

- Primary and secondary controls provide hover, press, focus, loading, and disabled feedback.
- Mobile navigation expands near the top, compacts while scrolling down, and expands when scrolling up.
- Reduced motion, reduced transparency, safe-area insets, and increased-contrast preferences are supported.
- Internal runtime terms were removed from ordinary user-facing states; backup formats remain available only where the format is relevant.

## Browser Acceptance

- Viewports: 1920 x 1080, 1440 x 960, 1280 x 800, and 390 x 844.
- Routes: dashboard, one-click, candidate-pool, draws, rules, sample-check, formula-discovery, formula-editor, special-analysis, and config.
- Automated route matrix: 30 route/viewport checks across 1440, 1280, and 390 widths.
- Horizontal overflow: none.
- Text below 11px: none.
- Console errors and warnings: none.
- Desktop shell width at 1920: passed; the content area uses the available desktop workspace instead of a fixed centered frame.
- Rules pagination at 1280: passed without vertical text or clipped controls.
- Compact mobile navigation and return-to-top expansion: passed.

## Engineering Acceptance

- TypeScript check: passed.
- Automated tests: 128 passed.
- Production build: passed for all 21 routes.
- Production dependency security audit: 0 known advisories.
- Existing features and local formula data contracts remain unchanged.
