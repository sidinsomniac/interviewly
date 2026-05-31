import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase J fix — the dev webpack watcher (we're on `next dev --webpack`
  // since Phase J) was treating data/output/interviews.json writes as
  // source changes. Each persist tick → recompile → fresh worker process
  // → re-import store.ts → restoreSchedules() spam. Excluding data/
  // (and explicitly node_modules/ as belt-and-braces) breaks the loop.
  // Phase L (2026-05-31) additionally moved runtime writes to ~/.medha
  // entirely, but the ignore stays as belt-and-braces — data/templates/
  // and data/fixtures/ still live in the repo (read-only assets).
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        ...(Array.isArray(config.watchOptions?.ignored) ? config.watchOptions.ignored : []),
        "**/data/**",
        "**/node_modules/**",
      ],
    };
    return config;
  },
};

export default nextConfig;
