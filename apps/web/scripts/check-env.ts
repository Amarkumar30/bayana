import { existsSync, readFileSync } from "node:fs";
import { webEnvProblems } from "../env-schema";

// Used by scripts/setup-env.mjs and scripts/doctor.mjs. Validates the web env FILE and prints JSON with names and rules only.
const [file, display = file] = process.argv.slice(2);
if (!file) throw new Error("Usage: check-env <path-to-.env.local> [display-name]");
const exists = existsSync(file);
// Minimal KEY=VALUE reader: the web app has no dotenv dependency and these files hold two public URLs.
const values = exists ? Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).map(line => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)).filter((match): match is RegExpExecArray => Boolean(match)).map(match => [match[1], match[2].replace(/^(['"])(.*)\1$/, "$2")])) : {};
process.stdout.write(`${JSON.stringify({ file: display, exists, problems: exists ? webEnvProblems(values) : [] })}\n`);
