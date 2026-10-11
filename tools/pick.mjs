/**
 * Finds an issue the harnesses can walk through the state machine.
 *
 * WHY THIS EXISTS. `table.mjs` and `uiwalk.mjs` both need an issue in NEW that
 * the ROADS supervisor and crew can act on, and both MUTATE it -- walking it to
 * PENDING_VERIFICATION and leaving it there. They each used to do
 *
 *     GET /public/issues?status=NEW&category=POTHOLE&limit=5
 *     const id = list.items[0].id;
 *
 * which worked while the corpus held 800 issues and stopped working the moment
 * it held 110: a few runs consume every NEW POTHOLE there is, and then
 * `items[0]` is undefined and the harness dies with
 * `Cannot read properties of undefined (reading 'id')` -- a stack trace that
 * says nothing about the actual problem.
 *
 * So: any category in the department, not just POTHOLE, and if the pool really
 * is empty, make one rather than fail. A verification harness that stops
 * working once it has been run a few times is not a verification harness.
 */

const DEPARTMENT = "Roads and Infrastructure";

/**
 * Posts a report at an existing CLOSED issue's coordinates.
 *
 * The location is borrowed deliberately: it is known to be inside a ward, which
 * the ingest endpoint requires, and a CLOSED issue is not a merge candidate --
 * the candidate query excludes CLOSED, REJECTED, and RESOLVED older than the
 * reopen window -- but another active issue may still match. The result is checked before
 * it is used as a NEW fixture.
 */
async function createOne(API) {
  const closed = await (await fetch(`${API}/public/issues?status=CLOSED&limit=100`)).json();
  const donors = (closed.items ?? []).filter((i) => i.departmentName === DEPARTMENT);
  // A closed ticket is excluded from matching, but another active ticket at
  // its location is not. Check the ingest result before claiming it is NEW.
  for (const donor of donors) {
    const res = await fetch(`${API}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryCode: donor.categoryCode,
        lat: donor.lat,
        lng: donor.lng,
        accuracyM: 8,
        manualPin: false,
        description: "Created by a verification harness because the NEW pool was empty.",
        landmark: "harness",
        photoUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        deviceId: "harness-" + Date.now(),
      }),
    });
    if (!res.ok) {
      throw new Error(`Could not create an issue to walk: ${res.status} ${await res.text()}`);
    }
    const out = await res.json();
    const issue = await (await fetch(`${API}/public/issues/${out.issueId}`)).json();
    if (issue.status === 'NEW' && issue.departmentName === DEPARTMENT) {
      console.log(`  (no NEW issue was left in ${DEPARTMENT}; created ${out.publicRef})`);
      return out.issueId;
    }
  }
  throw new Error('No fresh Roads issue could be created at the CLOSED fixture locations. Run this harness against a freshly seeded local scratch database.');
}

/** An issue id in NEW that the ROADS staff may act on. Creates one if needed. */
export async function pickWalkableIssue(API) {
  const list = await (await fetch(`${API}/public/issues?status=NEW&limit=100`)).json();
  const mine = (list.items ?? []).filter((i) => i.departmentName === DEPARTMENT);
  if (mine.length > 0) return mine[0].id;
  return createOne(API);
}
