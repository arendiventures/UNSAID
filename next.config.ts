import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / filesystem-heavy packages stay outside the bundler.
  serverExternalPackages: ["better-sqlite3", "pdf-parse"],
  poweredByHeader: false,
  // Uploaded research and generated media are served through authenticated
  // route handlers from ./storage, never from ./public.
  images: { unoptimized: true },
};

export default nextConfig;
