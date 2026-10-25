import argon2 from "argon2";
import { describe, expect, it } from "vitest";
import { hashPassword, passwordHashOptions, verifyPassword } from "../../src/auth.js";

describe("argon2id parameters (AU-03)", () => {
  it("production and development hash at 64 MiB and 3 passes", async () => {
    for (const nodeEnv of ["production", "development"] as const) {
      expect(passwordHashOptions(nodeEnv)).toEqual({ type: argon2.argon2id, parallelism: 1, memoryCost: 65536, timeCost: 3 });
      expect(await argon2.hash("a-real-password-1", passwordHashOptions(nodeEnv))).toMatch(/^\$argon2id\$v=19\$m=65536,p=1,t=3\$/);
    }
  });
  it("only NODE_ENV=test uses the cheap parameters, and this suite runs under it", async () => {
    expect(passwordHashOptions("test")).toMatchObject({ memoryCost: 1024, timeCost: 1 });
    expect(await hashPassword("a-real-password-1")).toMatch(/^\$argon2id\$v=19\$m=1024,p=1,t=1\$/);
  });
  it("still verifies a hash made with the production parameters", async () => {
    const strong = await argon2.hash("a-real-password-1", passwordHashOptions("production"));
    expect(await verifyPassword(strong, "a-real-password-1")).toBe(true);
    expect(await verifyPassword(strong, "the-wrong-password")).toBe(false);
    expect(await verifyPassword(null, "a-real-password-1")).toBe(false);
  });
});
