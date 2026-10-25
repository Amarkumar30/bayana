import { describe, expect, it, vi } from "vitest";
import { isTransientConnectionError, readWithOneRetry } from "../../src/database.js";

const failing = (code: string) => Object.assign(new Error(`connection problem ${code}`), { code });

describe("readWithOneRetry (/ready only)", () => {
  it.each(["ECONNRESET", "ETIMEDOUT", "57P01", "08006"])("retries once after a dropped connection (%s) and returns the second result", async code => {
    const read = vi.fn().mockRejectedValueOnce(failing(code)).mockResolvedValueOnce("ok");
    await expect(readWithOneRetry(read)).resolves.toBe("ok");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("retries only once: a second failure is returned to the caller", async () => {
    const read = vi.fn().mockRejectedValue(failing("ECONNRESET"));
    await expect(readWithOneRetry(read)).rejects.toThrow("ECONNRESET");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("never retries other errors (a bad query, a constraint, a missing table)", async () => {
    for (const code of ["42P01", "23505", "28P01", "42601"]) {
      const read = vi.fn().mockRejectedValue(failing(code));
      await expect(readWithOneRetry(read)).rejects.toThrow(code);
      expect(read).toHaveBeenCalledTimes(1);
    }
    expect(isTransientConnectionError(new Error("no code"))).toBe(false);
    expect(isTransientConnectionError(null)).toBe(false);
  });
});
