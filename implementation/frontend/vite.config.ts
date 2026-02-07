import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    allowedHosts: ["datachatdata.com"],
    proxy: {
      "/auth": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/conversations": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/usage": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/ws": {
        target: API_TARGET,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
