import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, readlink, realpath, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export async function copyTree(source, destination) {
  await cp(source, destination, {
    recursive: true,
    verbatimSymlinks: true,
    preserveTimestamps: true,
  });
}

export async function hashTree(root, excluded = new Set(), included) {
  const hash = createHash("sha256");
  let files = 0;
  let bytes = 0;
  const ancestors = new Set();
  for (const name of included ?? []) {
    const segments = name.split("/");
    while (segments.length > 1) {
      segments.pop();
      ancestors.add(segments.join("/"));
    }
  }
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(directory, entry.name);
      const name = relative(root, path).split("\\").join("/");
      if (excluded.has(name)) continue;
      if (included && !included.has(name) && !ancestors.has(name)) continue;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isSymbolicLink()) {
        const link = await readlink(path);
        assertWithin(root, resolve(dirname(path), link));
        hash.update(`link:${name}\0${link}\0`);
      } else if (entry.isFile()) {
        const content = await readFile(path);
        const mode = (await lstat(path)).mode & 0o777;
        hash.update(`file:${name}\0${mode}\0${content.length}\0`);
        hash.update(content);
        files++;
        bytes += content.length;
      } else throw new Error(`Unsupported runtime artifact: ${path}`);
    }
  }
  await visit(root);
  return { sha256: hash.digest("hex"), files, bytes };
}

export function assertWithin(root, path) {
  const rel = relative(resolve(root), resolve(path));
  if (
    rel === ".." ||
    rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(rel)
  ) {
    throw new Error(`Runtime path escapes its session: ${path}`);
  }
}

async function linkPackage(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await symlink(
    process.platform === "win32" ? source : relative(dirname(destination), source),
    destination,
    process.platform === "win32" ? "junction" : "dir",
  );
}

/** Copy the installed dependency graph, preserving multiple versions and optional native packages.
 * Every runtime link targets a copied package inside the session; no pnpm-store/native-root links survive. */
export async function copyRuntimeDependencies(repoRoot, appRoot, names) {
  const copied = new Map();
  const sourceRequire = createRequire(join(repoRoot, "package.json"));
  const graphRoot = join(appRoot, ".runtime-dependencies");
  async function copyPackage(name, resolver) {
    const source = await resolvePackageRoot(name, resolver);
    const existing = copied.get(source);
    if (existing) return existing;
    const id = createHash("sha256").update(source).digest("hex").slice(0, 20);
    const target = join(graphRoot, id, "node_modules", name);
    copied.set(source, target);
    await cp(source, target, {
      recursive: true,
      verbatimSymlinks: true,
      preserveTimestamps: true,
      filter: (path) => path === source || basename(path) !== "node_modules",
    });
    const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
    const resolverForPackage = createRequire(join(source, "package.json"));
    const optional = new Set(Object.keys(manifest.optionalDependencies ?? {}));
    for (const [peer, metadata] of Object.entries(manifest.peerDependenciesMeta ?? {})) {
      if (metadata.optional) optional.add(peer);
    }
    const children = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...optional,
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    for (const child of children) {
      let childSource;
      try {
        childSource = await resolvePackageRoot(child, resolverForPackage);
      } catch (error) {
        if (optional.has(child) && error.code === "MODULE_NOT_FOUND") continue;
        throw error;
      }
      // Resolve before recursing so an optional package's broken installed graph is not ignored.
      const childTarget = copied.get(childSource) ?? (await copyPackage(child, resolverForPackage));
      await linkPackage(childTarget, join(target, "node_modules", child));
    }
    return target;
  }
  for (const name of [...new Set(names)].sort()) {
    await linkPackage(await copyPackage(name, sourceRequire), join(appRoot, "node_modules", name));
  }
  return { packages: copied.size, nodeModulesDir: join(appRoot, "node_modules") };
}

async function resolvePackageRoot(name, resolver) {
  // Walking Node's search locations also supports packages that do not export package.json or their root.
  for (const location of resolver.resolve.paths(name) ?? []) {
    const candidate = join(location, name);
    try {
      const manifest = JSON.parse(await readFile(join(candidate, "package.json"), "utf8"));
      if (manifest.name === name) return await realpath(candidate);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  const error = new Error(`Installed runtime dependency is missing: ${name}`);
  error.code = "MODULE_NOT_FOUND";
  throw error;
}

/** Build-only links are removed before snapshotting the independent runtime graph. */
export async function linkBuildDependencies(repoRoot, appRoot) {
  const modules = join(repoRoot, "node_modules");
  await mkdir(join(appRoot, "node_modules"), { recursive: true });
  for (const entry of await readdir(modules, { withFileTypes: true })) {
    if (entry.name === ".cache" || entry.name === ".vite") continue;
    const source = join(modules, entry.name);
    if (entry.name.startsWith("@")) {
      for (const child of await readdir(source)) {
        const installed = await realpath(join(source, child));
        const rel = relative(repoRoot, installed);
        const target =
          !rel.startsWith("..") && !isAbsolute(rel) && rel.startsWith("packages")
            ? join(appRoot, rel)
            : installed;
        await linkPackage(target, join(appRoot, "node_modules", entry.name, child));
      }
    } else if ((await lstat(source)).isDirectory() || entry.isSymbolicLink()) {
      await linkPackage(await realpath(source), join(appRoot, "node_modules", entry.name));
    }
  }
}
