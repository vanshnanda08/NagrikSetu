/** Local demo checks must never silently accept an error response as fixture data. */
export const API = 'http://localhost:8080/api/v1';
export const APP = 'http://localhost:3000';

export async function json(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token.accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

export const login = (email) => json('/auth/login', {
  method: 'POST', body: { email, password: 'demo1234' },
});
