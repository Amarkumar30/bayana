import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../src/database.js";
import { checkNeonCompat, isPooledHost, NEON_CHECK_COUNT } from "../../src/neon-compat.js";

afterAll(() => pool.end());

describe("Neon compatibility check (SPEC 16.5)", () => {
  it("passes every step against PostgreSQL 16 and leaves nothing behind", async () => {
    const client = await pool.connect();
    try {
      const results = await checkNeonCompat(client);
      expect(results.map(result => [result.name, result.ok])).toEqual([
        ["postgres_16_or_newer", true], ["create_extension_btree_gist", true], ["exclusion_constraint_rejects_overlap", true], ["transaction_scoped_lock_and_settings", true]
      ]);
      expect(results).toHaveLength(NEON_CHECK_COUNT);
      expect((await client.query("SELECT to_regclass('pg_temp.neon_check_guard') AS t")).rows[0].t).toBeNull();
      // The rollback ended the transaction: SET LOCAL did not escape onto this pooled connection.
      expect((await client.query("SHOW statement_timeout")).rows[0].statement_timeout).not.toBe("5s");
    } finally { client.release(); }
  });

  it("recognises Neon's pooled host", () => {
    expect(isPooledHost("postgres://u:p@ep-cool-name-123-pooler.ap-southeast-1.aws.neon.tech/bayana")).toBe(true);
    expect(isPooledHost("postgres://u:p@ep-cool-name-123.ap-southeast-1.aws.neon.tech/bayana")).toBe(false);
  });
});
