import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "../../src/database.js";
import { createVendor } from "../helpers.js";

const insertBooking = (vendorId: string, eventDate: string, blockStart: string, blockEnd: string, status = "CONFIRMED") => pool.query("INSERT INTO bookings(id,vendor_id,event_date,client_name,client_email,client_phone,status,total_paise,advance_paise,hold_expires_at,idempotency_key,starts_at,ends_at,block_start,block_end) VALUES($1,$2,$3,'Test client',$4,'',$5,100,1,now()+interval '10 minutes',$6,$7,$8,$7,$8)", [randomUUID(), vendorId, eventDate, `client-${randomUUID()}@example.test`, status, randomUUID(), blockStart, blockEnd]);

describe("bookings_no_overlap exclusion constraint (SPEC 8.3)", () => {
  it("rejects an overlapping direct SQL insert across local booking dates with SQLSTATE 23P01", async () => {
    const vendor = await createVendor(pool);
    await insertBooking(vendor.id, "2026-04-10", "2026-04-10T23:30:00Z", "2026-04-11T00:30:00Z");
    await expect(insertBooking(vendor.id, "2026-04-11", "2026-04-11T00:00:00Z", "2026-04-11T01:00:00Z")).rejects.toMatchObject({ code: "23P01", constraint: "bookings_no_overlap" });
  });
  it("ignores inactive bookings and allows back-to-back ranges ('[)' bounds)", async () => {
    const vendor = await createVendor(pool);
    await insertBooking(vendor.id, "2026-04-10", "2026-04-10T04:00:00Z", "2026-04-10T05:00:00Z", "EXPIRED");
    await insertBooking(vendor.id, "2026-04-10", "2026-04-10T04:00:00Z", "2026-04-10T05:00:00Z");
    await insertBooking(vendor.id, "2026-04-10", "2026-04-10T05:00:00Z", "2026-04-10T06:00:00Z", "PENDING");
  });
  it("requires the block to contain the service time", async () => {
    const vendor = await createVendor(pool);
    await expect(pool.query("INSERT INTO bookings(id,vendor_id,event_date,client_name,client_email,client_phone,status,total_paise,advance_paise,idempotency_key,starts_at,ends_at,block_start,block_end) VALUES($1,$2,'2026-04-10','c','c@example.test','','HELD',100,1,$3,'2026-04-10T04:00:00Z','2026-04-10T05:00:00Z','2026-04-10T04:30:00Z','2026-04-10T05:00:00Z')", [randomUUID(), vendor.id, randomUUID()])).rejects.toMatchObject({ constraint: "bookings_block_valid" });
  });
});
afterAll(async () => { await pool.end(); });
