// pnpm.cmd setup:env — creates missing env files from their examples. Never overwrites an existing file.
// Usage: node scripts/setup-env.mjs [--root <dir>] [--no-check]
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEnvFile, envFiles } from "./env-files.mjs";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = path.resolve(rootIndex >= 0 ? args[rootIndex + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const runChecks = !args.includes("--no-check");
let failed = false;

for (const entry of envFiles) {
  const example = path.join(root, entry.example), target = path.join(root, entry.target);
  if (!existsSync(example)) { console.log(`MISSING  ${entry.example} (cannot create ${entry.target})`); failed = true; continue; }
  if (existsSync(target)) { console.log(`KEPT     ${entry.target} already exists; not changed`); continue; }
  const generated = [];
  const content = readFileSync(example, "utf8").replace(/^([A-Z0-9_]+)=\s*$/gm, (line, name) => {
    if (!entry.generated.includes(name)) return line;
    generated.push(name);
    return `${name}=${randomBytes(48).toString("base64url")}`;
  });
  try {
    // "wx" fails if the file appeared since the check above, so an existing file can never be overwritten.
    writeFileSync(target, content, { flag: "wx" });
    console.log(`CREATED  ${entry.target} from ${entry.example}${generated.length ? ` (generated random ${generated.length > 1 ? `${generated.slice(0, -1).join(", ")} and ${generated.at(-1)}` : generated[0]})` : ""}`);
  } catch (error) {
    if (error && error.code === "EEXIST") { console.log(`KEPT     ${entry.target} already exists; not changed`); continue; }
    throw error;
  }
}

if (runChecks) {
  console.log("");
  for (const entry of envFiles) {
    const result = checkEnvFile(root, entry);
    if (!result.exists) continue;
    if (!result.problems.length) { console.log(`OK       ${entry.target}: every variable has a valid value`); continue; }
    failed = true;
    console.log(`TODO     ${entry.target}: these variables still need a real value:`);
    for (const problem of result.problems) console.log(`           - ${problem.name}: ${problem.rule}`);
  }
}
process.exitCode = failed ? 1 : 0;
