import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// forza un nome di output nuovo, così Vercel non puo servire il vecchio file
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/app-v2-[hash].js",
        chunkFileNames: "assets/chunk-v2-[hash].js",
        assetFileNames: "assets/asset-v2-[hash].[ext]",
      },
    },
  },
});
