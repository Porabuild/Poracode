/**
 * Specifier resolution, glob expansion and source discovery.
 *
 * Resolves aliases, relative paths, workspace packages, extensionless barrels and
 * builtins, expands import.meta.glob patterns, and walks the repository for graph
 * source files. Uses the real filesystem; no bundler metadata.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, extname, join, relative, resolve } from "node:path";
import {
  GRAPH_EXTENSIONS,
  NON_SOURCE_PATTERN,
  RESOLUTION_EXTENSIONS,
  toPosix,
  uniqueSorted,
} from "./paths.mjs";

function packageNameFor(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function resolveFileCandidate(basePath) {
  if (existsSync(basePath)) {
    try {
      if (statSync(basePath).isFile()) return basePath;
    } catch {
      /* fall through */
    }
  }
  const extension = extname(basePath).toLowerCase();
  const mapped =
    extension === ".js"
      ? [".ts", ".tsx"]
      : extension === ".mjs"
        ? [".mts"]
        : extension === ".cjs"
          ? [".cts"]
          : [];
  for (const candidate of mapped) {
    const stem = basePath.slice(0, -extension.length);
    if (existsSync(stem + candidate)) return stem + candidate;
  }
  if (!RESOLUTION_EXTENSIONS.includes(extension)) {
    // Extensionless paths (and names with dots that are not extensions, such
    // as `runtimeItems.testFixtures`) resolve by appending a known extension.
    for (const candidate of RESOLUTION_EXTENSIONS) {
      if (existsSync(basePath + candidate)) return basePath + candidate;
    }
  }
  if (existsSync(basePath)) {
    try {
      if (!statSync(basePath).isDirectory()) return undefined;
    } catch {
      return undefined;
    }
    for (const candidate of RESOLUTION_EXTENSIONS) {
      const indexFile = join(basePath, `index${candidate}`);
      if (existsSync(indexFile)) return indexFile;
    }
  }
  return undefined;
}

function readWorkspacePackages(rootDir) {
  const packages = new Map();
  const packagesDir = join(rootDir, "packages");
  if (!existsSync(packagesDir)) return packages;
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(packagesDir, entry.name, "package.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (typeof manifest.name !== "string") continue;
      const exported = manifest.exports?.["."] ?? manifest.exports;
      const entryPoint =
        (typeof exported === "string" ? exported : exported?.default) ??
        manifest.main ??
        "src/index.ts";
      packages.set(manifest.name, {
        name: manifest.name,
        directory: join(packagesDir, entry.name),
        entry: resolve(
          join(packagesDir, entry.name),
          typeof entryPoint === "string" ? entryPoint : "src/index.ts",
        ),
        exports: manifest.exports ?? {},
      });
    } catch {
      /* ignore malformed workspace manifests */
    }
  }
  return packages;
}

