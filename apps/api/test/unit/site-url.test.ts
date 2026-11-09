import { describe, expect, it } from "vitest";
import { DEPLOYED_SITE_URL, bookingPageUrl, deployedSiteUrlProblem, siteHost, siteUrl, vendorPageUrl, vendorShareLinks } from "@bayana/shared";
import { loadConfig } from "../../src/config-schema.js";

// The one builder for every absolute URL (packages/shared/src/site.ts) and the startup guard on SITE_URL.
describe("site URL builder", () => {
  it("joins the configured origin and a path, with or without a trailing slash on the origin", () => {
    expect(siteUrl("https://bayana.in")).toBe("https://bayana.in");
    expect(siteUrl("https://bayana.in/", "/sitemap.xml")).toBe("https://bayana.in/sitemap.xml");
    expect(siteUrl("http://localhost:3000", "/login?error=google_expired")).toBe("http://localhost:3000/login?error=google_expired");
    expect(siteHost("https://bayana.in")).toBe("bayana.in");
  });
  it("builds vendor pages and private booking links, encoding what goes into the URL", () => {
    expect(vendorPageUrl("https://bayana.in", "sau-studio")).toBe("https://bayana.in/sau-studio");
    expect(vendorPageUrl("https://bayana.in", "a b/c")).toBe("https://bayana.in/a%20b%2Fc");
    const id = "6f1c2c1e-1d5b-4a43-9a43-2a4a3c1a7b10";
    expect(bookingPageUrl("https://bayana.in", id)).toBe(`https://bayana.in/b/${id}`);
    expect(bookingPageUrl("https://bayana.in", id, "a+b/c=")).toBe(`https://bayana.in/b/${id}?t=a%2Bb%2Fc%3D`);
  });
  it("gives the share card one URL for the shown link, Copy link, WhatsApp and the QR code", () => {
    const links = vendorShareLinks("https://bayana.in", "sau-studio");
    expect(links).toMatchObject({ url: "https://bayana.in/sau-studio", label: "bayana.in/sau-studio", qrTarget: "https://bayana.in/sau-studio" });
    expect(decodeURIComponent(new URL(links.whatsapp("Sau Studio")).searchParams.get("text") ?? "")).toBe("Book Sau Studio here: https://bayana.in/sau-studio");
  });
});

describe("deployed site URL rule", () => {
  it("allows only https://bayana.in in staging and production, and anything locally", () => {
    expect(DEPLOYED_SITE_URL).toBe("https://bayana.in");
    for (const appEnv of ["staging", "production"]) {
      expect(deployedSiteUrlProblem(appEnv, "https://bayana.in")).toBeNull();
      for (const bad of ["https://staging.bayana.in", "https://bayana-web.vercel.app", "http://bayana.in", "https://www.bayana.in", "https://staging-bayana.in"]) expect(deployedSiteUrlProblem(appEnv, bad), bad).toMatch(/^must be https:\/\/bayana\.in when APP_ENV=/);
      expect(deployedSiteUrlProblem(appEnv, undefined)).toMatch(/^is required when APP_ENV=/);
    }
    for (const appEnv of ["local", undefined]) expect(deployedSiteUrlProblem(appEnv, "https://staging.bayana.in")).toBeNull();
  });
});

// A deployed API with every other setting valid (fakes, never real secrets), so only SITE_URL decides.
const deployed = {
  NODE_ENV: "production", APP_ENV: "production", TRUST_PROXY: "1", WEB_ORIGINS: "https://bayana.in", SESSION_COOKIE_DOMAIN: ".bayana.in", SITE_URL: "https://bayana.in",
  DATABASE_URL: "postgres://app:pw@ep-fake-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require", DATABASE_URL_DIRECT: "postgres://app:pw@ep-fake.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
  SESSION_SECRET: "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3928", OTP_PEPPER: "0a1b2c3d4e5f60718293a4b5c6d7e8f9", TICK_SECRET: "f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4", EMAIL_TRANSPORT: "brevo_api", BREVO_API_KEY: "k".repeat(40), EMAIL_FROM: "Bayana <bookings@bayana.in>"
};
const refusal = (overrides: Record<string, string | undefined>) => { try { loadConfig({ ...deployed, ...overrides }); return ""; } catch (error) { return (error as Error).message; } };

describe("SITE_URL startup guard", () => {
  it("starts with SITE_URL=https://bayana.in in staging and production", () => {
    expect(loadConfig(deployed).SITE_URL).toBe("https://bayana.in");
    expect(loadConfig({ ...deployed, APP_ENV: "staging" }).SITE_URL).toBe("https://bayana.in");
  });
  it.each(["staging", "production"])("refuses to start with APP_ENV=%s and a staging, preview or missing SITE_URL, naming the variable only", appEnv => {
    for (const site of ["https://staging.bayana.in", "https://bayana-web.vercel.app"]) {
      const text = refusal({ APP_ENV: appEnv, SITE_URL: site, WEB_ORIGINS: `https://bayana.in,${site}` });
      expect(text, site).toContain(`SITE_URL: must be https://bayana.in when APP_ENV=${appEnv}`);
      expect(text).not.toContain(site.replace("https://", ""));
    }
    expect(refusal({ APP_ENV: appEnv, SITE_URL: undefined })).toContain(`SITE_URL: is required when APP_ENV=${appEnv}; set it to https://bayana.in`);
    // The first WEB_ORIGINS entry is no substitute in a deployment: the variable itself must be set.
    expect(refusal({ APP_ENV: appEnv, SITE_URL: "", WEB_ORIGINS: "https://bayana.in" })).toContain("SITE_URL: is required");
  });
  it("must be one of WEB_ORIGINS, so the site can call the API", () => {
    expect(refusal({ WEB_ORIGINS: "https://www.bayana.in" })).toContain("SITE_URL: must also be listed in WEB_ORIGINS");
  });
  it("defaults locally to the first WEB_ORIGINS entry, and a local SITE_URL is used as given", () => {
    const local = { NODE_ENV: "development", WEB_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000", DATABASE_URL: "postgres://user:password@localhost:5432/bayana_dev", SESSION_SECRET: "a".repeat(32), EMAIL_TRANSPORT: "log" };
    expect(loadConfig(local).SITE_URL).toBe("http://localhost:3000");
    expect(loadConfig({ ...local, SITE_URL: "http://127.0.0.1:3000" }).SITE_URL).toBe("http://127.0.0.1:3000");
    expect(() => loadConfig({ ...local, SITE_URL: "http://localhost:3000/" })).toThrow("SITE_URL: must be");
  });
});
