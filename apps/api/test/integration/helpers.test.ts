import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../src/database.js";
import { createService, createUser, createVendor } from "../helpers.js";
import { capturedEmails, clearCapturedEmails, sendEmail } from "../../src/email.js";

describe("test database helpers", () => {
  it("creates a vendor, service, and user in the test database", async () => {
    const user = await createUser(pool);
    const vendor = await createVendor(pool, { ownerUserId: user.id });
    const service = await createService(pool, vendor.id);
    expect(service.vendorId).toBe(vendor.id);
  });
  it("captures test email without sending it", async () => {
    clearCapturedEmails();
    await sendEmail({ from: "test@example.test", to: "recipient@example.test", subject: "Test", text: "Message" });
    expect(capturedEmails()).toHaveLength(1);
  });
  it("scopes vendor profile and service mutations to the owning vendor", async () => {
    const ownerA = await createUser(pool);
    const ownerB = await createUser(pool);
    const vendorA = await createVendor(pool, { ownerUserId: ownerA.id });
    const vendorB = await createVendor(pool, { ownerUserId: ownerB.id });
    const serviceB = await createService(pool, vendorB.id);
    const profile = await pool.query("SELECT id FROM vendors WHERE owner_user_id=$1", [ownerA.id]);
    const update = await pool.query("UPDATE services SET name='Not allowed' WHERE id=$1 AND vendor_id=$2 RETURNING id", [serviceB.id, vendorA.id]);
    const removal = await pool.query("DELETE FROM services WHERE id=$1 AND vendor_id=$2 RETURNING id", [serviceB.id, vendorA.id]);
    expect(profile.rows).toEqual([{ id: vendorA.id }]);
    expect(update.rowCount).toBe(0);
    expect(removal.rowCount).toBe(0);
  });
});
afterAll(async () => { await pool.end(); });
