import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The KB markdown and recorded fixtures are read from disk at runtime by the API route.
  outputFileTracingIncludes: {
    "/api/triage": ["./data/kb/**/*.md", "./fixtures/**/*.json"],
  },
};

export default nextConfig;
