import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without it Turbopack walks up past the repository
  // and infers a root from a stray package-lock.json in the home directory,
  // which changes how modules resolve depending on whose machine it is.
  turbopack: { root: path.join(__dirname) },
  async redirects() {
    // Saved links reach the same functionality inside the consolidated screens.
    // Next.js carries the original query parameters into the destination.
    return [
      { source: "/map", destination: "/issues?view=map", permanent: false },
      { source: "/me/profile", destination: "/me/settings", permanent: false },
      { source: "/me/security", destination: "/me/settings?tab=security", permanent: false },
      { source: "/staff/queue", destination: "/work?view=mine", permanent: false },
      { source: "/staff/issues/:id", destination: "/work?view=mine&issue=:id", permanent: false },
      { source: "/supervisor/review", destination: "/work?view=review", permanent: false },
      { source: "/supervisor/analytics", destination: "/work?view=performance", permanent: false },
      { source: "/supervisor/queue", has: [{ type: "query", key: "view", value: "review" }], destination: "/work?view=review", permanent: false },
      { source: "/supervisor/queue", has: [{ type: "query", key: "view", value: "analytics|performance" }], destination: "/work?view=performance", permanent: false },
      { source: "/supervisor/queue", has: [{ type: "query", key: "view", value: "mine" }], destination: "/work?view=mine", permanent: false },
      { source: "/supervisor/queue", destination: "/work?view=assignments", permanent: false },
      { source: "/admin/configuration", destination: "/admin", permanent: false },
      { source: "/admin/audit", destination: "/admin?view=audit", permanent: false },
    ];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    }];
  },
};

export default nextConfig;
