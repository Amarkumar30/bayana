// No Next.js imports here, so `node --test` can load this file directly (lib/session-forward.test.mjs).

/** The API's session cookie (apps/api/src/auth.ts sessionCookieName). */
export const SESSION_COOKIE = "bayana_session";
/** The shape of Next's cookie store that we read: `await cookies()` satisfies it. */
export type CookieReader = { get(name: string): { value: string } | undefined };

// Session tokens are 32 random bytes in base64url (43 characters). Anything else is not forwarded, so a crafted cookie
// value cannot smuggle extra cookies (";") or headers (CR/LF) into the API request.
const tokenShape = /^[A-Za-z0-9_-]{43}$/;

/** The Cookie header for a server-side API call: only the session cookie, never the visitor's other cookies. */
export function sessionCookieHeader(jar: CookieReader): string | undefined {
  const value = jar.get(SESSION_COOKIE)?.value;
  return value && tokenShape.test(value) ? `${SESSION_COOKIE}=${value}` : undefined;
}

/** Calls the API from the web server as the visitor. Never cached: the response belongs to one person. */
export function fetchWithSession(apiUrl: string, path: string, jar: CookieReader, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const cookie = sessionCookieHeader(jar);
  const headers: Record<string, string> = { Accept: "application/json", ...(init.body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) };
  return fetch(`${apiUrl}${path}`, { method: init.method ?? (init.body === undefined ? "GET" : "POST"), headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), cache: "no-store" });
}
