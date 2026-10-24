import { defineConfig } from "vitest/config";

// Files run one at a time: integration files share one _test database, and the job tests send every due email in it,
// which must not race other files that are waiting for their own login codes.
export default defineConfig({ test: { setupFiles: ["./test/setup.ts"], fileParallelism: false } });
