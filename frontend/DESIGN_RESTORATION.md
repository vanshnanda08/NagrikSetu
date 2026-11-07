# Committed light-design restoration

> The visual comparison below records the restoration pass. Navigation was subsequently consolidated into a shared staff/supervisor Complaints workspace; see [current screen map and verification](SCREENS.md).

Source: GitHub default branch **`main`**, commit
**`011ecb5c04192b1823065a2d4c248630c853add8`**
([commit](https://github.com/vanshnanda08/complaint-system/commit/011ecb5c04192b1823065a2d4c248630c853add8)),
“Record final cross-browser CI verification”. References were fetched and the
remote symbolic HEAD was checked before editing working files.

## What was restored

The source frontend was exported to an isolated temporary directory and built
separately for comparison. Its effective appearance comes from
`src/app/liquid-glass.css`, which overrides several earlier globals, including
the display font. The adaptation restores that rendered light appearance:

- Blue/peach radial background, subtle texture, translucent white panels,
  frosted shadows and rounded cards.
- Navy action/selection fills, navy/orange wordmark and original product icons,
  with the source's system typography and monospace ticket references.
- Floating brand capsule, central navigation capsule, rounded controls,
  translucent fields, map controls and light dialog backdrops.
- Dashboard statistics beside the original city-overview disclosures, with all
  current metrics and data sources retained.

`src/app/globals.css` defines the fixed light tokens;
`src/app/committed-light.css` adapts the source presentation to the current
components. The existing corrected workspace rules remain in
`civic-interface.css` and `dashboard.css`. This is a presentation adaptation,
not a checkout or wholesale replacement of the committed frontend.

The root declares `color-scheme: only light` and the viewport declares light
appearance. No dark CSS, toggle, theme initializer or system-color detection is
present in the application. The obsolete `theme` preference is removed after
hydration; it cannot affect the server-rendered appearance even before removal.
Native inputs and option menus explicitly inherit the light presentation.
The standalone root-error fallback also uses the restored light colors.

## Current work and features preserved

A pre-edit snapshot is retained at
`/tmp/nagriksetu-before-commit-restore/`, including frontend files, tools and the
tracked working-tree patch. Later concurrent complaint-tracking work was also
preserved. No reset, checkout, commit, push or deployment was performed.

The backend working diff remained byte-for-byte unchanged. Existing `src/lib`
and `src/app/api` files also matched the pre-edit snapshot after restoration.
This preserves API contracts, authentication/cookie rotation, role restrictions,
complaint lifecycle and verification rules, clustering, private threads,
following, MFA, offline drafts/outbox, uploads and civictrack identifiers.

The adaptation intentionally retains current improvements where reverting the
source would remove functionality or fixes:

- The anonymous complaint tracker remains on the dashboard, including inline
  results, retry/error behavior and links to public history.
- Current account/work menus and every permitted route remain available. The
  mobile disclosure replaces the source's clipped horizontal mobile links.
- Skip navigation, focus return, status text/glyphs, field validation labels,
  map list equivalents and larger interaction targets remain.
- Current internal scrolling, report submission/configuration save controls,
  master-detail editors, map resizing and non-overlapping cluster panels remain.
- Readable labels and stronger field borders are retained rather than copying
  the source's smallest labels or low-contrast form borders.
- The mobile preference checkboxes remain beside their wrapping descriptions.

These adaptations mean the result is not pixel-identical to an older feature
set. Source and restored screenshots are retained side by side for review.

## Checks actually completed

Final production source passed:

- `npm run build` (installed Next.js 16.4.3).
- `npm run lint`.
- `npx tsc --noEmit`.
- `npm test`: **82 tests in 12 files**.
- `git diff --check` for frontend/tools, and a scan confirming no application
  dark selectors, dark variants, theme toggles or color-scheme detection.

Browser verification used Chrome and the existing local demo API:

- `node tools/restore-design-audit.mjs`: **38 source-page checks** and **42
  restored page/layout checks**. Public, citizen, staff, supervisor and admin
  contexts were compared at **1440×900 and 390×844**. Dashboard edge checks
  additionally covered **1280×600, 1366×768, 1920×1080 and 768×1024**.
  Brand colors, surface/fill tokens, card radius and rendered typography matched
  the source in two exact token comparisons. Saved dark preferences and OS dark
  appearance did not alter the restored theme. No actionable accessibility
  findings or application runtime exceptions were recorded.
- With JavaScript disabled, a dark OS preference and a saved dark theme, the
  server-rendered recovery form still used light colors and native controls.
- `node tools/theme-states.mjs`: **38 interaction/state checks**, including
  navigation, keyboard focus/Escape, filters/pagination, loading/empty/error,
  offline reporting feedback, charts, verification/MFA/profile fixtures,
  report-panel scrolling, cluster geometry and staff work actions. Zero
  actionable accessibility findings.
- `node tools/complaint-tracking.mjs`: passed anonymous live lookup,
  normalization, blank input, refresh, loading/404/failure/retry, merged-issue
  links, public history, five viewport sizes and accessibility.
- The final checkbox alignment adjustment was separately checked at **390×844
  and 1440×900**, with an additional accessibility scan.

Screenshots were visually compared for the dashboard, reporting, profile,
staff queue, assignment board and configuration. Public issues/map/details,
login, notifications/security, review, analytics, cluster tools and audit were
also rendered in the source/restored comparison. Evidence, measurements and
paired screenshots are in `artifacts/restored-design/` (local and gitignored).

The comparison builds ran at localhost ports 3002 (isolated source) and 3003
(restored production). The harness uses a browser-only CORS bridge for these
secondary ports and a disconnected stream response for deterministic reference
captures. It does not change backend CORS/security settings or civic records.
The ordinary local application remains at <http://localhost:3000>.

## Limits

This pass did not rerun Firefox/WebKit, physical-device, screen-reader or
installed-PWA checks. Real external photo uploads and email delivery were not
exercised. Verification, MFA and profile writes in state previews were browser
fixtures; complaint transitions/configuration were not changed. Backend tests
were not rerun because no backend code was edited by this restoration.
