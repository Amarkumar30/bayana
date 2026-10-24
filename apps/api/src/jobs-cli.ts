import { pool } from "./database.js";
import { runNightly, runTick } from "./jobs.js";

// pnpm.cmd jobs:tick | jobs:nightly -- runs the scheduled jobs once, in process, against DATABASE_URL (local use; deployed
// environments are called over HTTP by .github/workflows/tick.yml and nightly.yml). Recorded in job_runs as "manual".
const kind = process.argv[2];
if (kind !== "tick" && kind !== "nightly") { process.stderr.write("Usage: tsx src/jobs-cli.ts tick|nightly\n"); process.exit(2); }
try {
  const result = kind === "tick" ? await runTick("manual") : await runNightly("manual");
  for (const item of result.results) process.stdout.write(`${item.status === "ok" ? "OK  " : "FAIL"} ${JSON.stringify(item)}\n`);
  // Give the urgent-mail kick a moment to finish before the pool closes.
  await new Promise(resolve => setTimeout(resolve, 1500));
  process.exitCode = result.ok ? 0 : 1;
} finally { await pool.end(); }
