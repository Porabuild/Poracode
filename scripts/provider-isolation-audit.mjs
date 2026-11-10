#!/usr/bin/env node
/**
 * Provider-isolation ratchet (AGENTS.md "Shared code is provider-agnostic").
 *
 * Counts string literals that are exactly a provider id (`"codex"`, `'qwen'`)
 * in shared runtime, UI and host code, i.e. everything outside the provider
 * folders. Existing uses are recorded in `provider-isolation-baseline.json`;
 * the audit fails when a file gains uses or a new file starts using them, and
 * reports files whose debt shrank so the baseline can be lowered with
 * `--update`. Provider ids are the folders that exist both as a supervisor
 * adapter and as a renderer provider plugin, so a new provider is covered
 * without editing this script.
 *
 * Usage: node scripts/provider-isolation-audit.mjs [--update] [--root <dir>]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCANNED_ROOTS = ["src"];
const PROVIDER_TERRITORY = [
  "src/supervisor/agents/",
  "src/renderer/components/providers/",
  "src/shared/agents/",
  "src/renderer/locales/",
];
const SOURCE_FILE = /\.(?:ts|tsx|mts|mjs)$/u;
const EXCLUDED_FILE = /(?:\.test\.|\.d\.ts$|\/(?:__fixtures__|fixtures|generated)\/)/u;

export function providerIds(root) {
  const directories = (path) =>
    new Set(
      readdirSync(join(root, path), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    );
  const renderer = directories("src/renderer/components/providers");
  return [...directories("src/supervisor/agents")]
    .filter((name) => renderer.has(name) && /^[a-z][a-z0-9]*$/u.test(name))
    .sort();
}

function sourceFiles(root, directory, files = []) {
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (PROVIDER_TERRITORY.some((prefix) => `${path}/`.startsWith(prefix))) continue;
    if (entry.isDirectory()) sourceFiles(root, path, files);
    else if (SOURCE_FILE.test(entry.name) && !EXCLUDED_FILE.test(path)) files.push(path);
  }
  return files;
}

export function countProviderLiterals(root, ids = providerIds(root)) {
  const literal = new RegExp(`(["'\`])(?:${ids.join("|")})\\1`, "gu");
  const counts = {};
  for (const scanned of SCANNED_ROOTS) {
    for (const file of sourceFiles(root, scanned)) {
      const matches = readFileSync(join(root, file), "utf8").match(literal);
      if (matches) counts[file.split(sep).join("/")] = matches.length;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function compareToBaseline(current, baseline) {
  const regressions = [];
  const improvements = [];
  for (const [file, count] of Object.entries(current)) {
    const allowed = baseline[file] ?? 0;
    if (count > allowed) regressions.push({ file, count, allowed });
    else if (count < allowed) improvements.push({ file, count, allowed });
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    if (!(file in current)) improvements.push({ file, count: 0, allowed });
  }
  return { regressions, improvements };
}

export function main(argv = process.argv.slice(2)) {
  const rootIndex = argv.indexOf("--root");
  const root = resolve(
    rootIndex >= 0 ? argv[rootIndex + 1] : fileURLToPath(new URL("..", import.meta.url)),
  );
  const baselinePath = join(root, "scripts/provider-isolation-baseline.json");
  const current = countProviderLiterals(root);
  if (argv.includes("--update")) {
    writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
    process.stdout.write(
      `provider-isolation: baseline updated (${Object.keys(current).length} files)\n`,
    );
    return 0;
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const { regressions, improvements } = compareToBaseline(current, baseline);
  for (const { file, count, allowed } of improvements) {
    process.stdout.write(
      `provider-isolation: ${file} dropped to ${count} (baseline ${allowed}); run with --update\n`,
    );
  }
  if (regressions.length === 0) {
    process.stdout.write("provider-isolation: no new provider literals in shared code\n");
    return 0;
  }
  for (const { file, count, allowed } of regressions) {
    process.stderr.write(
      `provider-isolation: ${file} has ${count} provider-id literal(s), baseline allows ${allowed}. ` +
        "Move provider behavior behind a named capability declared in the provider folder " +
        "(.agents/docs/agent-adapters.md#provider-isolation--hard-rules).\n",
    );
  }
  return 1;
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) process.exitCode = main();
