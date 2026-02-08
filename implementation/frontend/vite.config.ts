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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          "react-vendor": ["react", "react-dom"],
          "query-vendor": ["@tanstack/react-query"],
          "codemirror-vendor": ["@codemirror/lang-sql", "@codemirror/state", "@codemirror/view"],
          "markdown-vendor": ["react-markdown"],
        },
      },
    },
    // Enable CSS code splitting for better caching
    cssCodeSplit: true,
    // Optimize chunk size warnings (default is 500kb)
    chunkSizeWarningLimit: 600,
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
