import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Disabled: this app is DB-driven throughout (dashboard, worker-run scans,
  // leads, checker) with nothing that benefits from prerendering, and the
  // experimental caching broke live reads/writes in API routes by default.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
