import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { ConfigError, databaseNameProblem, loadConfig } from "./config-schema.js";

// Used by scripts/setup-env.mjs and scripts/doctor.mjs. Validates an env FILE (not process.env) and prints JSON
// with variable names and rules only. Values are never printed.
const [file, display = file] = process.argv.slice(2);
if (!file) throw new Error("Usage: check-env <path-to-.env> [display-name]");
type Result = { file: string; exists: boolean; problems: { name: string; rule: string }[] };
const result: Result = { file: display, exists: existsSync(file), problems: [] };
if (result.exists) {
  const values = parse(readFileSync(file));
  try {
    const config = loadConfig(values, display);
    const nameProblem = config.NODE_ENV === "test" ? null : databaseNameProblem(config.DATABASE_URL, config.NODE_ENV);
    if (nameProblem) result.problems.push({ name: "DATABASE_URL", rule: nameProblem });
    if (values.DATABASE_URL_TEST && databaseNameProblem(values.DATABASE_URL_TEST, "test")) result.problems.push({ name: "DATABASE_URL_TEST", rule: "must name a database ending in _test" });
    if (!values.DATABASE_URL_TEST) result.problems.push({ name: "DATABASE_URL_TEST", rule: "is missing; tests need it (for example postgres://bayana:bayana@localhost:5433/bayana_test)" });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    result.problems.push(...error.problems);
  }
}
process.stdout.write(`${JSON.stringify(result)}\n`);
