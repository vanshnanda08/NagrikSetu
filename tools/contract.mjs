/**
 * Compares every TypeScript interface in src/lib/types.ts against the JSON the
 * running backend actually returns. This is the check that would have caught
 * the staff work view being typed as PublicIssue when the endpoint returns
 * IssueDto -- a mismatch TypeScript cannot see, because the response is `any`
 * until something asserts otherwise.
 */
import fs from 'node:fs';
import { json, login } from './http.mjs';
const src = fs.readFileSync(process.argv[2], 'utf8');

function keysOf(iface) {
  const m = src.match(new RegExp(`export interface ${iface} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) return null;
  // Optional fields (`name?:`) may legitimately be absent from a response.
  const required = new Set(), optional = new Set();
  for (const x of m[1].matchAll(/^\s{2}(\w+)(\?)?:/gm)) (x[2] ? optional : required).add(x[1]);
  return { required, optional, all: new Set([...required, ...optional]) };
}

const sup = await login('head.roads@civictrack.example');
const citizenTok = sup; // any authenticated principal for /me/reports shape

const j = (path, token) => json(path, { token });

const page = await j('/public/issues?limit=1');
const issue = page.items[0];
const staffQueue = await j('/staff/queue?limit=1', sup);
const board = await j('/supervisor/queue?tab=all&limit=1', sup);
const review = await j('/supervisor/review', sup);
const metrics = await j('/dashboard/metrics');

const checks = [
  ['PublicIssuePage', page],
  ['PublicIssue',     issue],
  ['PublicIssue (by-ref)', await j(`/public/issues/by-ref/${issue.publicRef}`), 'PublicIssue'],
  ['PublicReport',    (await j(`/public/issues/${issue.id}/reports`))[0]],
  ['BboxResult',      await j('/public/issues/bbox?south=30.8&west=75.7&north=31.0&east=76.0&limit=1')],
  ['Category',        (await j('/categories'))[0]],
  ['Ward',            (await j('/wards'))[0]],
  ['DashboardSummary',await j('/dashboard/summary')],
  ['MyReportsPage',   await j('/me/reports?limit=1', citizenTok)],
  ['QueueRow',        staffQueue[0]],
  ['StaffIssue',      await j(`/issues/${staffQueue[0]?.id ?? issue.id}`, sup)],
  ['NotificationPage', await j('/me/notifications', sup)],
  ['VerificationView', await j(`/me/verifications/${issue.id}`, sup)],
  ['DepartmentAccountability', (await j('/dashboard/departments'))[0]],
  ['DashboardMetrics', metrics],
  ['ReviewPage', review],
  ...(review.items.length ? [['ReviewItem', review.items[0]]] : []),
  ['BoardRow', board[0]],
  ['Median', metrics.resolutionTime?.overall],
  ['AgeBucket', metrics.backlogAge?.[0]],
  ['DayCount', metrics.reportedVsResolved?.[0]],
  ['ComplianceDay', metrics.slaCompliance?.trend[0]],
  ['TopCluster', metrics.topClusters?.[0]],
  ...((await j('/dashboard/breaching')).map(value => ['BreachingIssue', value])),
];

let problems = 0;
for (const [label, value, ifaceName] of checks) {
  const iface = ifaceName ?? label;
  const declared = keysOf(iface);
  if (!declared) { problems++; console.log(`  FAIL  ${label}: no interface named ${iface}`); continue; }
  if (value == null) { problems++; console.log(`  FAIL  ${label}: seed fixture missing`); continue; }
  const actual = new Set(Object.keys(value));
  const missing = [...declared.required].filter(k => !actual.has(k));
  const extra   = [...actual].filter(k => !declared.all.has(k));
  if (missing.length || extra.length) {
    problems++;
    console.log(`  MISMATCH  ${label}`);
    if (missing.length) console.log(`      client expects but server omits: ${missing.join(', ')}`);
    if (extra.length)   console.log(`      server sends but client omits:  ${extra.join(', ')}`);
  } else {
    console.log(`  ok        ${label}  (${declared.all.size} fields)`);
  }
}

// The history entry and the nested issue on a my-report row.
const hist = (await j(`/public/issues/${issue.id}/history`))[0];
if (hist) {
  const d = keysOf('PublicHistoryEntry'), a = new Set(Object.keys(hist));
  const miss = [...d.required].filter(k=>!a.has(k)), ex = [...a].filter(k=>!d.all.has(k));
  if (miss.length||ex.length){problems++;console.log(`  MISMATCH  PublicHistoryEntry\n      missing: ${miss}\n      extra: ${ex}`);}
  else console.log(`  ok        PublicHistoryEntry  (${d.all.size} fields)`);
}
console.log(problems ? `\n${problems} mismatch(es)` : '\nno mismatches');
process.exitCode = problems ? 1 : 0;
