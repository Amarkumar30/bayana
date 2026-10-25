import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, sentryOrigin, usesNonce } from "@/lib/csp";

// Sets the Content-Security-Policy on every page. Next reads the nonce from the request's CSP header and adds it to its own
// scripts during per-request rendering (the strict pages export dynamic = "force-dynamic").
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://invalid.invalid").origin;
const sentry = sentryOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN);
const dev = process.env.NODE_ENV !== "production";

export function middleware(request: NextRequest) {
  const nonce = usesNonce(request.nextUrl.pathname) ? btoa(crypto.randomUUID()) : null;
  const policy = contentSecurityPolicy({ nonce, apiOrigin, dev, sentry });
  const headers = new Headers(request.headers);
  if (nonce) { headers.set("x-nonce", nonce); headers.set("Content-Security-Policy", policy); }
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = { matcher: [{ source: "/((?!_next/static|_next/image|favicon|icon|brand/|.*\.(?:png|svg|jpg|webp|ico|txt|xml)$).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }] };
