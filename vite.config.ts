import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "stone-v3.svg",
        "favicon-v3.png",
        "apple-touch-icon-v3.png",
      ],
      manifest: {
        name: "Hack Curling Shot Tracker",
        short_name: "Hack",
        description: "Curling shot entry, team statistics, and video review",
        theme_color: "#156082",
        background_color: "#f5f6f8",
        display: "standalone",
        icons: [
          {
            src: "/stone-v3-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/stone-v3-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/stone-v3.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5000000,
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  server: { host: "0.0.0.0", proxy: { "/api": "http://127.0.0.1:3000" } },
});
