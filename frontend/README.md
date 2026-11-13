# NagrikSetu frontend

Next.js 16 App Router, React 19 and Tailwind v4. Read [AGENTS.md](AGENTS.md)
and the installed Next.js documentation before changing frontend code.

[SCREENS.md](SCREENS.md) is the maintained route/functionality map.
The [completion record](../docs/NON_PHONE_CLOSEOUT.md) records current tests,
deployment and remaining verification boundaries; [daily-use verification](../docs/DAILY_USAGE_VERIFICATION.md)
records the real deployed role handoff and closure. Superseded individual screen
reviews are retained in Git history rather than separate working documents.

The [handover runbook](../docs/DEMO-RUNBOOK.md) records local setup, the exact
verified 13 November deployment snapshot, synthetic tickets and maintenance.
This documentation closeout did not rerun the application suites.

## Running

Needs the backend on `:8080` and its CORS origin set to `http://localhost:3000`
— the port matters, because the backend allows exact origins and never `*`.

```bash
npm ci
npm run dev      # http://localhost:3000
```

`.env.local` holds `API_BASE` (read on the server) and `NEXT_PUBLIC_API_BASE`
(read in the browser). Real submissions require matching browser/backend Cloudinary configuration.
See `.env.example`; keep production evidence verification enabled.

For real uploads, start the API with `CLOUDINARY_CLOUD_NAME` set to the same
value as the frontend's `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`. Spring does not read
`frontend/.env.local`; configuring the browser alone causes the API to return
“Photo storage is not configured.” Keep photo evidence verification enabled.

## Commands

| | |
|---|---|
| `npm run test` | 115 unit tests in the 12 November acceptance run over validation, server rules, charts, uploads, auth boundaries and grouped navigation |
| `npm run lint` | includes the rule confining Leaflet to one module |
| `npm run build -- --webpack` | production build mode used in retained verification |
| `npx tsc --noEmit` | TypeScript check |

**Restart `npm run start` after `npm run build`.** A stale server serves old
chunks and the failure presents as an application bug (DD-027 records the
equivalent trap on the Maven side).

## Layout, navigation and behavior

- One light theme, adapted from source commit
  `011ecb5c04192b1823065a2d4c248630c853add8`. `src/app/globals.css` owns tokens,
  statuses and typography; `committed-light.css` retains the source appearance.
  No dark-mode toggle or system-theme detection remains.
- `viewport-layout.css` and `civic-interface.css` own compact desktop panels,
  responsive controls and internal scrolling. At 1280×600 and larger, essential
  content fits in the shell; long content remains accessible inside panels.
  Mobile and short windows scroll naturally. Evidence opens full-size in dialogs.
- `dashboard.css` keeps metrics beside detail views. Staff see a department/ward
  overview; other roles retain the city dashboard. Staff scope comes from
  authenticated claims, not browser-supplied department IDs.
- `/work` shares staff queues and supervisor assignments/review/performance.
  Queue paging/filter state survives ticket navigation. Mobile switches between
  list and selected detail with Back to queue. Work forms retain proof/notes on
  failure; concurrent bulk retries include only still-actionable rows.
- `/admin` groups configuration and audit/export. Administrators can close a
  complaint with a required reason and confirmation. Early closure is disclosed
  and excluded from successful-repair/SLA figures. Specialist moderation and
  split/merge remain contextual tools.
- Public/citizen navigation groups list/map and profile/security. Municipal role
  menus stay focused on their permitted work. Legacy routes redirect to the
  grouped views; underlying API paths, roles and civictrack identifiers remain.
- Password sign-in, password changes and device revocation remain available;
  authenticator support is retired. Sign-out always returns to `/dashboard`.
  Signed-in citizens use My reports; anonymous tracking appears only signed out.
- Authenticated report retries retain the original identity and idempotency key.
  Failed renewal preserves photo/details for in-place sign-in. Offline submissions
  show a saved receipt and move to the outbox after reconnection; delivery clears
  sensitive local payloads only after success. No cold offline app-shell cache or
  closed-browser delivery guarantee is provided.
- Email delivery/password recovery is deferred. Retained recovery screens show
  an unavailable notice. Native installation is excluded; phone and full spoken
  screen-reader checks remain unverified.

## Things that are load-bearing

**`src/lib/status.ts` is the only place a status gets a colour, a shape or a
word.** Nine statuses, eight colour tokens — ACKNOWLEDGED, ASSIGNED and
IN_PROGRESS share one colour deliberately, and the glyph and word are what
separate them. Every status surface must stay legible in greyscale; that is the
test of whether the encoding works, not an accessibility afterthought.

**`src/components/map/MapCanvasInner.tsx` is the only module that may import
Leaflet**, enforced by an ESLint rule rather than a comment. Leaflet touches
`window` at module scope, so importing it anywhere else breaks the server render
of whatever page transitively reaches it — and it keeps the report composer from
downloading a map it never shows.

**`src/lib/transitions.ts` mirrors the server's `TransitionPolicy`.** It decides
what to *render*, never what is permitted. It has been wrong before (DD-035);
`tools/table.mjs` and `tools/uiwalk.mjs` in the repository root check it against
the running server, which is the only thing that can.

**`src/lib/schemas.ts` holds reporting and proof validation rules**, naming the
server rules they mirror. The sign-in dialog currently uses browser/server
validation; its registration schema tests do not establish runtime form coverage.

**Never put a token in `localStorage` or `sessionStorage`.** The access token
lives in React state; the refresh token is in an httpOnly cookie set by the
route handlers under `src/app/api/auth/`.
