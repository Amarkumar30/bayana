import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool, transaction } from "../../src/database.js";
import { hashPassword, passwordLogin } from "../../src/auth.js";

const password = "correct-horse-battery-9";
async function vendorWithPassword() {
  const email = `login-${randomUUID()}@example.test`;
  await pool.query("INSERT INTO users(id,email,role,email_verified_at,password_hash,password_set_at) VALUES($1,$2,'VENDOR',now(),$3,now())", [randomUUID(), email, await hashPassword(password)]);
  return email;
}
const failure = (promise: Promise<unknown>) => promise.then(() => null, (error: { status?: number; code?: string; message?: string }) => ({ status: error.status, code: error.code, message: error.message }));

describe("password login", () => {
  it("returns only public user fields, never the password hash", async () => {
    const email = await vendorWithPassword();
    const result = await transaction(db => passwordLogin(db, email, password));
    expect(Object.keys(result.user).sort()).toEqual(["email", "id", "role"]);
    expect(JSON.stringify(result.user)).not.toContain("argon2");
  });
  it("fails identically for a wrong password and an unknown email", async () => {
    const email = await vendorWithPassword();
    const wrong = await failure(transaction(db => passwordLogin(db, email, "not-the-password-1")));
    const unknown = await failure(transaction(db => passwordLogin(db, `missing-${randomUUID()}@example.test`, password)));
    expect(wrong).toEqual({ status: 401, code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    expect(unknown).toEqual(wrong);
  });
});
afterAll(async () => { await pool.end(); });
