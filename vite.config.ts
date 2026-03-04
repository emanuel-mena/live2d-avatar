import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "Live2DAvatar",
      formats: ["iife"],
      fileName: () => "live2d-avatar.min.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
});