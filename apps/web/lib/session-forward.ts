// No Next.js imports here, so `node --test` can load this file directly (lib/session-forward.test.mjs).

/** The shape of Next's cookie store that we read: `await cookies()` satisfies it. */
export type CookieReader = { get(name: string): { value: string } | undefined };

// Session tokens are 32 random bytes in base64url (43 characters). Anything else is not forwarded, so a crafted cookie
// value cannot smuggle extra cookies (";") or headers (CR/LF) into the API request.
const tokenShape = /^[A-Za-z0-9_-]{43}$/;

/**
 * The Cookie header for a server-side API call: only the session cookie named `cookieName` (SESSION_COOKIE_NAME, the same
 * name the API uses in this environment), never the visitor's other cookies or another environment's session cookie.
 */
export function sessionCookieHeader(jar: CookieReader, cookieName: string): string | undefined {
  const value = jar.get(cookieName)?.value;
  return value && tokenShape.test(value) ? `${cookieName}=${value}` : undefined;
}

/** Calls the API from the web server as the visitor. Never cached: the response belongs to one person. */
export function fetchWithSession(apiUrl: string, path: string, jar: CookieReader, cookieName: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const cookie = sessionCookieHeader(jar, cookieName);
  const headers: Record<string, string> = { Accept: "application/json", ...(init.body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) };
  return fetch(`${apiUrl}${path}`, { method: init.method ?? (init.body === undefined ? "GET" : "POST"), headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), cache: "no-store" });
}
