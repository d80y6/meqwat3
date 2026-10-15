import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Baseline CSP: allow self, inline styles (Next), images/data, fonts, and Recharts inline.
    // Adjust `connect-src` if you add external analytics.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Keep builds strict — fail on TS or lint errors in CI.
  poweredByHeader: false,
  allowedDevOrigins: ["*.e2b.app"],
  async headers() {
    return [
      {
        source: "/:path*",
        // Explicit sandbox opt-in only; production retains anti-framing headers.
        headers: process.env.ARENA_PREVIEW === "1"
          ? securityHeaders.filter(h => h.key !== "X-Frame-Options").map(h => h.key === "Content-Security-Policy"
              ? { ...h, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors https://*.arena.ai https://arena.ai https://*.e2b.app") } : h)
          : securityHeaders,
      },
      {
        // Never cache auth endpoints or pages that carry tenant data.
        source: "/api/auth/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
