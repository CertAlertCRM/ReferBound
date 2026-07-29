/** @type {import('next').NextConfig} */
const securityHeaders = [
  // MIME sniffing off — files are served as their declared type only.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No embedding ReferBound (or partner portals) in other sites' iframes.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Don't leak full URLs (magic-link tokens live in paths!) to external sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // We use none of these — say so explicitly.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HTTPS always, remembered by the browser for two years.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
