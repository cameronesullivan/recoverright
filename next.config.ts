import type { NextConfig } from "next";

/**
 * The browser may only make network requests to this site. That keeps camera
 * tracking fully local: the MediaPipe model and WebAssembly files load from
 * /public, and MediaPipe's built-in usage-metrics upload to Google is blocked.
 * All OpenAI calls happen on the server, so they aren't affected.
 * Development also needs WebSockets for hot reloading.
 */
const isDev = process.env.NODE_ENV === "development";
const connectSrc = ["'self'", "data:", "blob:", ...(isDev ? ["ws:", "wss:"] : [])].join(" ");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: `connect-src ${connectSrc}` }],
      },
    ];
  },
};

export default nextConfig;
