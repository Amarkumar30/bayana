import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createLocalJWKSet, createRemoteJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { GOOGLE_INTENTS, googleNextPath, type GoogleIntent } from "@bayana/shared";
import { config } from "../config.js";
import { googleCookieName } from "../config-schema.js";

// Google sign-in (OpenID Connect, authorization code flow with PKCE). Everything that talks to Google sits behind
// GoogleProvider so tests use FakeGoogleProvider with no network; the ID token checks below run the same for both.

export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
export interface GoogleProvider {
  readonly clientId: string;
  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): string;
  /** Exchanges the one-time code (with the PKCE verifier) for an ID token at Google's token endpoint. */
  exchangeCode(input: { code: string; codeVerifier: string }): Promise<{ idToken: string }>;
  /** Google's signing keys (JWKS). */
  keys(): JWTVerifyGetKey;
}

export class GoogleOidcProvider implements GoogleProvider {
  private readonly jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  constructor(readonly clientId: string, private readonly clientSecret: string, private readonly redirectUri: string) {}
  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    for (const [key, value] of Object.entries({ client_id: this.clientId, redirect_uri: this.redirectUri, response_type: "code", scope: "openid email profile", state: input.state, nonce: input.nonce, code_challenge: input.codeChallenge, code_challenge_method: "S256", prompt: "select_account" })) url.searchParams.set(key, value);
    return url.toString();
  }
  async exchangeCode(input: { code: string; codeVerifier: string }) {
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, code: input.code, code_verifier: input.codeVerifier, grant_type: "authorization_code", redirect_uri: this.redirectUri }) });
    const body = await response.json().catch(() => ({})) as { id_token?: unknown; error?: unknown };
    // Google's error body names the problem (for example invalid_grant) and holds no secret; the response itself is never logged.
    if (!response.ok || typeof body.id_token !== "string") throw new GoogleSignInError("exchange_failed", `token endpoint ${response.status}${typeof body.error === "string" ? ` ${body.error}` : ""}`);
    return { idToken: body.id_token };
  }
  keys() { return this.jwks; }
}

/** In-memory Google for tests: signs real RS256 ID tokens with a local key, so verification is exercised for real. */
export class FakeGoogleProvider implements GoogleProvider {
  private readonly codes = new Map<string, Record<string, unknown>>();
  private keySet: JWTVerifyGetKey | null = null; private privateKey: CryptoKey | null = null;
  readonly calls: string[] = [];
  constructor(readonly clientId = "test-client.apps.googleusercontent.com") {}
  async init() {
    const pair = await generateKeyPair("RS256", { extractable: true });
    this.privateKey = pair.privateKey;
    this.keySet = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "fake-1", alg: "RS256", use: "sig" }] });
    return this;
  }
  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }) {
    const url = new URL("https://accounts.google.test/o/oauth2/v2/auth");
    for (const [key, value] of Object.entries({ client_id: this.clientId, state: input.state, nonce: input.nonce, code_challenge: input.codeChallenge, scope: "openid email profile" })) url.searchParams.set(key, value);
    return url.toString();
  }
  /** What the user's Google sign-in would produce: a code that exchanges for an ID token with these claims. */
  issueCode(claims: { sub: string; email: string; nonce: string; email_verified?: boolean; aud?: string; iss?: string; expiresInSeconds?: number; codeChallenge?: string }) {
    const code = `fake-code-${randomBytes(8).toString("hex")}`;
    this.codes.set(code, claims);
    return code;
  }
  async exchangeCode(input: { code: string; codeVerifier: string }) {
    this.calls.push("exchangeCode");
    const claims = this.codes.get(input.code);
    this.codes.delete(input.code);
    if (!claims || !this.privateKey) throw new GoogleSignInError("exchange_failed", "unknown code");
    if (typeof claims.codeChallenge === "string" && claims.codeChallenge !== pkceChallenge(input.codeVerifier)) throw new GoogleSignInError("exchange_failed", "PKCE verifier does not match");
    const now = Math.floor(Date.now() / 1000), lifetime = typeof claims.expiresInSeconds === "number" ? claims.expiresInSeconds : 3600;
    const idToken = await new SignJWT({ email: claims.email, email_verified: claims.email_verified ?? true, nonce: claims.nonce, name: "Test Person" })
      .setProtectedHeader({ alg: "RS256", kid: "fake-1" }).setSubject(String(claims.sub)).setIssuer(String(claims.iss ?? GOOGLE_ISSUERS[0])).setAudience(String(claims.aud ?? this.clientId))
      .setIssuedAt(now - 60).setExpirationTime(now + lifetime).sign(this.privateKey);
    return { idToken };
  }
  keys() { if (!this.keySet) throw new Error("FakeGoogleProvider.init() first"); return this.keySet; }
}

