# Final demonstration runbook

Current implementation and fresh verification are in
[the project assessment](PROJECT_ASSESSMENT.md). Read test totals there rather
than reusing historical totals from earlier reports. This runbook describes the
demo to perform; it is not evidence that the newest screens or production deployment have been exercised.

Target length: 6–8 minutes. Seed a disposable database, then restart with only
the `demo` profile. Set `civictrack.demo.staff-password` locally; never record a real
credential.

## Setup

1. Start PostGIS with `docker compose up -d db`.
2. Start the API with `seed`, wait for generation to finish, then stop it.
   Restart with `demo` alone and a local demo password. The `seed` profile
   deliberately disables scheduled writers, including the live escalation.
3. Start the frontend and open the dashboard at 1440×790. Keep a second
   dashboard window visible for the staged escalation around minute 2½.
4. Confirm one open issue is due in about 2 minutes 30 seconds. The demo profile
   stages this automatically after seed generation.

## Storyboard

1. **Public accountability (45 s).** Show the dashboard, department metrics,
   ward drill-down, live breach list, and top clusters. Explain that no login is
   required.
2. **Fast citizen report (60 s).** Register and sign in as a local demo citizen
   before submitting so the same person can verify later. Explain that anonymous
   reporting is also supported, but anonymous reports cannot vote. Submit a
   photo, category, and location. Show the returned ticket, priority, ward, and
   department. Use a second browser profile/device for the nearby observation
   and show it joins the same issue. The same device is deliberately blocked
   from immediately reporting the same category within 50 metres for five minutes.
3. **Why the clustering is trustworthy (60 s).** Open the cluster inspector.
   Point out member pins, accuracy circles, centroid, effective radius,
   per-report decision, and any review flag. Use an existing flagged issue for
   the later moderation segment if this grouping is confident.
4. **Municipal workflow (60 s).** Sign in as the matching department supervisor
   and open **Complaints → Assignments** (`/work?view=assignments`)
   to acknowledge and assign the issue to crew. Sign in as that crew member,
   open **Complaints → My work**, select the ticket in the queue and use the
   adjacent work panel to start work and submit a proof photo and explanatory note. Emphasise that
   staff cannot set RESOLVED; closure after the quiet period is automatic.
5. **Citizen verification (60 s).** Return to the citizen who submitted the
   report, vote fixed, and show the status/history and notification update.
6. **Moderation and privacy (60 s).** Open **Complaints → Needs review**
   (`/work?view=review`) and show the grouping review, split/merge preview,
   ward reassignment, and public-description redaction with its audit entry.
7. **Escalation (45 s).** Inspect the staged issue's recorded escalation and
   current owner. The breach happens around minute 2½, so show its live SSE
   change in the second dashboard window during the earlier steps; do not wait
   until this segment and claim the initial breach is still in the future.
8. **Evidence (45 s).** Show the final evaluation plots: quality, radius sweep,
   extent-cap ablation, concurrency, and latency. Close on the test/build totals.

Optional extended feature pass: reload a half-written report to show draft
recovery, submit once while offline and watch `/report/outbox` deliver it after
reconnection, follow an issue, show its private clarification thread, inspect
sessions at `/me/settings?tab=security`, and show one audited category/SLA edit at
`/admin` (Configuration tab). All roles use password sign-in. Authenticator
setup and recovery-code demonstrations are retired by the 10 November scope decision.

Email notifications and email-based password recovery are deferred to a future
update by user decision on 7 November 2026. Omit provider setup, mail delivery and
password-reset demonstrations from the current demo. Existing implementation and
historical test evidence remain available; in-app notifications and signed-in
password changes stay in scope.

## Recording checklist

- Use only demo data and the local demo password.
- Hide terminal environment variables and browser password managers.
- Keep the network panel closed if it could reveal tokens.
- Capture both the public and authorised role boundaries.
- State that local latency is not a production capacity claim.
- End with the repository README and final report so reproduction paths are visible.


### Administrator closure review

Use **Complaints → Assignments → Ready to close** for already-resolved complaints.
Review the full ticket and verification outcome, enter a closure reason, then
confirm. For unresolved complaints use **All open → Open work actions → Close
before resolution**. The reason and confirmation explain that work and pending
verification end, without recording a verified repair. History identifies the
administrator and reason; reporters/followers receive a closure notification
according to their preferences. Early closure is excluded from resolution/SLA
figures. An empty Ready to close queue means there are no resolved complaints; do not change live complaint states merely to demonstrate it.
The isolated administrator fixture and screenshots are documented in
[ADMIN_VERIFICATION.md](../frontend/ADMIN_VERIFICATION.md).
