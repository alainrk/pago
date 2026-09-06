import { defineConfig, type Plugin } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Emits a Cloudflare `_headers` file into dist/ so the deployed SPA ships a
// Content-Security-Policy that only allows API calls to the configured
// VITE_API_URL origin. The origin is read at build time from the (untracked)
// .env.production.local file, so no deployment detail lives in the repo.
function cloudflareHeaders(apiOrigin: string): Plugin {
  const connect = apiOrigin ? `'self' ${apiOrigin}` : "'self'";
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  const headers = [
    "/*",
    `  Content-Security-Policy: ${csp}`,
    "  X-Content-Type-Options: nosniff",
    "  X-Frame-Options: DENY",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: geolocation=(), microphone=(), camera=()",
    "",
  ].join("\n");
  return {
    name: "pago-cloudflare-headers",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "_headers", source: headers });
    },
  };
}

function originOf(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiOrigin = originOf(env.VITE_API_URL ?? "");
  return {
    plugins: [react(), cloudflareHeaders(apiOrigin)],
    server: {
      port: 5174,
      host: true,
      // In development the API is reached through this proxy so cookies are
      // first-party. Set PAGO_API_PROXY to point at a different backend.
      proxy: {
        "/web": {
          target: process.env.PAGO_API_PROXY ?? "http://localhost:8091",
          changeOrigin: false,
        },
      },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
