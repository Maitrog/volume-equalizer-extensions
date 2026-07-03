/// <reference types="node" />

import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const rootDir = __dirname;
const distDir = resolve(rootDir, "dist");

const copyExtensionAssets = (): Plugin => ({
  name: "copy-extension-assets",
  apply: "build",
  async closeBundle() {
    await mkdir(distDir, { recursive: true });

    await Promise.all([
      cp(resolve(rootDir, "manifest.json"), resolve(distDir, "manifest.json")),
      cp(resolve(rootDir, "popup.html"), resolve(distDir, "popup.html")),
      cp(resolve(rootDir, "resources"), resolve(distDir, "resources"), { recursive: true }),
      cp(resolve(rootDir, "_locales"), resolve(distDir, "_locales"), { recursive: true }),
    ]);
  },
});

export default defineConfig({
  plugins: [copyExtensionAssets()],
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        background: resolve(rootDir, "src/app/background/background.ts"),
        popup: resolve(rootDir, "src/app/popup/popup.ts"),
        "content-isolated": resolve(rootDir, "src/app/content-isolated/contentIsolated.ts"),
        "content-main": resolve(rootDir, "src/app/content-main/contentMain.ts"),
      },
      output: {
        entryFileNames: "scripts/[name].js",
        chunkFileNames: "scripts/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
