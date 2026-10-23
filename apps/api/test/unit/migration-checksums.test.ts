import { describe, expect, it } from "vitest";
import { assertAppliedChecksum, migrationChecksum } from "../../src/migration-checksums.js";

describe("migration checksums", () => {
  it("rejects a modified applied migration", () => {
    expect(() => assertAppliedChecksum("001_init.sql", migrationChecksum("SELECT 1;"), "SELECT 2;")).toThrow("Applied migration checksum changed: 001_init.sql");
  });
});
