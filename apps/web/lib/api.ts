import { env } from "@/env";

/** The API's single error shape, surfaced as a typed exception with a human message (SPEC 14.2). */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}, readonly retryAfterSeconds?: number) { super(message); this.name = "ApiError"; }
}

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "That email and password don't match. Check them, or sign in with an email code instead.",
  OTP_INVALID: "That code is wrong or has expired. Check the latest email, or request a new code.",
  OTP_RATE_LIMITED: "We just sent you a code. Please wait a minute before asking for another.",
  RATE_LIMITED: "Too many attempts. Please wait a minute and try again.",
  AUTHENTICATION_REQUIRED: "Please sign in to continue.",
  VALIDATION_ERROR: "Some details look wrong. Check the highlighted fields."
};
/** Server-authored messages are already human for these codes (for example password rules). */
const passThrough = new Set(["INVALID_PASSWORD", "SLUG_TAKEN", "PROFILE_EXISTS", "WINDOW_OVERLAP", "SERVICE_IN_USE", "BOOKING_CONFLICT", "PUBLISH_CHECKLIST_INCOMPLETE", "NOT_FOUND"]);

/** Field messages from a Zod validation error (the API sends `flatten()` output as details). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_ERROR") return {};
  const details = error.details as { fieldErrors?: Record<string, string[] | undefined> };
  return Object.fromEntries(Object.entries(details.fieldErrors ?? {}).flatMap(([field, list]) => list?.length ? [[field, list[0]]] : []));
}
export function humanMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "VALIDATION_ERROR") { const first = Object.values(fieldErrors(error))[0] ?? (error.details as { formErrors?: string[] }).formErrors?.[0]; if (first) return first; }
    return passThrough.has(error.code) ? error.message : messages[error.code] ?? "Something went wrong on our side. Please try again.";
  }
  return "We couldn't reach Bayana. Check your connection and try again.";
}

/** Plain-language version of each publish requirement key from the API. */
export const requirementCopy: Record<string, string> = {
  slug: "Choose your page address", business_name: "Add your business name", description: "Add a short description of what you do",
  active_service: "Add at least one active service", valid_advance_rules: "Fix a service whose advance is not valid", availability: "Set the hours you take bookings",
  policies: "Write your booking terms, cancellation and rescheduling policies"
};

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, { method: init.method ?? (init.body ? "POST" : "GET"), credentials: "include", headers: init.body ? { "Content-Type": "application/json" } : undefined, body: init.body ? JSON.stringify(init.body) : undefined });
  } catch (cause) { throw new ApiError(0, "NETWORK_ERROR", "Network error", { cause: String(cause) }); }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null;
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after")) || undefined;
    throw new ApiError(response.status, payload?.error?.code ?? "UNKNOWN", payload?.error?.message ?? response.statusText, payload?.error?.details ?? {}, retryAfter);
  }
  return payload as T;
}

/** Only same-site relative paths are followed after sign-in, never `//evil.example`. */
export const safeNext = (value: string | null, fallback = "/dashboard") => value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
