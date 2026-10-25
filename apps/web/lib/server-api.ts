import { cookies } from "next/headers";
import { env } from "@/env";
import { ApiError } from "./api";
import { fetchWithSession } from "./session-forward";

/**
 * For Server Components, Server Actions and Route Handlers: calls the API as the signed-in visitor by forwarding the
 * session cookie (SPEC 16.7 check 3). The browser client in ./api sends cookies itself and must not be used on the server.
 * Works locally (cookies ignore ports, so localhost:3000 sees the localhost:4000 cookie) and in staging/production,
 * where the API sets the cookie with Domain=.bayana.in so the web host receives it too.
 */
export async function serverApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try { response = await fetchWithSession(env.NEXT_PUBLIC_API_URL, path, await cookies(), init); }
  catch (cause) { throw new ApiError(0, "NETWORK_ERROR", "Network error", { cause: String(cause) }); }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null;
  if (!response.ok) throw new ApiError(response.status, payload?.error?.code ?? "UNKNOWN", payload?.error?.message ?? response.statusText, payload?.error?.details ?? {});
  return payload as T;
}
