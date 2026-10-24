import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "../../src/database.js";
import { createVendor } from "../helpers.js";

const insertBooking = (vendorId: string, eventDate: string, occupiedStart: string, occupiedEnd: string) => pool.query("INSERT INTO bookings(id,vendor_id,event_date,client_name,client_email,client_phone,status,total_paise,advance_paise,hold_expires_at,idempotency_key,occupied_starts_at,occupied_ends_at) VALUES($1,$2,$3,'Test client',$4,'','CONFIRMED',100,1,now()+interval '10 minutes',$5,$6,$7)", [randomUUID(), vendorId, eventDate, `client-${randomUUID()}@example.test`, randomUUID(), occupiedStart, occupiedEnd]);

describe("availability exclusion constraint", () => {
  it("rejects an overlapping direct SQL insert across local booking dates", async () => {
    const vendor = await createVendor(pool);
    await insertBooking(vendor.id, "2026-04-10", "2026-04-10T23:30:00Z", "2026-04-11T00:30:00Z");
    await expect(insertBooking(vendor.id, "2026-04-11", "2026-04-11T00:00:00Z", "2026-04-11T01:00:00Z")).rejects.toMatchObject({ constraint: "bookings_no_overlapping_active_periods" });
  });
});
afterAll(async () => { await pool.end(); });
