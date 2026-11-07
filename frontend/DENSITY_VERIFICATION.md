# Viewport sizing update — 7 November 2026

The complaint detail screen now uses a compact summary and three desktop panels:
**Evidence & fix**, **Location & grouping**, and **History / Updates & questions**.
The reference complaint's evidence, repair note, verification disclosure, map,
coordinates and grouping figures fit together at 1280×600. Its longer timeline
scrolls independently at that height; at 1440×900 the complete six-event example
is visible. No timeline entries, notes, photos or actions were removed.

## Changes

- Shared desktop navigation, page margins, panel gaps and headings use less
  vertical space while retaining existing typography and 44px primary controls.
- Complaint maps use a bounded viewport-sized preview. Larger map opens the
  existing Explore issues map centered on the complaint with its status filter.
- Photos use contained previews and native full-size dialogs. Keyboard Escape
  dismisses a photo and returns focus to its preview.
- History and updates use keyboard-operable tabs. Complete long histories and
  clarification threads stay in named internal panels. Loading/error/retry and
  merged-ticket feedback remain available; the verification disclosure remains
  visible without asserting an unsupported reason for missing confirmation.
- Dashboard cards, work queues, assignment forms and proof previews have tighter
  spacing. Configuration and profile fields use desktop columns, with their
  save actions retained. Security places password and security options alongside
  one another, with Authenticator / Devices & app views.
- Verification photos and voting controls use a desktop column layout. Mobile,
  tablet and short screens retain natural scrolling and readable controls.

`src/app/viewport-layout.css` centralizes the sizing rules and media tokens.
`SectionTabs` and `EvidencePhoto` provide reusable accessible in-page controls.
The existing palette, business logic, API contracts, roles and civictrack IDs
remain unchanged. Backend and existing API/auth/domain files matched the pre-edit
snapshot at `/tmp/nagriksetu-before-density/`.

## Completed checks

- Production build, ESLint, TypeScript, **88 unit tests / 13 files** and edited-file
  whitespace checks passed.
- `viewport-layout.mjs`: **41 layout checks and 7 interaction/content checks**
  passed. Complaint details were checked at **1280×600, 1366×768, 1440×900,
  1920×1080, 390×844 and 768×1024**. Representative dashboard, issue browsing,
  reporting, account, staff, supervisor and administrator views were checked at
  1280×600, 1440×900 and 390×844. No runtime/accessibility findings.
- A final public-only pass after the centroid label and larger-map link changes
  passed **16 layout and 5 interaction checks**, including the correct status
  filter, centered map and the current complaint marker. It also refreshed the
  public screenshots after the local API restart.
- Checked no outer desktop/horizontal scrolling, visibility of main complaint
  sections, no unnecessary evidence/location panel scrolling for the example,
  bounded map height, photo dialog/focus return, activity-tab keyboard access,
  complete 50-entry timeline scrolling, photo retry feedback, profile columns,
  visible password inputs/action and accessible device/session controls.
- `unified-workspace.mjs`: **43 layout/screenshot and 24 interaction checks**
  passed with zero runtime/accessibility findings. These include proof validation,
  upload and assignment payload fixtures, work-action queue refresh, mobile
  queue/detail focus, role guards, deep links and actual audit CSV download.
- `screen-consolidation.mjs`: **78 layout and 21 interaction/redirect checks**
  passed across all five access contexts. Zero runtime/actionable accessibility
  findings. One spatial-map target-size scan was accepted only after verifying
  the existing equivalent issue-list controls and their 44×44px targets.
- `complaint-tracking.mjs` passed real anonymous lookup, loading/error/retry,
  normalization, merged-ticket links, five viewport sizes and accessibility.
- Older `audit.mjs` selectors were updated for the security views, and `sweep.mjs`
  ignores unshown dialog images when checking visible failed-photo fallbacks.
  Their syntax was checked; those two full suites were not rerun in this pass.

Browser checks used Chrome and the local demo API, with a browser-only CORS bridge
for the temporary production server. Error/long-content and sensitive writes used
fixtures; no civic record writes were made by the layout tests. The API process
exited after the main audits; its documented demo service was restarted against
the existing database without reseeding or editing backend files.

Physical devices, Firefox/WebKit, screen readers, installed PWA, real uploads,
mail delivery and backend tests were not rerun. Long histories, expanded controls
and large forms can still require intentional internal scrolling. Mobile uses
natural page scrolling. Nothing was committed, pushed or deployed.

## Screenshots

- [Complaint detail, 1280×600](../artifacts/viewport-layout/complaint-detail-1280.png)
- [Complaint detail, 1440×900](../artifacts/viewport-layout/complaint-detail-1440.png)
- [Complaint detail, mobile](../artifacts/viewport-layout/complaint-detail-390.png)
- [Profile columns](../artifacts/viewport-layout/STAFF-_me_settings-1280.png)
- [Security columns](../artifacts/viewport-layout/STAFF-_me_settings-security-1280.png)
- [Device view](../artifacts/viewport-layout/security-devices-1280.png)

Machine-readable results and other captures are in `artifacts/viewport-layout/`,
`artifacts/unified-workspace/` and `artifacts/screens-consolidation/` (local and
gitignored). The main development preview remains on localhost:3000.
