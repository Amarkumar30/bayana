import type { NextConfig } from "next";
import { loadWebEnv } from "./env-schema";

// Fail `next dev` and `next build` early, with variable names only, when the public env is missing or invalid.
try { loadWebEnv(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid web environment"}\n`); process.exit(1); }
const nextConfig: NextConfig = { reactStrictMode: true };
export default nextConfig;
