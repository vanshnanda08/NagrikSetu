# General public frontend review — 7 November 2026

The general public area is ready for screen-by-screen frontend review. Its main
destinations remain Dashboard, Explore issues (List / Map), and Report a problem.
Complaint details, ward overview, grouping information, report receipt, offline
outbox and authentication/recovery are supporting flows. No account is needed
to view public records, track a reference or compose a report.

## Corrections from this review

- Category and ward filter failures now provide error messages and retry actions.
  The report category selector and dashboard ward overview also recover through
  an explicit retry rather than disappearing or showing a dead-end sentence.
- Empty map areas explain that the user can pan, zoom or change filters.
- Manual report pins can be placed with a keyboard: focus the map, pan with arrow
  keys and press Enter to place the pin at the centre. Coordinates announce changes.
- Report receipt lookup distinguishes a missing ticket (404) from a temporary
  service/network failure, retaining a known receipt and offering retry.
- The unconfigured photo-hosting notice no longer promises successful submission
  regardless of server evidence verification.
- Compact category feedback and a keyboard-scrollable additional-details panel
  keep long/error content from sitting behind the report submit bar at 1280×600.
- The short-desktop trend chart uses a smaller plot height with unchanged text
  sizes, keeping its axes/dates and expandable table control inside the panel.

These changes retain the existing light design, role navigation, API paths,
payloads, idempotency keys, photo preparation, authentication, clustering,
verification and offline draft/outbox behavior. The backend diff is byte-for-byte
unchanged from the pre-review snapshot. Existing uncommitted work was retained.

## Checks completed locally

| Check | Result |
|---|---|
| `node tools/public-audit.mjs` against production frontend `:3003` and demo API `:8080` | 71 checks passed; no browser runtime errors or automated accessibility findings in the scanned pages |
| `VIEWPORT_PUBLIC_ONLY=1 node tools/viewport-layout.mjs` | 16 layout checks and 5 interaction/content checks passed; no runtime/accessibility findings |
| `node tools/complaint-tracking.mjs` against `:3000` | Live anonymous reference lookup, normalization, validation, repeat lookup, missing/merged references, failure/retry, history links, five sizes and axe scan passed |
| `node tools/browsers.mjs` against `:3000` | Firefox and WebKit each passed 10 responsive route checks plus dialog keyboard/Escape checks; no runtime errors |
| `npm run lint` from `frontend` | Passed, no warnings |
| `npx tsc --noEmit` from `frontend` | Passed |
| `npm test` from `frontend` | 88 tests passed across 13 files |
| `npm run build` from `frontend` | Passed |
| `git diff --check` | Passed |

Chrome checks cover 1280×600, 1366×768, 1440×900, 1920×1080, 390×844 and
768×1024. Desktop pages have no outer-page or horizontal overflow; long lists,
history and detail content use internal panels. Mobile uses natural page scrolling.
The checks also force a dark OS preference and saved dark preference and verify
the root remains light.

Public interactions checked include visible short-desktop trend axes/table access,
keyboard chart readout and scrolling through the full data table, all four dashboard detail views and ward
navigation, issue filters/sorting/pagination, List/Map query preservation, map
selection/close and empty state, mobile navigation, sign-in keyboard access,
report validation, image preparation, keyboard pin placement, draft restoration,
failed submission preservation, idempotent retry, receipt navigation/lookup,
offline photo/payload persistence, outbox retry/removal, authentication entry
layouts, missing reset-token validation and recovery request payload.

Screenshots were inspected for dashboard views, issue list/map, report form
(including an uploaded photo/manual pin), complaint details and mobile reporting.
Evidence is saved under `artifacts/public-audit/`, `artifacts/viewport-layout/`
and `artifacts/complaint-tracking/` (gitignored).

## Limits

Submission, photo hosting and recovery requests use browser fixtures; no real
complaints, account changes, email deliveries or hosted QA images were created.
Offline photo/payload saving uses real isolated IndexedDB; background-worker wake
is simulated for the outbox controls. Actual worker delivery, live Cloudinary,
transactional email, physical devices and manual screen-reader testing are not
certified by this review. The secondary-port API bridge supplies an unavailable
event stream, so live SSE event delivery is also outside this review. Automated
accessibility scans supplement keyboard and
visual checks; map-marker collision coverage remains in the existing equivalent
list checks rather than claiming every spatial marker has a large hit target.

This review concerns general public screens. Citizen and municipal screens remain
for the user's subsequent role-by-role review. Nothing was committed, pushed or
deployed.
