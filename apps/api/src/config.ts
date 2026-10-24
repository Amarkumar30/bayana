import "dotenv/config";
import { loadConfig, type Config } from "./config-schema.js";

export { ConfigError, databaseNameProblem, loadConfig, type Config } from "./config-schema.js";

function loadConfigOrExit(): Config {
  try { return loadConfig(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid environment"}\n`); process.exit(1); }
}
export const config = loadConfigOrExit();
