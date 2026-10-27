// Run with: pnpm.cmd --filter @bayana/web test:unit. security-headers.ts is what next.config.ts serves on every response.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { securityHeaders } from "./security-headers.ts";

const hsts = (production, siteUrl) => securityHeaders(production, siteUrl).find(header => header.key === "Strict-Transport-Security");

describe("security headers", () => {
  it("HSTS in production over HTTPS keeps max-age and includeSubDomains, without preload", () => {
    assert.equal(hsts(true, "https://bayana.in")?.value, "max-age=63072000; includeSubDomains");
    assert.doesNotMatch(hsts(true, "https://staging.bayana.in").value, /preload/);
  });
  it("no HSTS in development or over plain http", () => {
    assert.equal(hsts(false, "https://bayana.in"), undefined);
    assert.equal(hsts(true, "http://localhost:3000"), undefined);
  });
  it("next.config.ts serves exactly these headers", async () => {
    const text = await readFile(new URL("./next.config.ts", import.meta.url), "utf8");
    assert.match(text, /createSecurityHeaders\(process\.env\.NODE_ENV === "production", process\.env\.NEXT_PUBLIC_SITE_URL\)/);
    // Every path gets the security headers (plus X-Robots-Tag: noindex when the site may not be indexed, lib/site.ts).
    assert.match(text, /source: "\/:path\*", headers: \[\.\.\.securityHeaders, \.\.\.robotsHeaders\] \}/);
  });
});
