# Local correctness, real-photo and desktop checks

Verified 7–8 November 2026 (Asia/Kolkata). These are local working-tree results,
not a deployment or production-readiness certificate. All existing uncommitted
work was retained. Email notifications and email-based password recovery remain
deferred. The final role-by-role browser journey was deliberately left until
last at this stage. It subsequently completed in the
[end-to-end audit](../docs/END_TO_END_TEST_REPORT.md); its confirmed defects are
addressed in [audit follow-up fixes](../docs/AUDIT_FIXES.md). Historical results
below retain their original date and limits.

## Requested items and outcome

| Item | Outcome |
|---|---|
| 1. Message validation and verification wording | Implemented and tested |
| 2. Real upload and backend evidence verification | Passed with a synthetic Cloudinary image and a separate PostGIS database |
| 3. Desktop accessibility, location fallback, offline delivery and installation | Desktop checks completed as detailed below; Chrome offered installation but native installation did not complete. Physical-phone checks unavailable |
| 4. Full public → citizen → municipal browser journey | Subsequently completed in the end-to-end audit; remaining test boundaries are listed there |

## Correctness changes

- Private clarification messages containing fewer than three characters after
  surrounding whitespace/BOM removal now return HTTP 400 instead of a generic
  500. Internal spacing, authorization and the existing 2,000-character limit
  remain. Regression cases include tabs, nonbreaking spaces and Unicode spaces.
- Verification notifications use the settlement note recorded in issue history.
  Quorum confirmation, partial-vote timeout and zero-response timeout have
  distinct wording. A timeout is not described as citizen confirmation or as
  closure. Voting thresholds, state transitions and quiet-period closure rules
  are unchanged.
- The report photo input no longer creates an invisible keyboard stop. Its
  visible, labelled 44px photo button still opens the file control.
- The report-photo strip has a labelled group role. Full-size evidence dialogs
  are centered and retain their viewport bounds, Escape behavior and focus return.
- The outbox shows a loading state until browser storage has been read, instead
  of briefly claiming there are no queued reports. Delivery updates are announced.
- Installation eligibility is captured by the shared provider on every route,
  before the Security panel opens. PNG icons now declare both general and
  maskable uses in separate manifest entries supported by Next's types. The
  install control handles failures, prevents repeated clicks while opening, and
  recognizes standalone display mode. No permission, browser profile or system
  security setting was changed to force installation.

## Real photo integration

A temporary copy of the current frontend ran on `127.0.0.1:3003`, connected to
an isolated Spring API on `:8081` and a dedicated `civictrack_quality_*` database.
Mail and Cloudinary deletion were disabled; server photo verification remained
enabled. Temporary QA routes prepared synthetic input and exposed audit results
through visible controls; none were added to the product source.

The real compressor and uploader sent an 800×450 synthetic JPEG to Cloudinary.
The API fetched the uploaded image, calculated its evidence hash, persisted the
report, and returned `CT-2026-000001` in the isolated database. Its public detail
page and full-size photo both loaded the actual image.

| Check | Observed result |
|---|---|
| Actual upload → strict API verification → receipt | Passed |
| Supplied false hash | Server ignored it and stored the calculated hash |
| Photo on a foreign host | HTTP 422; no report created |
| Missing photo on the configured Cloudinary host | HTTP 422; no report created |
| Photo detail/dialog | Actual 800×450 image loaded; focus landed on Close photo |

Evidence: `artifacts/quality-checks/real-photo-checks.json` and
`real-upload-receipt.jpg`. The tiny synthetic Cloudinary asset is retained for
inspection; management credentials were not available for cleanup. Automatic
media deletion remains disabled.

## Offline delivery and location

With the isolated API confirmed stopped, submission entered the real IndexedDB
outbox. The pending record survived page reload. After restoring the API,
**Retry now** delivered it through the real service worker and same-origin
route handler. Its submission key committed once and the outbox showed **Sent**
with `CT-2026-000002`. Both queued test jobs ultimately sent once and cleared
their local image blobs and request bodies.

An earlier attempt raced graceful API shutdown and completed online. A subsequent
same-device/category test received HTTP 429 from the existing nearby-duplicate
guard, remained queued, then delivered after the cooldown. These were recorded
separately from the successful outage/recovery case; no abuse guard was bypassed.

