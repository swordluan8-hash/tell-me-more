import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  distDir: process.env.TMM_E2E === "1" ? ".next-e2e" : ".next",
  turbopack: { root: path.resolve(import.meta.dirname, "..") },
  poweredByHeader: false,
};
export default config;
