// Run with: pnpm.cmd --filter @bayana/web test:unit. Razorpay Checkout is allowed by exact host, never by wildcard.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentSecurityPolicy } from "./csp.ts";

const policy = contentSecurityPolicy({ nonce: "n0nce", apiOrigin: "https://api.bayana.in", dev: false, sentry: null });
const directive = name => policy.split("; ").find(part => part.startsWith(`${name} `)) ?? "";

describe("content security policy", () => {
  it("names only the Razorpay hosts Checkout uses, with no wildcard", () => {
    assert.doesNotMatch(policy, /\*\.razorpay\.com/);
    assert.match(directive("script-src"), /https:\/\/checkout\.razorpay\.com/);
    assert.equal(directive("frame-src"), "frame-src https://api.razorpay.com https://checkout.razorpay.com");
    assert.equal(directive("connect-src"), "connect-src 'self' https://api.bayana.in https://api.razorpay.com https://lumberjack.razorpay.com");
    assert.equal(directive("img-src"), "img-src 'self' data: blob: https://cdn.razorpay.com");
  });
  it("keeps forms and framing locked down", () => {
    assert.equal(directive("form-action"), "form-action 'self' https://api.bayana.in");
    assert.equal(directive("frame-ancestors"), "frame-ancestors 'none'");
  });
});