export function createResolver(options) {
  const rootDir = resolve(options.rootDir);
  const workspacePackages = options.workspacePackages ?? readWorkspacePackages(rootDir);

  function resolveSubpath(pkg, subpath) {
    const key = subpath === "" ? "." : `./${subpath}`;
    const mapping = pkg.exports?.[key];
    const target =
      typeof mapping === "string"
        ? mapping
        : (mapping?.types ?? mapping?.default ?? mapping?.import ?? undefined);
    if (typeof target !== "string") return undefined;
    return resolveFileCandidate(resolve(pkg.directory, target));
  }

  return {
    rootDir,
    workspacePackages,
    resolve(specifier, fromFile) {
      if (typeof specifier !== "string" || specifier.length === 0) {
        return { kind: "unresolved", reason: "empty-specifier" };
      }
      const queryIndex = specifier.indexOf("?");
      const query = queryIndex >= 0 ? specifier.slice(queryIndex) : undefined;
      const bare = queryIndex >= 0 ? specifier.slice(0, queryIndex) : specifier;
      const base = { query };

      if (bare.startsWith("node:") || isBuiltin(bare)) {
        return { ...base, kind: "builtin", id: `node:${bare.replace(/^node:/u, "")}` };
      }
      if (bare.startsWith("@/")) {
        const target = resolveFileCandidate(join(rootDir, "src", bare.slice(2)));
        return target
          ? { ...base, kind: "file", path: target }
          : { ...base, kind: "unresolved", reason: "unresolved-alias" };
      }
      if (bare.startsWith("src/") || bare.startsWith("scripts/")) {
        const target = resolveFileCandidate(join(rootDir, bare));
        return target
          ? { ...base, kind: "file", path: target }
          : { ...base, kind: "unresolved", reason: "unresolved-root-relative" };
      }
      if (bare.startsWith(".") || bare.startsWith("/")) {
        const target = resolveFileCandidate(resolve(dirname(fromFile), bare));
        return target
          ? { ...base, kind: "file", path: target }
          : { ...base, kind: "unresolved", reason: "unresolved-relative" };
      }

      const packageName = packageNameFor(bare);
      const workspace = workspacePackages.get(packageName);
      if (workspace) {
        if (bare === packageName) {
          if (existsSync(workspace.entry)) {
            return { ...base, kind: "file", path: workspace.entry, workspace: packageName };
          }
        } else {
          const target = resolveSubpath(workspace, bare.slice(packageName.length + 1));
          if (target) return { ...base, kind: "file", path: target, workspace: packageName };
        }
      }
      return {
        ...base,
        kind: "external",
        packageName,
        id: packageName,
        workspace: workspace ? packageName : undefined,
      };
    },
  };
}

export function discoverSourceFiles(options) {
  const rootDir = resolve(options.rootDir);
  const include = options.include ?? ["src", "scripts", "packages", "protocol", "tests"];
  const extraFiles = options.extraFiles ?? [];
  const files = new Set();
  const visitedDirs = new Set();

  const walk = (directory) => {
    if (visitedDirs.has(directory)) return;
    visitedDirs.add(directory);
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (NON_SOURCE_PATTERN.test(toPosix(relative(rootDir, path)))) continue;
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!GRAPH_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      files.add(path);
    }
  };

  for (const entry of include) {
    const path = resolve(rootDir, entry);
    if (!existsSync(path)) continue;
    if (statSync(path).isDirectory()) walk(path);
    else files.add(path);
  }
  for (const path of extraFiles) {
    if (existsSync(path)) files.add(resolve(rootDir, path));
  }
  return [...files].sort();
}

/** Expand `./x/<dir>/file.ts`-style patterns used by `import.meta.glob`. */
export function expandGlob(pattern) {
  const normalized = toPosix(pattern).replace(/\/\.\//gu, "/");
  const segments = normalized.split("/");
  const firstGlob = segments.findIndex((segment) => segment.includes("*"));
  if (firstGlob < 0) {
    const matches = [];
    pushFileCandidate(normalized, matches);
    return uniqueSorted(matches);
  }
  const directory = segments.slice(0, firstGlob).join("/") || "/";
  const patternSegments = segments.slice(firstGlob);
  const matches = [];
  const walk = (current, index) => {
    if (index >= patternSegments.length) {
      pushFileCandidate(current, matches);
      return;
    }
    const segment = patternSegments[index];
    const isLast = index === patternSegments.length - 1;
    if (segment === "**") {
      walk(current, index + 1);
      let entries = [];
      try {
        entries = readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) walk(join(current, entry.name), index);
      }
      return;
    }
    if (!segment.includes("*")) {
      walk(join(current, segment), index + 1);
      return;
    }
    const matcher = new RegExp(`^${segment.split("*").map(escapeRegExp).join(".*")}$`, "u");
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!matcher.test(entry.name)) continue;
      const path = join(current, entry.name);
      if (isLast && entry.isFile()) matches.push(path);
      if (entry.isDirectory()) walk(path, index + 1);
    }
  };
  walk(directory, 0);
  return uniqueSorted(matches);
}

function pushFileCandidate(basePath, matches) {
  if (existsSync(basePath)) {
    try {
      if (statSync(basePath).isFile()) matches.push(basePath);
    } catch {
      /* ignored */
    }
  }
  for (const extension of RESOLUTION_EXTENSIONS) {
    if (existsSync(basePath + extension)) matches.push(basePath + extension);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
