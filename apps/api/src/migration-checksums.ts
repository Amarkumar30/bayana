import { createHash } from "node:crypto";

export const migrationChecksum = (sql: string) => createHash("sha256").update(sql).digest("hex");
export function assertAppliedChecksum(name: string, applied: string | null, sql: string) {
  if (applied && applied !== migrationChecksum(sql)) throw new Error(`Applied migration checksum changed: ${name}`);
}
