import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../src/database.js";
import { createService, createUser, createVendor } from "../helpers.js";
import { capturedEmails, clearCapturedEmails, sendEmail } from "../../src/email.js";

describe("test database helpers", () => {
  it("creates a vendor, service, and user in the test database", async () => {
    const user = await createUser(pool);
    const vendor = await createVendor(pool, { ownerUserId: user.id });
    const service = await createService(pool, vendor.id);
    expect(service.photographerId).toBe(vendor.id);
  });
  it("captures test email without sending it", async () => {
    clearCapturedEmails();
    await sendEmail({ from: "test@example.test", to: "recipient@example.test", subject: "Test", text: "Message" });
    expect(capturedEmails()).toHaveLength(1);
  });
});
afterAll(async () => { await pool.end(); });
