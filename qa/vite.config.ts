import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    outDir: "artifacts/qa-build",
    emptyOutDir: true,
    rollupOptions: { input: resolve("qa/performance.html") },
  },
  preview: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3004" },
  },
});
