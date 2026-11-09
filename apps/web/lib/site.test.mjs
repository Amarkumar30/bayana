// Run with: pnpm.cmd --filter @bayana/web test:unit. Public URLs, indexing and the www redirect come only from configuration.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { NOINDEX_HEADER, deployedWebProblems, indexingAllowed, wwwRedirects } from "./site.ts";
import { siteHost, vendorShareLinks } from "../../../packages/shared/src/site.ts";

const STAGING = "https://staging.bayana.in", PRODUCTION = "https://bayana.in";
const source = file => readFile(new URL(file, import.meta.url), "utf8");

describe("vendor links come from NEXT_PUBLIC_SITE_URL", () => {
  it("the shown link, Copy link, WhatsApp and the QR code are one URL", () => {
    const links = vendorShareLinks(PRODUCTION, "sau-studio");
    assert.equal(links.url, "https://bayana.in/sau-studio");
    assert.equal(links.label, "bayana.in/sau-studio");
    assert.equal(links.qrTarget, links.url);
    assert.equal(links.whatsapp("Sau Studio & Co"), `https://wa.me/?text=${encodeURIComponent("Book Sau Studio & Co here: https://bayana.in/sau-studio")}`);
    assert.equal(siteHost("http://localhost:3000"), "localhost:3000");
  });
  it("the share card, the QR route, the onboarding hint and the vendor page's canonical URL all call the shared builder", async () => {
    const card = await source("../components/dashboard/share-card.tsx");
    assert.match(card, /vendorShareLinks\(env\.NEXT_PUBLIC_SITE_URL, slug\)/);
    for (const use of ["{links.label}", "writeText(links.url)", "links.whatsapp(businessName)", "/api/qr/"]) assert.ok(card.includes(use), use);
    assert.match(await source("../app/api/qr/[slug]/route.ts"), /renderSVG\(vendorShareLinks\(env\.NEXT_PUBLIC_SITE_URL, slug\)\.qrTarget/);
    assert.match(await source("../components/vendor/onboarding-wizard.tsx"), /vendorShareLinks\(env\.NEXT_PUBLIC_SITE_URL, slug\)\.label/);
    assert.match(await source("../app/(public)/[slug]/page.tsx"), /vendorPageUrl\(env\.NEXT_PUBLIC_SITE_URL, slug\)/);
    for (const file of ["../app/sitemap.ts", "../app/robots.ts", "../app/layout.tsx"]) assert.match(await source(file), /siteUrl\(env\.NEXT_PUBLIC_SITE_URL/, file);
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

describe("deployed web build guard", () => {
  it("accepts https://bayana.in in staging and production, and leaves local builds alone", () => {
    assert.deepEqual(deployedWebProblems({ APP_ENV: "production", NEXT_PUBLIC_SITE_URL: PRODUCTION, NEXT_PUBLIC_API_URL: "https://api.bayana.in" }), []);
    assert.deepEqual(deployedWebProblems({ APP_ENV: "staging", NEXT_PUBLIC_SITE_URL: PRODUCTION, NEXT_PUBLIC_API_URL: "https://api.bayana.in" }), []);
    assert.deepEqual(deployedWebProblems({ APP_ENV: "local", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_API_URL: "http://localhost:4000" }), []);
    assert.deepEqual(deployedWebProblems({ NEXT_PUBLIC_SITE_URL: STAGING, NEXT_PUBLIC_API_URL: "http://localhost:4000" }), []);
  });
  it("refuses a staging, preview, http, localhost or missing site URL in a deployed environment, naming the variable only", () => {
    for (const APP_ENV of ["staging", "production"]) {
      for (const site of [STAGING, `${STAGING}/`, "https://bayana-web.vercel.app", "http://bayana.in", "http://localhost:3000", "https://staging-bayana.in", undefined]) {
        const problems = deployedWebProblems({ APP_ENV, NEXT_PUBLIC_SITE_URL: site, NEXT_PUBLIC_API_URL: "https://api.bayana.in" });
        assert.equal(problems.length, 1, `${APP_ENV} ${site}`);
        assert.match(problems[0], /^NEXT_PUBLIC_SITE_URL: (must be|is required)[^]*https:\/\/bayana\.in/);
        if (site && site !== "http://bayana.in") assert.ok(!problems[0].includes(site.replace(/^https?:\/\//, "")), "the rejected value is never echoed");
      }
    }
  });
  it("production also refuses an http or localhost API origin", () => {
    const problems = deployedWebProblems({ APP_ENV: "production", NEXT_PUBLIC_SITE_URL: PRODUCTION, NEXT_PUBLIC_API_URL: "https://localhost:4000" });
    assert.deepEqual(problems.map(problem => problem.split(":")[0]), ["NEXT_PUBLIC_API_URL"]);
    assert.doesNotMatch(problems.join(" "), /localhost:4000/);
  });
  it("next.config.ts runs the guard before every dev server and build, and exits on a problem", async () => {
    const config = await source("../next.config.ts");
    assert.match(config, /const problems = deployedWebProblems\(\{ APP_ENV: loadServerEnv\(\)\.APP_ENV, NEXT_PUBLIC_SITE_URL: process\.env\.NEXT_PUBLIC_SITE_URL/);
    assert.match(config, /if \(problems\.length\) throw new Error/);
    assert.match(config, /process\.exit\(1\)/);
  });
});
