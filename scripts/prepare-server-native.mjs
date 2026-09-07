import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const betterSqliteRoot = dirname(require.resolve("better-sqlite3/package.json"));
const platform =
  process.platform === "linux" && !process.report.getReport().header.glibcVersionRuntime
    ? "linuxmusl"
    : process.platform;
const binding = join(betterSqliteRoot, "prebuilds", `${platform}-${process.arch}.node`);
const outputDir = join(repoRoot, "dist", "server-native");
const outputFile = join(outputDir, "better_sqlite3.node");

// Validate the installed binary before replacing any previous-generation artifact.
const Database = require("better-sqlite3");
new Database(":memory:", { nativeBinding: binding }).close();
mkdirSync(outputDir, { recursive: true });
copyFileSync(binding, outputFile);
console.log(`[poracode-server] prepared better-sqlite3 N-API binding: ${outputFile}`);
