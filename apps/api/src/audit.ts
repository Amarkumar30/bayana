import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

/** Appends one audit_logs row (append-only by trigger). Metadata never holds secrets, codes or full card/bank details. */
export async function writeAudit(db: Pool | PoolClient, actorUserId: string | null, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  await db.query("INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,metadata) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(), actorUserId, action, resourceType, resourceId, JSON.stringify(metadata)]);
}
