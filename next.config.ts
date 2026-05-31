import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase N (2026-05-31) — Next 16 cross-origin gate for the dev HMR
  // socket. The bot's call-test path tunnels through ngrok, so HMR
  // requests come from the *.ngrok-free.dev hostname instead of
  // localhost. Without this allowlist the dev server logs
  // `Blocked cross-origin request to /_next/webpack-hmr` on every
  // refresh. The wildcard arm covers future tunnel-name rotations so
  // we don't have to edit this file each demo. Production builds
  // ignore this field — it's dev-only.
  allowedDevOrigins: [
    "defection-shorter-salami.ngrok-free.dev",
    "*.ngrok-free.dev",
  ],
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
