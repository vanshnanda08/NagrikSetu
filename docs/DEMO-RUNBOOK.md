# Final demonstration runbook

Current implementation and exact test totals are in [PROGRESS.md](PROGRESS.md).
Use 273 backend tests passed plus 2 intentional skips (275 total), and 82
frontend tests passed. This runbook describes the demo to perform; it is not
evidence that the newest screens or production deployment have been exercised.

Target length: 6–8 minutes. Seed a disposable database, then restart with only
the `demo` profile. Set `civictrack.demo.staff-password` locally; never record a real
credential.

## Setup

1. Start PostGIS with `docker compose up -d db`.
2. Start the API with `seed`, wait for generation to finish, then stop it.
   Restart with `demo` alone and a local demo password. The `seed` profile
   deliberately disables scheduled writers, including the live escalation.
3. Start the frontend and open the dashboard at 1440×790.
4. Confirm one open issue is due in about 2 minutes 30 seconds. The demo profile
   stages this automatically after seed generation.

## Storyboard

1. **Public accountability (45 s).** Show the dashboard, department metrics,
   ward drill-down, live breach list, and top clusters. Explain that no login is
   required.
2. **Fast citizen report (60 s).** Submit a photo, category, and location. Show
   the returned ticket, priority, ward, and department. Submit a second nearby
   observation and show that it joins the same issue.
3. **Why the clustering is trustworthy (60 s).** Open the cluster inspector.
   Point out member pins, accuracy circles, centroid, effective radius,
   per-report decision, and the supervisor review reason.
4. **Staff workflow (60 s).** Sign in as staff, acknowledge, assign, start work,
   and submit a proof photo. Emphasise that staff cannot set RESOLVED.
5. **Citizen verification (60 s).** Sign in as an eligible citizen, vote fixed,
   and show the status/history and notification update.
6. **Moderation and privacy (60 s).** Show the review queue, split/merge preview,
   ward reassignment, and public-description redaction with its audit entry.
7. **Live escalation (45 s).** Return to the dashboard and allow the staged
   issue to breach. Show the SSE refresh, escalation level, and audit/system
   view without reloading the page.
8. **Evidence (45 s).** Show the final evaluation plots: quality, radius sweep,
   extent-cap ablation, concurrency, and latency. Close on the test/build totals.

Optional extended feature pass: reload a half-written report to show draft
recovery, submit once while offline and watch `/report/outbox` deliver it after
reconnection, request a password reset into local Mailpit, opt into email from
the profile, follow an issue, show its private clarification thread, inspect
sessions at `/me/security`, and show one audited category/SLA edit at
`/admin/configuration`. The demo profile bypasses mandatory municipal MFA so
seeded scripted logins remain usable; demonstrate MFA under the normal profile.

## Recording checklist

- Use only demo data and the local demo password.
- Hide terminal environment variables and browser password managers.
- Keep the network panel closed if it could reveal tokens.
- Capture both the public and authorised role boundaries.
- State that local latency is not a production capacity claim.
- End with the repository README and final report so reproduction paths are visible.
