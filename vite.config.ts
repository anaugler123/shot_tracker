import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["stone.svg"],
      manifest: {
        name: "Hack Curling Shot Tracker",
        short_name: "Hack",
        description: "Curling shot entry, team statistics, and video review",
        theme_color: "#173e35",
        background_color: "#f6f7f4",
        display: "standalone",
        icons: [
          {
            src: "/stone.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5000000,
        globPatterns: ["**/*.{js,css,html,svg}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  server: { host: "0.0.0.0", proxy: { "/api": "http://127.0.0.1:3000" } },
});
