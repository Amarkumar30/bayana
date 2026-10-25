import { defineConfig } from "vitest/config";

// Files run one at a time: integration files share one _test database, and the job tests send every due email in it,
// which must not race other files that are waiting for their own login codes.
// Only the TypeScript sources are tests: `pnpm build` leaves compiled copies under dist/, which vitest 4 no longer skips.
export default defineConfig({ test: { setupFiles: ["./test/setup.ts"], fileParallelism: false, include: ["test/**/*.test.ts"] } });
