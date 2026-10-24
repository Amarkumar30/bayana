import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// BK-07 / SPEC 10.1: only transitionBooking (src/booking-transition.ts) may write bookings.status.
const sourceRoot = new URL("../../src/", import.meta.url);
// Only the SET list counts: a WHERE clause that reads status (for example the reminder claim) is not a write.
const statusWrite = /UPDATE\s+bookings\s+SET\b(?:(?!\bWHERE\b)[^;`"])*?\bstatus\s*=/gi;

async function sourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? sourceFiles(new URL(`${entry.name}/`, directory)) : Promise.resolve(/\.ts$/.test(entry.name) ? [new URL(entry.name, directory)] : [])));
  return nested.flat();
}

describe("booking status writes", () => {
  it("the pattern catches the forms a direct write would take", () => {
    for (const sql of ["UPDATE bookings SET status='EXPIRED' WHERE id=$1", "update bookings set hold_expires_at=now(), status = $1", "UPDATE  bookings\n  SET status=$1"]) expect(sql.match(statusWrite)).not.toBeNull();
    expect("UPDATE bookings SET hold_expires_at=now() WHERE id=$1".match(statusWrite)).toBeNull();
    expect("UPDATE bookings SET reminder_sent_at=now() WHERE id=$1 AND status='CONFIRMED'".match(statusWrite)).toBeNull();
  });
  it("no file other than booking-transition.ts contains UPDATE bookings SET status", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(sourceRoot)) {
      const text = await readFile(file, "utf8");
      if (statusWrite.test(text) && !file.pathname.endsWith("/booking-transition.ts")) offenders.push(file.pathname);
      statusWrite.lastIndex = 0;
    }
    expect(offenders).toEqual([]);
  });
  it("booking-transition.ts writes status exactly once", async () => {
    const text = await readFile(new URL("booking-transition.ts", sourceRoot), "utf8");
    expect(text.match(statusWrite)).toHaveLength(1);
  });
});
