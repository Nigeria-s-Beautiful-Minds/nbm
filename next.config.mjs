import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV !== "production";

// Exhibition media lives in Cloudflare R2 when configured (see lib/storage.ts), a third-party
// origin, so the CSP names it explicitly: uploads PUT to it directly (connect-src) and the media
// route's redirect sends <img>/<video> there too (img-src/media-src). The AWS SDK signs R2 URLs
// virtual-hosted style, so the CSP wildcards every bucket subdomain under the account. Without R2
// (local development) media is served by this app itself. Live audio (lib/livekit.ts) opens a
// WebSocket to LiveKit Cloud.
const r2Origin = process.env.R2_ENDPOINT ? process.env.R2_ENDPOINT.replace(/\/$/, "").replace("https://", "https://*.") : "";
const livekitOrigin = (process.env.LIVEKIT_URL || "").replace(/^wss:/, "https:").replace(/\/$/, "");
// LiveKit Cloud hands clients off to regional hosts under the same project domain.
const livekitWildcard = livekitOrigin.includes(".livekit.cloud") ? " https://*.livekit.cloud wss://*.livekit.cloud" : "";

// 'unsafe-inline' is required today: Next.js hydration bootstrap scripts are inline. A nonce-based
// script-src would force every route to render dynamically, so it is left as a follow-up.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob:${r2Origin ? " " + r2Origin : ""}`,
  `media-src 'self' blob:${r2Origin ? " " + r2Origin : ""}`,
  `connect-src 'self'${r2Origin ? " " + r2Origin : ""}${livekitOrigin ? ` ${livekitOrigin} ${livekitOrigin.replace("https:", "wss:")}${livekitWildcard}` : ""}${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // The microphone is allowed for this origin only: speakers in Discussion audio rooms need it.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  }
};

export default nextConfig;
