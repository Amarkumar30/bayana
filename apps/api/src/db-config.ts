import "dotenv/config";
import { loadDatabaseConfig, type DatabaseConfig } from "./config-schema.js";

// For migrate.ts and neon-check.ts: the database-only part of the config (NODE_ENV and the URL). Importing config.ts instead
// would demand mail, secrets, payments and Google settings that a migration never uses.
function loadOrExit(): DatabaseConfig {
  try { return loadDatabaseConfig(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid environment"}\n`); process.exit(1); }
}
export const databaseConfig = loadOrExit();
