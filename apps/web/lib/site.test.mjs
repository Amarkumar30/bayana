// Run with: pnpm.cmd --filter @bayana/web test:unit. Public URLs, indexing and the www redirect come only from configuration.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { NOINDEX_HEADER, indexingAllowed, productionWebProblems, siteHost, vendorLinkLabel, vendorUrl, wwwRedirects } from "./site.ts";

const STAGING = "https://staging.bayana.in", PRODUCTION = "https://bayana.in";

describe("vendor links come from NEXT_PUBLIC_SITE_URL", () => {
  it("builds ${SITE_URL}/<slug> for staging and for bayana.in", () => {
    assert.equal(vendorUrl(STAGING, "studio-sunday"), "https://staging.bayana.in/studio-sunday");
    assert.equal(vendorUrl(PRODUCTION, "studio-sunday"), "https://bayana.in/studio-sunday");
    assert.equal(vendorUrl("http://localhost:3000", "studio-sunday"), "http://localhost:3000/studio-sunday");
    assert.equal(vendorUrl(`${PRODUCTION}/`, "a-b"), "https://bayana.in/a-b");
  });
  it("shows the host the visitor would type", () => {
    assert.equal(vendorLinkLabel(STAGING, "studio-sunday"), "staging.bayana.in/studio-sunday");
    assert.equal(vendorLinkLabel(PRODUCTION, "studio-sunday"), "bayana.in/studio-sunday");
    assert.equal(siteHost("http://localhost:3000"), "localhost:3000");
  });
  it("no page or component hard-codes the bayana.in host for a vendor link", async () => {
    for (const file of ["../app/dashboard/page.tsx", "../components/vendor/onboarding-wizard.tsx", "../app/(site)/page.tsx", "../app/(site)/about/page.tsx"]) {
      const text = await readFile(new URL(file, import.meta.url), "utf8");
      assert.doesNotMatch(text, /bayana\.in\/[{$a-z]/, file);
      assert.doesNotMatch(text, /location\.origin/, file);
    }
  });
});

describe("indexing", () => {
  it("is allowed only with APP_ENV=production AND LEGAL_REVIEWED=true", () => {
    assert.equal(indexingAllowed({ APP_ENV: "production", LEGAL_REVIEWED: "true" }), true);
    assert.equal(indexingAllowed({ APP_ENV: "production", LEGAL_REVIEWED: "false" }), false);
    assert.equal(indexingAllowed({ APP_ENV: "production" }), false);
    assert.equal(indexingAllowed({ APP_ENV: "staging", LEGAL_REVIEWED: "true" }), false);
    assert.equal(indexingAllowed({ APP_ENV: "local", LEGAL_REVIEWED: "true" }), false);
    assert.deepEqual(NOINDEX_HEADER, { key: "X-Robots-Tag", value: "noindex, nofollow" });
  });
  it("robots, the root layout, legal pages and next.config all use the same rule", async () => {
    // The sitemap only lists pages; robots.txt names it only when indexing is allowed, and every response says noindex.
    for (const file of ["../app/robots.ts", "../app/layout.tsx", "../components/legal/legal-page.tsx", "../next.config.ts"]) {
      assert.match(await readFile(new URL(file, import.meta.url), "utf8"), /indexingAllowed\(loadServerEnv\(\)\)/, file);
    }
  });
  it("nothing in the repository sets LEGAL_REVIEWED=true", async () => {
    // Assignments only (comments may name the rule): an env line, or a render.yaml value under the key.
    assert.doesNotMatch(await readFile(new URL("../.env.example", import.meta.url), "utf8"), /^\s*LEGAL_REVIEWED\s*=\s*"?true/m);
    assert.doesNotMatch(await readFile(new URL("../../../render.yaml", import.meta.url), "utf8"), /key:\s*LEGAL_REVIEWED\s*\n\s*value:\s*"?true/);
  });
});

describe("www redirect", () => {
  it("www.bayana.in goes permanently to https://bayana.in, keeping the path", () => {
    assert.deepEqual(wwwRedirects(PRODUCTION), [{ source: "/:path*", has: [{ type: "host", value: "www.bayana.in" }], destination: "https://bayana.in/:path*", permanent: true }]);
  });
  it("nothing for staging, a www site, local hosts or no site URL", () => {
    for (const site of [STAGING, "https://www.bayana.in", "http://localhost:3000", "http://127.0.0.1:3100", undefined]) assert.deepEqual(wwwRedirects(site), [], String(site));
  });
  it("next.config.ts serves it", async () => {
    assert.match(await readFile(new URL("../next.config.ts", import.meta.url), "utf8"), /redirects\(\) \{ return wwwRedirects\(process\.env\.NEXT_PUBLIC_SITE_URL\); \}/);
  });
});

describe("APP_ENV=production web guard", () => {
  it("accepts the bayana.in origins and ignores every other APP_ENV", () => {
    assert.deepEqual(productionWebProblems({ APP_ENV: "production", NEXT_PUBLIC_SITE_URL: PRODUCTION, NEXT_PUBLIC_API_URL: "https://api.bayana.in" }), []);
    assert.deepEqual(productionWebProblems({ APP_ENV: "staging", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_API_URL: "http://localhost:4000" }), []);
    assert.deepEqual(productionWebProblems({ APP_ENV: "local", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_API_URL: "http://localhost:4000" }), []);
  });
  it("refuses http or localhost for either origin, naming the variable only", () => {
    const problems = productionWebProblems({ APP_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://bayana.in", NEXT_PUBLIC_API_URL: "https://localhost:4000" });
    assert.equal(problems.length, 2);
    assert.match(problems[0], /^NEXT_PUBLIC_SITE_URL:/); assert.match(problems[1], /^NEXT_PUBLIC_API_URL:/);
    assert.doesNotMatch(problems.join(" "), /localhost:4000|http:\/\/bayana/);
    assert.equal(productionWebProblems({ APP_ENV: "production", NEXT_PUBLIC_SITE_URL: PRODUCTION }).length, 1);
  });
});