export class GoogleSignInError extends Error {
  constructor(readonly reason: "exchange_failed" | "invalid_token" | "email_unverified", detail: string) { super(detail); this.name = "GoogleSignInError"; }
}

export type GoogleIdentity = { sub: string; email: string };
/**
 * Verifies the ID token: RS256 signature against the provider's keys, issuer, audience (our client id), expiry, and the
 * nonce from this sign-in. Requires email_verified === true. Name and picture are ignored.
 */
export async function verifyIdToken(provider: GoogleProvider, idToken: string, nonce: string): Promise<GoogleIdentity> {
  let payload: Record<string, unknown>;
  try { payload = (await jwtVerify(idToken, provider.keys(), { issuer: GOOGLE_ISSUERS, audience: provider.clientId, algorithms: ["RS256"], clockTolerance: 30 })).payload; }
  catch (error) { throw new GoogleSignInError("invalid_token", error instanceof Error ? error.name : "verification failed"); }
  const supplied = Buffer.from(String(payload.nonce ?? "")), expected = Buffer.from(nonce);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new GoogleSignInError("invalid_token", "nonce mismatch");
  if (typeof payload.sub !== "string" || !payload.sub || typeof payload.email !== "string") throw new GoogleSignInError("invalid_token", "missing sub or email");
  if (payload.email_verified !== true) throw new GoogleSignInError("email_unverified", "email not verified by Google");
  return { sub: payload.sub, email: payload.email.trim().toLowerCase() };
}

// ---- Runtime selection ------------------------------------------------------------------------------------------------
let override: { provider: GoogleProvider | null } | null = null;
let real: GoogleOidcProvider | null = null;
/** The configured provider, or null when Google sign-in is off (no GOOGLE_CLIENT_ID). */
export function googleProvider(): GoogleProvider | null {
  if (override) return override.provider;
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI) return null;
  real ??= new GoogleOidcProvider(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);
  return real;
}
/** Tests only: a fake provider, null for "off", or undefined to go back to the configuration. */
export function useTestGoogle(provider: GoogleProvider | null | undefined) { override = provider === undefined ? null : { provider }; }

// ---- PKCE, state and the one-time cookie ---------------------------------------------------------------------------------
export const randomToken = () => randomBytes(32).toString("base64url");
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
export const stateHash = (state: string) => createHash("sha256").update(`google-state:${state}`).digest("hex");
export const GOOGLE_COOKIE = googleCookieName(config.SESSION_COOKIE_NAME), GOOGLE_COOKIE_MINUTES = 10;
/** intent: set by /start and signed with the rest; the callback reads it only from here, never from its query string. */
export type GoogleCookie = { state: string; nonce: string; verifier: string; next: string; linkUserId: string | null; intent: GoogleIntent; expires: number };
const sign = (payload: string) => createHmac("sha256", config.SESSION_SECRET).update(`google-cookie:${payload}`).digest("base64url");
/** The cookie is signed, not encrypted: it is httpOnly and lives 10 minutes, and its contents only work together with Google's code. */
export const encodeGoogleCookie = (value: GoogleCookie) => { const payload = Buffer.from(JSON.stringify(value)).toString("base64url"); return `${payload}.${sign(payload)}`; };
export function decodeGoogleCookie(raw: string | undefined, now = Date.now()): GoogleCookie | null {
  const [payload, signature] = (raw ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload)), supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as Omit<GoogleCookie, "intent"> & { intent?: unknown };
    // A cookie written before intents existed (at most 10 minutes old) is a vendor sign-in, as it always was.
    const intent = value.intent === undefined ? "vendor" : (GOOGLE_INTENTS as readonly unknown[]).includes(value.intent) ? value.intent as GoogleIntent : null;
    return intent && typeof value.state === "string" && typeof value.nonce === "string" && typeof value.verifier === "string" && typeof value.next === "string" && value.expires > now ? { ...value, intent } : null;
  } catch { return null; }
}

/** Where to go after sign-in (the allowlist lives in @bayana/shared so the web sends only paths the API accepts). */
export const safeNextPath = googleNextPath;
