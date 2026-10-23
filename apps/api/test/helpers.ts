import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export async function createUser(db: Pool, values: Partial<{ email: string; role: "PHOTOGRAPHER" | "CLIENT" | "ADMIN" }> = {}) {
  const user = { id: randomUUID(), email: values.email ?? `test-${randomUUID()}@example.test`, role: values.role ?? "PHOTOGRAPHER" };
  await db.query("INSERT INTO users(id,email,role) VALUES($1,$2,$3)", [user.id, user.email, user.role]);
  return user;
}
export async function createVendor(db: Pool, values: Partial<{ slug: string; ownerUserId: string }> = {}) {
  const vendor = { id: randomUUID(), slug: values.slug ?? `vendor-${randomUUID().slice(0, 8)}` };
  await db.query("INSERT INTO photographers(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value) VALUES($1,$2,$3,'Test vendor','Delhi','',10000,'PERCENT',10)", [vendor.id, values.ownerUserId ?? null, vendor.slug]);
  return vendor;
}
export async function createService(db: Pool, photographerId: string) {
  const service = { id: randomUUID(), photographerId };
  await db.query("INSERT INTO services(id,photographer_id,name,price_paise,duration_minutes) VALUES($1,$2,'Test service',10000,60)", [service.id, service.photographerId]);
  return service;
}
