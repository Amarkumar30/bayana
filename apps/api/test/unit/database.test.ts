import { describe, expect, it } from "vitest";
import { assertTestDatabase } from "../../src/database.js";

describe("test database guard", () => {
  it("refuses a database that is not explicitly a test database", () => {
    expect(() => assertTestDatabase("postgres://user:password@localhost:5432/bayana")).toThrow("ending in _test");
  });
});
