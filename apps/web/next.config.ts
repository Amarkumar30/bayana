import type { NextConfig } from "next";
import { loadWebEnv } from "./env-schema";

// Fail `next dev` and `next build` early, with variable names only, when the public env is missing or invalid.
try { loadWebEnv(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid web environment"}\n`); process.exit(1); }
// The dev indicator floats over page content and would leak into screenshot baselines.
// next dev keeps only 5 compiled pages by default; with ~25 routes under parallel tests it keeps disposing and
// recompiling them, and each recompile hot-swaps CSS under open pages. Dev-only; ignored by next build/start.
const nextConfig: NextConfig = { reactStrictMode: true, devIndicators: false, onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 100 } };
export default nextConfig;
