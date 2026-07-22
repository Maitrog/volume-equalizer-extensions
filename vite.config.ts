/// <reference types="node" />

import { cp, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const rootDir = __dirname;
const distDir = resolve(rootDir, "dist");

const entries = {
  background: resolve(rootDir, "src/app/background/background.ts"),
  popup: resolve(rootDir, "src/app/popup/popup.ts"),
  "content-isolated": resolve(rootDir, "src/app/content-isolated/contentIsolated.ts"),
  "content-main": resolve(rootDir, "src/app/content-main/contentMain.ts"),
} as const;

const expectedEntryFiles = new Set(Object.keys(entries).map((entryName) => `${entryName}.js`));

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
      cp(resolve(rootDir, "scripts"), resolve(distDir, "scripts"), { recursive: true }),
    ]);

    const scriptEntries = await readdir(resolve(distDir, "scripts"), { withFileTypes: true });
    const unexpectedRootScripts = scriptEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".js") && !expectedEntryFiles.has(entry.name))
      .map((entry) => entry.name);

    if (unexpectedRootScripts.length > 0) {
      throw new Error(`Unexpected top-level script bundles emitted: ${unexpectedRootScripts.join(", ")}`);
    }
  },
});

const failOnUnexpectedJsBundles = (): Plugin => ({
  name: "fail-on-unexpected-js-bundles",
  apply: "build",
  generateBundle(_options, bundle) {
    const unexpectedBundles = Object.entries(bundle)
      .filter(([fileName, output]) => output.type === "chunk" && !expectedEntryFiles.has(fileName.replace(/^scripts\//, "")))
      .map(([fileName]) => fileName);

    if (unexpectedBundles.length > 0) {
      throw new Error(`Unexpected script bundles emitted: ${unexpectedBundles.join(", ")}`);
    }
  },
});

export default defineConfig({
  plugins: [failOnUnexpectedJsBundles(), copyExtensionAssets()],
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: entries,
      output: {
        entryFileNames: "scripts/[name].js",
        chunkFileNames: "scripts/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
