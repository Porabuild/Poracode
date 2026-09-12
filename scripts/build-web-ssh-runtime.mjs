import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const modulePath = resolve(root, "dist/main/sshRuntimeBundle.cjs");
const { ensureSshRuntimeBundle } = await import(pathToFileURL(modulePath).href);
const bundle = ensureSshRuntimeBundle({
  mainBundleDir: resolve(root, "dist/main"),
  agentPluginsDir: resolve(root, "resources/agent-plugins"),
  wslHelpersDir: resolve(root, "resources/wsl-helpers"),
  cacheDir: resolve(root, ".tmp/web-ssh-runtime-bundles"),
});
const outDir = resolve(root, "resources/web-ssh-runtime");
mkdirSync(outDir, { recursive: true });
copyFileSync(bundle.archivePath, join(outDir, "runtime.bin"));
writeFileSync(
  join(outDir, "manifest.json"),
  `${JSON.stringify({ hash: bundle.hash, archive: "runtime.bin" }, null, 2)}\n`,
  "utf8",
);
console.log(`[build-web-ssh-runtime] embedded ${bundle.hash}`);
