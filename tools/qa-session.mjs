// Demo audits share the application's normal login limit; respect Retry-After.
export async function qaSignIn(context, app, email, password, label = 'demo account') {
  const deadline = Date.now() + 20 * 60_000;
  while (true) {
    const response = await context.request.post(app + '/api/auth/login', {data:{email,password}});
    if (response.status() === 200) return response.json();
    if (response.status() !== 429) throw new Error(`${label}: sign-in returned HTTP ${response.status()}`);
    const seconds = Math.max(1, Number(response.headers()['retry-after']) || 60) + 1;
    if (Date.now() + seconds * 1000 > deadline) throw new Error(`${label}: demo sign-in remains rate limited`);
    console.log(`Waiting ${seconds}s for the existing ${label} sign-in limit`);
    let remaining = seconds * 1000;
    while (remaining > 0) {const interval=Math.min(remaining,60_000);await new Promise(resolve=>setTimeout(resolve,interval));remaining-=interval;}
  }
}

/** Browser navigation may cancel an intercepted read while its local bridge settles. */
export function isNavigationCancellation(error) {
  return /has been closed|ERR_ABORTED|request (?:was )?(?:cancelled|canceled|aborted)|response (?:has been )?disposed|invalid interception|already handled/i.test(String(error).split('\n')[0]);
}
