// Shared by setup-env.mjs and doctor.mjs. Plain Node so it runs before anything is built.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

export const envFiles = [
  { app: "api", example: "apps/api/.env.example", target: "apps/api/.env", generated: ["SESSION_SECRET", "OTP_PEPPER"], checker: "apps/api/src/check-env.ts" },
  { app: "web", example: "apps/web/.env.example", target: "apps/web/.env.local", generated: [], checker: "apps/web/scripts/check-env.ts" }
];

/** Runs an app's TypeScript env checker (the same rules the app uses at startup) against one file. Returns names and rules only. */
export function checkEnvFile(repoRoot, entry, targetPath = path.join(repoRoot, entry.target)) {
  const require = createRequire(path.join(repoRoot, "apps/api/package.json"));
  const tsx = require.resolve("tsx/cli");
  const run = spawnSync(process.execPath, [tsx, path.join(repoRoot, entry.checker), targetPath, entry.target], { cwd: path.join(repoRoot, "apps", entry.app), encoding: "utf8", env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
  if (run.status !== 0) return { file: entry.target, exists: true, problems: [{ name: "(checker)", rule: `could not run the env checker: ${(run.stderr || run.error?.message || "unknown error").split("\n")[0]}` }] };
  return JSON.parse(run.stdout.trim().split("\n").pop());
}
