import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the dashboard calls the API on the same origin, and Vite forwards /api to the
// API server (SPEC REQ-API-08, decision D-20). FLAKEWATCH_API_PROXY overrides the target.
const apiTarget = process.env["FLAKEWATCH_API_PROXY"] ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  // VITE_API_URL comes from the repo's root .env, next to the API's settings.
  envDir: "../..",
  server: {
    port: 5173,
    proxy: { "/api": { target: apiTarget, changeOrigin: false } },
  },
  // The preview server forwards /api the same way, for end-to-end tests (PQ-20).
  preview: { port: 4173, proxy: { "/api": { target: apiTarget, changeOrigin: false } } },
});
