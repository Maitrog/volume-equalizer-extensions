import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(toolsDir, "..");
const distDir = resolve(rootDir, "dist");

const entries = {
  background: resolve(rootDir, "src/app/background/background.ts"),
  popup: resolve(rootDir, "src/app/popup/popup.ts"),
  "content-isolated": resolve(rootDir, "src/app/content-isolated/contentIsolated.ts"),
  "content-main": resolve(rootDir, "src/app/content-main/contentMain.ts"),
  offscreen: resolve(rootDir, "src/app/offscreen/offscreen.ts"),
};

const expectedEntryFiles = new Set(Object.keys(entries).map((entryName) => `${entryName}.js`));

await rm(distDir, { recursive: true, force: true });
await mkdir(resolve(distDir, "scripts"), { recursive: true });

for (const [entryName, entryPath] of Object.entries(entries)) {
  await build({
    configFile: false,
    root: rootDir,
    build: {
      emptyOutDir: false,
      outDir: distDir,
      target: "es2022",
      cssCodeSplit: false,
      rollupOptions: {
        input: entryPath,
        output: {
          format: "iife",
          entryFileNames: `scripts/${entryName}.js`,
          assetFileNames: "assets/[name][extname]",
        },
      },
    },
  });
}

await Promise.all([
  cp(resolve(rootDir, "manifest.json"), resolve(distDir, "manifest.json")),
  cp(resolve(rootDir, "popup.html"), resolve(distDir, "popup.html")),
  cp(resolve(rootDir, "offscreen.html"), resolve(distDir, "offscreen.html")),
  cp(resolve(rootDir, "resources"), resolve(distDir, "resources"), {
    recursive: true,
  }),
  cp(resolve(rootDir, "_locales"), resolve(distDir, "_locales"), {
    recursive: true,
  }),
]);

const scriptEntries = await readdir(resolve(distDir, "scripts"), {
  withFileTypes: true,
});
const missing = [...expectedEntryFiles].filter(
  (name) => !scriptEntries.some((entry) => entry.isFile() && entry.name === name),
);
if (missing.length > 0) {
  throw new Error(`Missing extension bundles: ${missing.join(", ")}`);
}

const expectedPaths = new Set([...expectedEntryFiles].map((name) => `scripts/${name}`));
const outputEntries = await readdir(distDir, { recursive: true, withFileTypes: true });
const unexpectedScripts = outputEntries
  .filter((entry) => entry.isFile() && /\.[cm]?js$/.test(entry.name))
  .map((entry) => relative(distDir, resolve(entry.parentPath, entry.name)).split(sep).join("/"))
  .filter((name) => !expectedPaths.has(name));

if (unexpectedScripts.length > 0) {
  throw new Error(`Unexpected script bundles emitted: ${unexpectedScripts.join(", ")}`);
}
