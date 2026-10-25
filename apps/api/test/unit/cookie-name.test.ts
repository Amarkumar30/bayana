import { describe, expect, it } from "vitest";
import { readCookie } from "../../src/auth-routes.js";
import { googleCookieName, loadConfig } from "../../src/config-schema.js";

const base = { NODE_ENV: "development", WEB_ORIGINS: "http://localhost:3000", DATABASE_URL: "postgres://user:password@localhost:5432/bayana_dev", SESSION_SECRET: "a".repeat(32), EMAIL_TRANSPORT: "log" };

describe("SESSION_COOKIE_NAME", () => {
  it("defaults to bayana_session and accepts a per-environment name", () => {
    expect(loadConfig(base).SESSION_COOKIE_NAME).toBe("bayana_session");
    expect(loadConfig({ ...base, SESSION_COOKIE_NAME: "" }).SESSION_COOKIE_NAME).toBe("bayana_session");
    expect(loadConfig({ ...base, SESSION_COOKIE_NAME: "bayana_staging_session" }).SESSION_COOKIE_NAME).toBe("bayana_staging_session");
  });
  it("refuses names that could carry cookie attributes or a second cookie, without echoing them", () => {
    for (const bad of ["bayana; Domain=evil.example", "a=b", "with space", "x".repeat(65)]) {
      expect(() => loadConfig({ ...base, SESSION_COOKIE_NAME: bad })).toThrow(/SESSION_COOKIE_NAME: must be/);
      try { loadConfig({ ...base, SESSION_COOKIE_NAME: bad }); } catch (error) { expect((error as Error).message).not.toContain(bad); }
    }
  });
  it("derives the Google sign-in state cookie per environment", () => {
    expect(googleCookieName("bayana_session")).toBe("bayana_google");
    expect(googleCookieName("bayana_staging_session")).toBe("bayana_staging_google");
    expect(googleCookieName("custom")).toBe("custom_google");
  });
  it("reads exactly the named cookie and ignores the other environment's", () => {
    const header = "theme=dark; bayana_session=prod-token; bayana_staging_session=staging-token";
    expect(readCookie(header, "bayana_staging_session")).toBe("staging-token");
    expect(readCookie(header, "bayana_session")).toBe("prod-token");
    expect(readCookie("bayana_session=prod-token", "bayana_staging_session")).toBeUndefined();
    expect(readCookie("bayana_session_x=1", "bayana_session")).toBeUndefined();
    expect(readCookie(undefined, "bayana_session")).toBeUndefined();
  });
});
