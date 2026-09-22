/**
 * Build, tool, plugin, deploy, test and native root discovery.
 *
 * Finds the real entry points of the repository: tsdown build entries and runtime
 * declarations, package/workflow tool scripts, provider plugin assets, deployed
 * helper references, literal test process entries and native project references.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SyntaxKind as K } from "typescript/unstable/ast";
import { WORKER_NAME_PATTERN, isTestFile, toPosix } from "./paths.mjs";
import { isLiteralLike, tokenizeSource } from "./scanner.mjs";

function readTextIfExists(rootDir, relativePath) {
  const path = resolve(rootDir, relativePath);
  if (!existsSync(path)) return undefined;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

export function collectBuildEntries(rootDir) {
  const configText = readTextIfExists(rootDir, "tsdown.config.ts");
  const entries = new Map();
  const manifestEntries = [];
  if (configText) {
    const tokens = tokenizeSource(configText, { jsx: false });
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (
        token.kind === K.Identifier &&
        token.text === "entry" &&
        tokens[index + 1]?.kind === K.ColonToken
      ) {
        const open = index + 2;
        if (tokens[open]?.kind === K.OpenBraceToken) {
          let cursor = open + 1;
          while (cursor < tokens.length && tokens[cursor].kind !== K.CloseBraceToken) {
            const key = tokens[cursor];
            if (
              (key.kind === K.Identifier || isLiteralLike(key)) &&
              tokens[cursor + 1]?.kind === K.ColonToken &&
              isLiteralLike(tokens[cursor + 2])
            ) {
              const name = key.value ?? key.text;
              entries.set(name, {
                name,
                path: tokens[cursor + 2].value,
                kind: WORKER_NAME_PATTERN.test(name) ? "worker" : "app",
                source: "tsdown.config.ts",
              });
              cursor += 3;
              continue;
            }
            cursor++;
          }
        }
      }
      if (
        token.kind === K.Identifier &&
        token.text === "runtimeDeclaration" &&
        tokens[index + 1]?.kind === K.OpenParenToken &&
        isLiteralLike(tokens[index + 2])
      ) {
        manifestEntries.push({
          entryPath: tokens[index + 2].value,
          manifestEntry: isLiteralLike(tokens[index + 4]) ? tokens[index + 4].value : undefined,
        });
      }
    }
  }

  const manifestNames = [];
  const manifestText = readTextIfExists(rootDir, "src/shared/sshRuntimeManifest.ts");
  if (manifestText) {
    const tokens = tokenizeSource(manifestText, { jsx: false });
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (
        token.kind === K.Identifier &&
        token.text === "SSH_RUNTIME_ENTRY_CONFIG" &&
        tokens[index + 1]?.text === "=" &&
        tokens[index + 2]?.kind === K.OpenBraceToken
      ) {
        let cursor = index + 3;
        while (cursor < tokens.length && tokens[cursor].kind !== K.CloseBraceToken) {
          if (tokens[cursor].kind === K.Identifier && tokens[cursor + 1]?.kind === K.ColonToken) {
            manifestNames.push(tokens[cursor].text);
          }
          cursor++;
        }
      }
    }
  }

  return {
    entries: [...entries.values()].sort((left, right) => left.path.localeCompare(right.path)),
    manifestEntries,
    manifestNames,
  };
}

function collectReferencedScripts(text) {
  const found = new Set();
  for (const match of text.matchAll(
    /(?:node\s+|pnpm\s+exec\s+|pnpm\s+run\s+)([\w./-]+\.(?:mjs|cjs|js))/gu,
  )) {
    found.add(match[1]);
  }
  for (const match of text.matchAll(/(?:^|\s)(scripts\/[\w./-]+\.(?:mjs|cjs|js))/gmu)) {
    found.add(match[1]);
  }
  return [...found];
}

export function collectToolRoots(rootDir) {
  const roots = new Map();
  const add = (relativePath, source) => {
    if (!relativePath) return;
    roots.set(relativePath, { path: relativePath, source });
  };

  const packageText = readTextIfExists(rootDir, "package.json");
  if (packageText) {
    try {
      const manifest = JSON.parse(packageText);
      for (const command of Object.values(manifest.scripts ?? {})) {
        for (const script of collectReferencedScripts(String(command))) add(script, "package.json");
      }
    } catch {
      /* ignored */
    }
  }
  const workflowsDir = resolve(rootDir, ".github/workflows");
  if (existsSync(workflowsDir)) {
    for (const entry of readdirSync(workflowsDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const text = readTextIfExists(rootDir, `.github/workflows/${entry.name}`) ?? "";
      for (const script of collectReferencedScripts(text)) {
        add(script, `.github/workflows/${entry.name}`);
      }
    }
  }
  // Every script is a tool root: scripts are executable entry points even when
  // only a human runs them.
  const scriptsDir = resolve(rootDir, "scripts");
  if (existsSync(scriptsDir)) {
    for (const entry of readdirSync(scriptsDir, { withFileTypes: true })) {
      if (entry.isFile() && /\.(?:mjs|cjs|js)$/u.test(entry.name) && !isTestFile(entry.name)) {
        add(`scripts/${entry.name}`, "scripts");
      }
    }
  }
  return [...roots.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function collectConfigRoots(rootDir) {
  return [
    "vite.config.ts",
    "tsdown.config.ts",
    "vitest.config.ts",
    "vitest.integration.config.ts",
    "vitest.perf.config.ts",
    "lingui.config.ts",
  ]
    .filter((path) => existsSync(resolve(rootDir, path)))
    .map((path) => ({ path }));
}

/**
 * Provider plugin entry assets are discovered at runtime by directory scan
 * (`discoverAgentPluginSources`), so no static import exists. Derive the roots
 * from the same authority (`agentPluginAssetSources.ts`) and from the presence
 * of each provider's `plugin.json`.
 */
export function collectPluginRoots(rootDir) {
  const roots = [];
  const sharedText = readTextIfExists(rootDir, "src/shared/agentPluginAssetSources.ts");
  const assets = new Set();
  if (sharedText) {
    const tokens = tokenizeSource(sharedText, { jsx: false });
    for (let index = 0; index < tokens.length; index++) {
      if (
        tokens[index].kind === K.Identifier &&
        tokens[index].text === "PROVIDER_RUNTIME_ASSETS" &&
        tokens[index + 1]?.text === "=" &&
        tokens[index + 2]?.kind === K.OpenBracketToken
      ) {
        for (
          let cursor = index + 3;
          cursor < tokens.length && tokens[cursor].kind !== K.CloseBracketToken;
          cursor++
        ) {
          if (isLiteralLike(tokens[cursor])) assets.add(tokens[cursor].value);
        }
      }
    }
  }
  const agentsDir = resolve(rootDir, "src/supervisor/agents");
  if (existsSync(agentsDir)) {
    for (const entry of readdirSync(agentsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pluginDir = join(agentsDir, entry.name, "plugin");
      if (!existsSync(join(pluginDir, "plugin.json"))) continue;
      for (const asset of assets) {
        const path = join(pluginDir, asset);
        if (existsSync(path)) {
          roots.push({
            path: toPosix(relative(rootDir, path)),
            source: `plugin.json:${entry.name}`,
          });
        }
      }
    }
  }
  const forwardRuntimeDir = join(agentsDir, "plugin", "forward-runtime");
  if (existsSync(forwardRuntimeDir)) {
    for (const entry of readdirSync(forwardRuntimeDir, { withFileTypes: true })) {
      if (entry.isFile() && /\.(?:mjs|cjs|js)$/u.test(entry.name)) {
        roots.push({
          path: toPosix(relative(rootDir, join(forwardRuntimeDir, entry.name))),
          source: "agentPluginAssetSources.ts:shared-runtime",
        });
      }
    }
  }
  return roots.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Tool scripts copy or import deployed helpers by path (for example the WSL
 * bridge and child-process registers). Record those references as deploy roots
 * so reachability does not mistake a deployed entry point for dead code.
 */
function isGraphSourceReference(rootDir, candidate) {
  if (!existsSync(candidate)) return false;
  try {
    if (!statSync(candidate).isFile()) return false;
  } catch {
    return false;
  }
  const relativePath = toPosix(relative(rootDir, candidate));
  if (relativePath.startsWith("..") || relativePath.startsWith("/")) return false;
  return /^(?:src|scripts)\//u.test(relativePath);
}

const ANALYZER_PATH = fileURLToPath(new URL("../architecture-imports.mjs", import.meta.url));

export function collectDeployReferences(rootDir) {
  const references = [];
  const scriptsDir = resolve(rootDir, "scripts");
  if (!existsSync(scriptsDir)) return references;
  for (const entry of readdirSync(scriptsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:mjs|cjs|js)$/u.test(entry.name)) continue;
    if (isTestFile(entry.name)) continue;
    const scriptPath = join(scriptsDir, entry.name);
    if (scriptPath === ANALYZER_PATH) continue;
    const text = readFileSync(scriptPath, "utf8");
    for (const match of text.matchAll(
      /join\(\s*[\w$.]+\s*,\s*((?:"[^"]+"\s*,\s*)*"[^"]+")\s*\)/gu,
    )) {
      const segments = [...match[1].matchAll(/"([^"]+)"/gu)].map((part) => part[1]);
      const candidate = resolve(rootDir, segments.join("/"));
      if (isGraphSourceReference(rootDir, candidate)) {
        references.push({
          source: `scripts/${entry.name}`,
          path: toPosix(relative(rootDir, candidate)),
        });
      }
    }
    for (const match of text.matchAll(
      /["']((?:src|scripts)\/[\w./-]+\.(?:[cm]?[jt]s|json|node))["']/gu,
    )) {
      if (isGraphSourceReference(rootDir, resolve(rootDir, match[1]))) {
        references.push({ source: `scripts/${entry.name}`, path: match[1] });
      }
    }
  }
  return references.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Test process entry points are named by literal source paths inside test
 * files (for example `resolve("src/backend/...register.mjs")`). Record them as
 * reference roots for reachability without polluting the import graph with
 * arbitrary string literals.
 */
export function collectTestEntryReferences(rootDir, testFileIds = []) {
  const references = [];
  for (const id of testFileIds) {
    const absolutePath = resolve(rootDir, id);
    if (!existsSync(absolutePath)) continue;
    let text;
    try {
      text = readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }
    for (const match of text.matchAll(/["']((?:src|scripts)\/[\w./-]+\.(?:mjs|cjs|node))["']/gu)) {
      const target = resolve(rootDir, match[1]);
      if (!existsSync(target)) continue;
      try {
        if (!statSync(target).isFile()) continue;
      } catch {
        continue;
      }
      references.push({ source: id, path: match[1] });
    }
  }
  return references.sort(
    (left, right) => left.path.localeCompare(right.path) || left.source.localeCompare(right.source),
  );
}

export function collectNativeReferences(rootDir) {
  const references = [];
  const pbxproj = resolve(rootDir, "ios/App/App.xcodeproj/project.pbxproj");
  if (existsSync(pbxproj)) {
    const text = readFileSync(pbxproj, "utf8");
    for (const match of text.matchAll(/path = ([^;]+);/gu)) {
      const value = match[1].trim();
      if (!value.startsWith("..")) continue;
      const target = resolve(dirname(pbxproj), value);
      references.push({
        source: "ios/App/App.xcodeproj/project.pbxproj",
        reference: value,
        resolved: toPosix(relative(rootDir, target)),
        exists: existsSync(target),
      });
    }
  }
  const gradleFiles = [
    "android/app/build.gradle",
    "android/app/build.gradle.kts",
    "android/build.gradle",
  ];
  for (const gradle of gradleFiles) {
    const path = resolve(rootDir, gradle);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(/["']([^"']*\.\.\/[^"']+)["']/gu)) {
      const target = resolve(dirname(path), match[1]);
      references.push({
        source: gradle,
        reference: match[1],
        resolved: toPosix(relative(rootDir, target)),
        exists: existsSync(target),
      });
    }
  }
  const packagingDir = resolve(rootDir, "packaging");
  if (existsSync(packagingDir)) {
    for (const entry of readdirSync(packagingDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const text = readFileSync(join(packagingDir, entry.name), "utf8");
      for (const match of text.matchAll(/(?:scripts|src|packaging)\/[\w./-]+/gu)) {
        references.push({
          source: `packaging/${entry.name}`,
          reference: match[0],
          resolved: match[0],
          exists: existsSync(resolve(rootDir, match[0])),
        });
      }
    }
  }
  return references;
}
