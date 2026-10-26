# NagrikSetu frontend

Next.js 16 (App Router), React 19, Tailwind v4.

**Status (2026-10-26).** The agreed frontend scope is implemented, including
public reporting, citizen verification, supervisor tools, administration,
profile and account recovery, email preferences, persistent drafts and offline
submission. The latest additions are authenticator MFA and session controls at
`/me/security`, issue following, private clarification threads, an installable
web-app manifest and browser security headers. The NagrikSetu theme supports
light/dark modes and responsive layouts.

Latest checks: 82 tests passed, ESLint and TypeScript passed, and
`npm run build -- --webpack` succeeded with 31 generated static pages.
The expanded five-role browser route sweep passed 190 checks. Security and
extended-feature journeys were exercised against a scratch API and local mail.
See [current progress](../docs/PROGRESS.md) and [audit limitations](../FINAL_AUDIT.md).

## Running

Needs the backend on `:8080` and its CORS origin set to `http://localhost:3000`
— the port matters, because the backend allows exact origins and never `*`.

```bash
npm install
npm run dev      # http://localhost:3000
```

`.env.local` holds `API_BASE` (read on the server) and `NEXT_PUBLIC_API_BASE`
(read in the browser). Cloudinary is optional: with no credentials the composer
sends a placeholder URL and everything else works. See `.env.example`.

## Commands

| | |
|---|---|
| `npm run test` | 82 unit tests over validation, server rules, charts, uploads and auth boundary helpers |
| `npm run lint` | includes the rule confining Leaflet to one module |
| `npm run build` | production build |

**Restart `npm run start` after `npm run build`.** A stale server serves old
chunks and the failure presents as an application bug (DD-027 records the
equivalent trap on the Maven side).

## Layout and theme

- **`src/app/liquid-glass.css`** holds the whole glass theme and the layout rules
  that make every page fit the window. The palette comes from the logo: navy
  (`--accent-solid`), orange for the wordmark and the live badge only, and sky
  blue. Status colours are untouched; colour still encodes status and nothing
  else.
- **Fit to screen.** At 1280 x 600 or larger the app is exactly the window tall.
  The page card fills what is left; lists, timelines and the dashboard detail
  panel scroll inside themselves, and anything unexpected makes the card scroll,
  so content is never clipped. Below that size, and on phones, the normal
  flowing layout applies. The rules key off class names (`report-form`,
  `detail-grid`, `data-map-canvas`), never child positions, so adding an element
  to a page cannot silently move something else.
- **`/` redirects to `/dashboard`.** There is no landing page.
- **`BrandMark.tsx`** is the logo; its colours switch to the reversed version in
  dark mode through `--logo-*` tokens. `src/app/icon.svg` is the favicon.
- The internal name `civictrack` is kept in cookie names, storage keys and API
  config because the backend shares them.

Checked on 2026-10-11: all pages at four window sizes in both themes, keyboard
focus, the sign-in dialog, form validation, photo upload, filters and paging, and
an axe scan with no findings on the pages covered. Known and existing: map marker
touch targets are under 24px, and controls are 40px high (not 48px) on windows of
1280px or wider.

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

**`src/lib/schemas.ts` holds every validation rule**, each naming the server rule
it mirrors. Nothing validates inline in a submit handler.

**Never put a token in `localStorage` or `sessionStorage`.** The access token
lives in React state; the refresh token is in an httpOnly cookie set by the
route handlers under `src/app/api/auth/`.