The desktop browser denied location access. The form displayed the explanation
and manual-map fallback. Arrow-key movement followed by Enter placed the pin and
updated the coordinate status. No real device location was submitted.

Evidence: `offline-verification.json`, `offline-delivery-records.json`,
`offline-pending.jpg` and `offline-sent.jpg` in the same artifact directory.
This tested API unavailability and recovery, not operating-system airplane mode
or unattended closed-browser sync. The worker sends queued reports; it does not
cache the entire application for a cold offline launch.

## Accessibility and layout

- Actual keyboard traversal now skips the hidden photo input. Visible photo and
  category controls are 44px high. Keyboard map placement worked.
- The user confirmed that VoiceOver announces report-control names. VoiceOver
  was observed Off afterward, matching its initial setting. This is a basic
  user-assisted announcement check, not full screen-reader certification.
- Three fresh axe-core 4.13.0 scans (report form, issue detail and photo dialog)
  reported **zero violations**. They retained manual color-contrast review items
  because decorative pseudo-elements prevent automated background detection.
  The invalid photo-strip label finding disappeared after its group role fix.
- Source-token contrast samples and screenshots were reviewed: secondary text on
  the blue gradient stop is 4.83:1; white primary-action text is 11.66:1; sampled
  error/pending/resolved text pairs exceed 4.5:1. The large bold orange brand text
  sample is 3.15:1. These samples do not certify every composited pixel.
- Report and issue-detail views were visually checked at **1280×600,
  1366×768, 1440×900, 1920×1080, 390×844 and 768×1024**. The eight desktop
  checks had document dimensions equal to the viewport, with no outer-page
  scrolling. Report submission and complaint headings stayed visible. Mobile
  and tablet used natural vertical scrolling and had no horizontal overflow.
- The evidence panel scrolled independently by keyboard. The centered photo
  dialog measured 1000×534 at 1280×600 and 352×305 at 390×844. Escape closed it
  and returned focus to the originating photo button.

Evidence includes `layout-checks.json`, `keyboard-before.json`,
`keyboard-after.json`, `axe-*-after.json`, `contrast-samples.json`, and the
desktop/mobile screenshots under `artifacts/quality-checks/`.

## Installation result and device limits

Chrome initially exposed no installation option. After the provider/icon fixes,
the browser emitted a real install offer and the app displayed **Install app**.
The native prompt appeared. The user reported that pressing Install did not
complete installation; no successful standalone launch was established. The
user closed the installation window to resume testing. Native installation
therefore remains **unverified**, rather than passed or silently removed.

Only a desktop/laptop was available. Physical rear-camera capture, phone GPS,
mobile OS installation and background execution were not tested. Browser-driven
file attachment was restricted by the connected browser, so the real upload used
an explicit synthetic-image preparation control in the isolated test app.

The listener follows the browser's install eligibility event; the browser still
decides when to offer installation. See the official
[Chrome install criteria](https://web.dev/articles/install-criteria).

## Code checks actually run

| Check | Result |
|---|---|
| Focused backend regressions (engagement, verification, profile, closure) | 51 passed |
| Full backend `mvn test`, exact source in a clean temporary build directory | 334 total: **332 passed, 2 opt-in evaluations skipped**, no failures/errors |
| Frontend `npm test` | **115 passed across 16 files** |
| Frontend `npm run lint` | Passed |
| Frontend `npx tsc --noEmit` | Passed |
| Frontend `npm run build` | Passed |

The temporary backend build avoids IDE-generated class interference in the
shared target directory. The normal local API was restarted with the updated
source, its existing demo profile, matching photo-cloud configuration and mail
disabled; health returned UP. Temporary test services were stopped and their
dedicated database removed after the artifacts were saved. The ordinary
`http://localhost:3000` app remains running. No commit, push or deployment was made.

Remaining: native installation follow-up, physical-device checks if a device
becomes available, and the blocked/untested browser cases in the later
end-to-end report. The principal role journey is complete. Email remains
future work and the Cloudinary deletion dry run remains a separate operator gate.
