/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native addon: never bundle it through webpack/turbopack.
  serverExternalPackages: ["better-sqlite3"],
  // Keep tracing inside this project even if a stray lockfile exists above it.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
