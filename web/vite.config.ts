import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";

const APP_VERSION = process.env.PN_BUILD ?? (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "dev"; } })();

// API base: dev proxies /api → FastAPI on :8000; the Docker nginx image does the same.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["geo/imd_subdivisions.geojson", "icon.svg"],
      manifest: {
        name: "PURVA-NETRA · Forecast Trust Console",
        short_name: "PURVA-NETRA",
        description: "Know when to trust the forecast.",
        theme_color: "#1a1a19",
        background_color: "#1a1a19",
        display: "standalone",
        start_url: "/brief",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,geojson,json,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: { cacheName: "api", networkTimeoutSeconds: 3, expiration: { maxEntries: 800 } },
          },
        ],
      },
    }),
  ],
  worker: { format: "es" },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 5173, proxy: { "/api": { target: process.env.PN_API ?? "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") } } },
  preview: { port: 5173, proxy: { "/api": { target: process.env.PN_API ?? "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") } } },
});
