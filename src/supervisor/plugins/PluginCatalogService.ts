import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  cpSync,
  chmodSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  pluginCatalogSnapshotSchema,
  pluginInstallationSchema,
  type PluginCatalogPayload,
  type PluginCatalogResult,
  type PluginCatalogSource,
  type PluginCatalogEntry,
  type PluginArtworkTarget,
} from "@/shared/contracts/pluginCatalog";
import {
  parsePluginMarketplace,
  publicPluginRepository,
  RECOMMENDED_PLUGIN_CATALOGS,
} from "@/shared/plugins/marketplaces";
import { writeFileAtomic } from "@/shared/atomicFile";
import { loadPluginFromDirectory, PLUGIN_INSTALL_RECEIPT_FILE } from "./PluginLoader";
import { pluginNameSchema } from "@/shared/plugins/spec";
import { isPathInsideRoot, relativePolicyPath } from "./pathContainment";
import type { PluginRegistry } from "./PluginRegistry";

import {
  artworkDeclarations,
  packageArtworkDeclarations,
  loadPluginArtwork,
  readArtworkFile,
} from "./pluginArtwork";

const runFile = promisify(execFile);
export const PLUGIN_CATALOG_STORE_VERSION = 3;
const RECEIPT_FILE = PLUGIN_INSTALL_RECEIPT_FILE;
const MANIFEST_PATHS = [
  "marketplace.json",
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/marketplace.json",
  ".zcode-plugin/marketplace.json",
];
const storedCatalogSchema = pluginCatalogSnapshotSchema.extend({ root: z.string() });
const storeSchema = z
  .object({
    version: z.literal(PLUGIN_CATALOG_STORE_VERSION),
    catalogs: z.array(storedCatalogSchema),
  })
  .strict();
// v2 snapshots predate the authored category. The entry schema treats it as
// optional, so a v2 snapshot parses as-is and is upgraded in memory.
const legacyStoreSchemaV2 = storeSchema.extend({ version: z.literal(2) });
const legacyStoreSchemaV1 = storeSchema.extend({ version: z.literal(1) });
type StoredCatalog = z.infer<typeof storedCatalogSchema>;
const replacementSchema = z
  .object({
    version: z.literal(1),
    pluginName: pluginNameSchema,
    staging: z.string().regex(/^\.install-[a-f0-9-]{36}$/u),
    backup: z.string().regex(/^\.previous-[a-f0-9-]{36}$/u),
    digest: z.string(),
    previousDigest: z.string().optional(),
  })
  .strict();

function containedPackagePath(root: string, path: string): string {
  if (isAbsolute(path) || path.split(/[\\/]/u).includes(".."))
    throw new Error("Catalog package paths must stay inside their source.");
  const destination = resolve(root, path);
  if (!isPathInsideRoot(root, destination))
    throw new Error("Catalog package path escapes its source.");
  return destination;
}

/** Includes every shipped file and permission bit; rejects links before copying untrusted packages. */
export function pluginPackageDigest(root: string): string {
  if (lstatSync(root).isSymbolicLink())
    throw new Error("Linked package roots are not supported by the installer.");
  const hash = createHash("sha256");
  let bytes = 0;
  let files = 0;
  const visit = (directory: string, prefix: string) => {
    for (const name of readdirSync(directory).sort()) {
      if (name === ".git" || name === RECEIPT_FILE) continue;
      const file = join(directory, name);
      const path = `${prefix}${name}`;
      const stat = lstatSync(file);
      if (stat.isSymbolicLink())
        throw new Error("Linked package files are not supported by the installer.");
      if (stat.isDirectory()) {
        visit(file, `${path}/`);
        continue;
      }
      if (!stat.isFile()) throw new Error("Unsupported package file type.");
      bytes += stat.size;
      files += 1;
      if (bytes > 100 * 1024 * 1024 || files > 10_000)
        throw new Error("Plugin package exceeds installation limits.");
      const content = readFileSync(file);
      hash.update(JSON.stringify([path, content.length, stat.mode & 0o111]));
      hash.update(content);
    }
  };
  visit(root, "");
  return hash.digest("hex");
}

