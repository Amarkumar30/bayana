import { existsSync, readFileSync } from "node:fs";
import { loadServerEnv, webEnvProblems } from "../env-schema";

// Used by scripts/setup-env.mjs and scripts/doctor.mjs. Validates the web env FILE and prints JSON with names and rules only.
const [file, display = file] = process.argv.slice(2);
if (!file) throw new Error("Usage: check-env <path-to-.env.local> [display-name]");
const exists = existsSync(file);
// Minimal KEY=VALUE reader: the web app has no dotenv dependency and these files hold two public URLs.
const values = exists ? Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).map(line => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)).filter((match): match is RegExpExecArray => Boolean(match)).map(match => [match[1], match[2].replace(/^(['"])(.*)\1$/, "$2")])) : {};
// The server-only setting (SESSION_COOKIE_NAME) is checked with the same rule next.config.ts applies.
const serverProblems = (() => { try { loadServerEnv({ SESSION_COOKIE_NAME: values.SESSION_COOKIE_NAME }); return []; } catch { return [{ name: "SESSION_COOKIE_NAME", rule: "must be empty (bayana_session), or letters, digits and _ only, matching the API" }]; } })();
process.stdout.write(`${JSON.stringify({ file: display, exists, problems: exists ? [...webEnvProblems(values), ...serverProblems] : [] })}\n`);
