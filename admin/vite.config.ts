import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL("../admin-worker/dist", import.meta.url)),
    emptyOutDir: true,
  },
});
