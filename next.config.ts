import type { NextConfig } from "next";

/*
 * `cacheComponents` (enabled by the scaffold) is intentionally off: the page
 * is a single client-driven experience with no cached server data, and that
 * mode rejects Redux's internal non-deterministic initialisation during
 * prerendering.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