export class PluginCatalogService {
  private readonly storePath: string;
  private readonly snapshotsDir: string;
  private readonly replacementPath: string;
  private readonly packageSnapshots = new Map<string, { root: string; revision: string }>();
  private readonly artworkCache = new Map<string, string | undefined>();
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly options: {
      baseDir: string;
      registry: PluginRegistry;
      removeAccounts: (pluginName: string) => void;
    },
  ) {
    this.storePath = join(options.baseDir, "plugin-catalogs.json");
    this.snapshotsDir = join(options.baseDir, "plugin-catalogs");
    this.replacementPath = join(options.baseDir, "plugin-install-transaction.json");
    try {
      this.recoverReplacement();
    } catch (error) {
      console.warn("[plugins] catalog recovery requires attention:", error);
    }
  }

  /** Catalog writes and package swaps are serialized in the owning supervisor. */
  manage(payload: PluginCatalogPayload): Promise<PluginCatalogResult> {
    const result = this.pending.then(() => this.perform(payload));
    this.pending = result.catch(() => {});
    return result;
  }

  private readStore(): z.infer<typeof storeSchema> {
    // Unknown or malformed versions are preserved; never replace user source custody with defaults.
    const stored = existsSync(this.storePath)
      ? JSON.parse(readFileSync(this.storePath, "utf8"))
      : { version: 1, catalogs: [] };
    if (stored.version === 2) {
      // v2 is the previous store generation. Category is optional on entries,
      // so it upgrades without a re-fetch; a later mutation persists v3.
      const legacy = legacyStoreSchemaV2.parse(stored);
      return { version: PLUGIN_CATALOG_STORE_VERSION, catalogs: legacy.catalogs };
    }
    if (stored.version !== 1 && stored.version !== PLUGIN_CATALOG_STORE_VERSION) {
      throw new Error(
        `Plugin catalog store version ${String(stored.version)} is not supported by this build; the file was left unchanged.`,
      );
    }
    if (stored.version === 1) {
      const legacy = legacyStoreSchemaV1.parse(stored);
      const defaults = RECOMMENDED_PLUGIN_CATALOGS.filter(
        (catalog) =>
          !legacy.catalogs.some(
            (existing) => existing.source.type === "git" && existing.source.url === catalog.url,
          ),
      ).map((catalog) => {
        const digest = createHash("sha256").update(catalog.url).digest("hex");
        const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
        return {
          id,
          name: catalog.name,
          source: { type: "git" as const, url: catalog.url },
          root: join(this.snapshotsDir, id),
          revision: "",
          refreshedAt: 0,
          entries: [],
        };
      });
      return { version: PLUGIN_CATALOG_STORE_VERSION, catalogs: [...legacy.catalogs, ...defaults] };
    }
    return storeSchema.parse(stored);
  }

  private writeStore(store: z.infer<typeof storeSchema>): void {
    writeFileAtomic(this.storePath, `${JSON.stringify(store, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  private result(catalogs: StoredCatalog[]): PluginCatalogResult {
    const installations: PluginCatalogResult["installations"] = [];
    const userDir = this.options.registry.ensureUserPluginsDir();
    for (const name of readdirSync(userDir)) {
      const path = join(userDir, name, RECEIPT_FILE);
      if (!existsSync(path)) continue;
      try {
        const parsed = pluginInstallationSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
        if (parsed.success && parsed.data.pluginName === name) installations.push(parsed.data);
      } catch {
        console.warn("[plugins] cannot read catalog installation receipt:", path);
      }
    }
    return { catalogs: catalogs.map(({ root: _root, ...catalog }) => catalog), installations };
  }

  private async perform(payload: PluginCatalogPayload): Promise<PluginCatalogResult> {
    this.recoverReplacement();
    const store = this.readStore();
    if (payload.action === "artwork") {
      const dataUrl = await this.artwork(payload.target, store.catalogs);
      return {
        catalogs: [],
        installations: [],
        artwork: { version: 1, ...(dataUrl ? { dataUrl } : {}) },
      };
    }
    if (payload.action === "list") {
      this.artworkCache.clear();
      return this.result(store.catalogs);
    }
    if (payload.action === "add" || payload.action === "refresh") {
      const previous =
        payload.action === "refresh"
          ? store.catalogs.find((catalog) => catalog.id === payload.catalogId)
          : undefined;
      if (payload.action === "refresh" && !previous) throw new Error("Catalog not found.");
      const source = payload.action === "add" ? payload.source : previous!.source;
      if (
        payload.action === "add" &&
        store.catalogs.some((catalog) => JSON.stringify(catalog.source) === JSON.stringify(source))
      )
        throw new Error("Catalog source is already registered.");
      const snapshot = await this.readCatalog(source, previous?.id ?? randomUUID());
      store.catalogs = [
        ...store.catalogs.filter((catalog) => catalog.id !== snapshot.id),
        snapshot,
      ];
      this.writeStore(store);
      this.dropPackageSnapshots(snapshot.id);
      this.cleanupSnapshots(store.catalogs);
      return this.result(store.catalogs);
    }
    if (payload.action === "remove-source") {
      store.catalogs = store.catalogs.filter((catalog) => catalog.id !== payload.catalogId);
      this.writeStore(store);
      this.dropPackageSnapshots(payload.catalogId);
      this.cleanupSnapshots(store.catalogs);
      return this.result(store.catalogs);
    }
    if (payload.action === "remove-package") {
      const directory = this.ownedInstallation(payload.pluginName);
      // Delete the owned package first; clearing accounts before a failed
      // delete would sign the user out of a plugin that is still present.
      this.removeSnapshot(directory);
      this.options.removeAccounts(payload.pluginName);
      this.options.registry.refresh();
      return this.result(store.catalogs);
    }
    const catalog = store.catalogs.find((candidate) => candidate.id === payload.catalogId);
    const entry = catalog?.entries.find((candidate) => candidate.name === payload.entryName);
    if (!catalog || !entry) throw new Error("Catalog entry not found.");
    if (entry.unavailable.length > 0)
      throw new Error("This catalog entry requires unsupported installation capabilities.");
    const materialized = await this.packageRoot(catalog, entry);
    const digest = pluginPackageDigest(materialized.root);
    const loaded = loadPluginFromDirectory(materialized.root, "user", true);
    if (!loaded.plugin || loaded.plugin.name !== entry.name)
      throw new Error("Package manifest does not match its catalog entry.");
    const inspection = { plugin: loaded.plugin, digest, revision: materialized.revision };
    if (payload.action === "inspect") return { ...this.result(store.catalogs), inspection };
    if (digest !== payload.reviewDigest)
      throw new Error("Package contents changed after review. Inspect the package again.");
    if (loaded.plugin.skills.length === 0 && loaded.plugin.mcpServers.length === 0)
      throw new Error("This package has no compatible skills or MCP servers.");
    const userDir = this.options.registry.ensureUserPluginsDir();
    const target = join(userDir, entry.name);
    if (payload.action === "install") {
      if (existsSync(target) || this.options.registry.getPlugin(entry.name))
        throw new Error("A plugin with this name is already present.");
    } else {
      this.ownedInstallation(entry.name);
    }
    const staging = join(userDir, `.install-${randomUUID()}`);
    const backup = join(userDir, `.previous-${randomUUID()}`);
    try {
      cpSync(materialized.root, staging, {
        recursive: true,
        dereference: false,
        filter: (file) => basename(file) !== ".git" && basename(file) !== RECEIPT_FILE,
      });
      if (pluginPackageDigest(staging) !== digest)
        throw new Error("Package contents changed during installation.");
      const receipt = pluginInstallationSchema.parse({
        formatVersion: 1,
        pluginName: entry.name,
        catalogId: catalog.id,
        catalogName: catalog.name,
        catalogSource: catalog.source,
        packageSource: entry.source,
        entryName: entry.name,
        revision: materialized.revision,
        digest,
        installedAt: Date.now(),
      });
      writeFileAtomic(join(staging, RECEIPT_FILE), `${JSON.stringify(receipt, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      writeFileAtomic(
        this.replacementPath,
        `${JSON.stringify({ version: 1, pluginName: entry.name, staging: basename(staging), backup: basename(backup), digest, ...(payload.action === "update" ? { previousDigest: pluginPackageDigest(target) } : {}) })}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      if (payload.action === "update") {
        renameSync(target, backup);
      }
      renameSync(staging, target);
      this.recoverReplacement();
    } catch (error) {
      this.recoverReplacement();
      throw error;
    } finally {
      if (existsSync(staging) && !existsSync(this.replacementPath)) this.removeSnapshot(staging);
    }
    this.options.registry.refresh();
    const installed = this.options.registry.getPlugin(entry.name);
    if (!installed) throw new Error("Installed package could not be loaded.");
    return { ...this.result(store.catalogs), inspection: { ...inspection, plugin: installed } };
  }

  /** The journal is written before either rename, so a restart restores or completes an owned swap. */
  private recoverReplacement(): void {
    if (!existsSync(this.replacementPath)) return;
    const record = replacementSchema.parse(JSON.parse(readFileSync(this.replacementPath, "utf8")));
    const root = this.options.registry.ensureUserPluginsDir();
    const target = containedPackagePath(root, record.pluginName);
    const staging = containedPackagePath(root, record.staging);
    const backup = containedPackagePath(root, record.backup);
    const hasTarget = existsSync(target);
    const hasStaging = existsSync(staging);
    const hasBackup = existsSync(backup);
    const verify = (directory: string, digest: string | undefined) => {
      const receipt = pluginInstallationSchema.parse(
        JSON.parse(readFileSync(join(directory, RECEIPT_FILE), "utf8")),
      );
      if (
        !digest ||
        receipt.pluginName !== record.pluginName ||
        receipt.digest !== digest ||
        pluginPackageDigest(directory) !== digest
      )
        throw new Error("Preserving modified plugin recovery files.");
    };
    // Validate every remaining directory before restoring or deleting any of them.
    if (hasStaging) verify(staging, record.digest);
    if (hasBackup) verify(backup, record.previousDigest);
    if (hasTarget) {
      if (lstatSync(target).isSymbolicLink())
        throw new Error("Cannot recover a linked plugin installation.");
      const targetDigest = pluginPackageDigest(target);
      verify(
        target,
        !hasBackup && targetDigest === record.previousDigest
          ? record.previousDigest
          : record.digest,
      );
    }
    if (!hasTarget && hasBackup) renameSync(backup, target);
    else if (hasBackup) this.removeSnapshot(backup);
    if (hasStaging) this.removeSnapshot(staging);
    rmSync(this.replacementPath);
    this.options.registry.refresh();
  }

  private dropPackageSnapshots(catalogId: string): void {
    for (const key of this.packageSnapshots.keys()) {
      if ((JSON.parse(key) as unknown[])[0] === catalogId) this.packageSnapshots.delete(key);
    }
  }

  private cleanupSnapshots(catalogs: StoredCatalog[]): void {
    if (!existsSync(this.snapshotsDir)) return;
    const retained = new Set([
      ...catalogs
        .filter((catalog) => catalog.source.type === "git")
        .map((catalog) => resolve(catalog.root)),
      ...[...this.packageSnapshots.values()].map((snapshot) => resolve(snapshot.root)),
    ]);
    for (const name of readdirSync(this.snapshotsDir)) {
      if (!z.string().uuid().safeParse(name).success) continue;
      const root = join(this.snapshotsDir, name);
      if (!retained.has(resolve(root)) && !lstatSync(root).isSymbolicLink())
        this.removeSnapshot(root);
    }
  }

  private removeSnapshot(root: string): void {
    // Electron's Windows rmSync cannot remove read-only package or Git object files.
    if (process.platform === "win32") {
      const makeWritable = (directory: string) => {
        for (const name of readdirSync(directory)) {
          const file = join(directory, name);
          const stat = lstatSync(file);
          if (stat.isSymbolicLink()) continue;
          if (stat.isDirectory()) makeWritable(file);
          else if (stat.isFile() && (stat.mode & 0o200) === 0) chmodSync(file, stat.mode | 0o200);
        }
      };
      makeWritable(root);
    }
    rmSync(root, { recursive: true });
  }

  private ownedInstallation(name: string): string {
    const root = this.options.registry.ensureUserPluginsDir();
    const target = containedPackagePath(root, name);
    if (lstatSync(target).isSymbolicLink())
      throw new Error("Cannot modify a linked plugin directory.");
    const receipt = pluginInstallationSchema.parse(
      JSON.parse(readFileSync(join(target, RECEIPT_FILE), "utf8")),
    );
    if (
      receipt.pluginName !== name ||
      this.options.registry.getPlugin(name)?.root !== realpathSync.native(target)
    )
      throw new Error("Plugin is not owned by this catalog installer.");
    // Do not destroy locally edited packages during update or removal.
    if (pluginPackageDigest(target) !== receipt.digest)
      throw new Error(
        "Plugin files have local changes. Preserve them before updating or removing this package.",
      );
    return target;
  }

  private async artwork(
    target: PluginArtworkTarget,
    catalogs: StoredCatalog[],
  ): Promise<string | undefined> {
    if (this.artworkCache.size >= 256) this.artworkCache.clear();
    let root: string;
    let declarations: string[];
    let key: string;
    try {
      if (target.type === "plugin") {
        const plugin = this.options.registry.getPlugin(target.pluginName, target.projectFsPath);
        if (!plugin) return undefined;
        root = plugin.root;
        key = JSON.stringify([target, root, statSync(root).mtimeMs]);
        if (this.artworkCache.has(key)) return this.artworkCache.get(key);
        declarations = await packageArtworkDeclarations(root);
      } else {
        const catalog = catalogs.find((item) => item.id === target.catalogId);
        const entry = catalog?.entries.find((item) => item.name === target.entryName);
        if (!catalog || !entry) return undefined;
        key = JSON.stringify([target, catalog.revision, catalog.refreshedAt]);
        if (this.artworkCache.has(key)) return this.artworkCache.get(key);
        root = catalog.root;
        const manifest = MANIFEST_PATHS.find((path) => existsSync(join(root, path)));
        if (!manifest) return undefined;
        const raw: unknown = JSON.parse(
          (await readArtworkFile(root, manifest, 10 * 1024 * 1024)).toString("utf8"),
        );
        const plugins =
          raw && typeof raw === "object" && "plugins" in raw && Array.isArray(raw.plugins)
            ? raw.plugins
            : [];
        const authored = plugins.find(
          (item: unknown) =>
            item && typeof item === "object" && "name" in item && item.name === entry.name,
        );
        declarations = artworkDeclarations(authored);
        if (entry.source.type === "path") {
          const packageRoot = containedPackagePath(catalog.root, entry.source.path);
          // A package icon is relative to that package, not the marketplace manifest directory.
          const packageDeclarations = await packageArtworkDeclarations(packageRoot).catch(() => []);
          const packageIcon = await loadPluginArtwork(packageRoot, packageDeclarations);
          if (packageIcon) {
            this.artworkCache.set(key, packageIcon);
            return packageIcon;
          }
        }
      }
      const icon = await loadPluginArtwork(root, declarations);
      if (this.artworkCache.size >= 256) this.artworkCache.clear();
      this.artworkCache.set(key, icon);
      return icon;
    } catch {
      return undefined;
    }
  }

  private async readCatalog(source: PluginCatalogSource, id: string): Promise<StoredCatalog> {
    let root: string;
    let file: string | undefined;
    let revision: string;
    if (source.type === "git") {
      const snapshot = await this.clone(source.url, source.ref);
      root = snapshot.root;
      revision = snapshot.revision;
    } else {
      const path = realpathSync.native(source.path);
      if (statSync(path).isFile()) {
        file = path;
        const matching = [...MANIFEST_PATHS]
          .sort((left, right) => right.length - left.length)
          .find((candidate) => path.replaceAll("\\", "/").endsWith(`/${candidate}`));
        root = matching ? resolve(path, ...matching.split("/").map(() => "..")) : dirname(path);
      } else root = path;
      revision = "local";
    }
    try {
      file ??= MANIFEST_PATHS.map((path) => join(root, path)).find((path) => existsSync(path));
      if (
        !file ||
        relativePolicyPath(root, file) === undefined ||
        statSync(file).size > 10 * 1024 * 1024
      )
        throw new Error("No supported marketplace manifest found.");
      const text = readFileSync(file, "utf8");
      const parsed = parsePluginMarketplace(JSON.parse(text));
      if (revision === "local") revision = createHash("sha256").update(text).digest("hex");
      return {
        id,
        source,
        root,
        revision,
        name: parsed.name,
        entries: parsed.entries,
        refreshedAt: Date.now(),
      };
    } catch (error) {
      if (source.type === "git") this.removeSnapshot(root);
      throw error;
    }
  }

  private async packageRoot(
    catalog: StoredCatalog,
    entry: PluginCatalogEntry,
  ): Promise<{ root: string; repositoryRoot: string; revision: string }> {
    if (entry.source.type === "path")
      return {
        root: containedPackagePath(catalog.root, entry.source.path),
        repositoryRoot: catalog.root,
        revision: catalog.revision,
      };
    if (entry.source.type !== "git") throw new Error("Unsupported package source.");
    const key = JSON.stringify([catalog.id, catalog.revision, entry]);
    let snapshot = this.packageSnapshots.get(key);
    if (!snapshot) {
      snapshot = await this.clone(entry.source.url, entry.source.ref, entry.source.sha);
      this.packageSnapshots.set(key, snapshot);
    }
    return {
      root: containedPackagePath(snapshot.root, entry.source.path),
      repositoryRoot: snapshot.root,
      revision: snapshot.revision,
    };
  }

  private async clone(
    repository: string,
    ref?: string,
    sha?: string,
  ): Promise<{ root: string; revision: string }> {
    const url = publicPluginRepository(repository);
    if (
      ref?.startsWith("-") ||
      (sha !== undefined && !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu.test(sha))
    )
      throw new Error("Invalid Git revision.");
    mkdirSync(this.snapshotsDir, { recursive: true });
    const root = join(this.snapshotsDir, randomUUID());
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_LFS_SKIP_SMUDGE: "1",
    };
    const git = async (args: string[]) =>
      (
        await runFile(
          "git",
          [
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.longpaths=true",
            "-c",
            "protocol.file.allow=never",
            "-c",
            "protocol.ext.allow=never",
            ...args,
          ],
          { env, windowsHide: true, timeout: 120_000, maxBuffer: 1024 * 1024 },
        )
      ).stdout.trim();
    try {
      await git(["clone", "--no-checkout", "--no-recurse-submodules", "--", url, root]);
      await git(["-C", root, "checkout", "--detach", sha ?? ref ?? "HEAD"]);
      const revision = await git(["-C", root, "rev-parse", "HEAD"]);
      return { root, revision };
    } catch {
      if (existsSync(root)) this.removeSnapshot(root);
      throw new Error("Could not download the public plugin repository.");
    }
  }
}
