import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import type {
  AgentKind,
  DeleteSkillPayload,
  ImportSkillPayload,
  ImportSkillsPayload,
  ImportSkillsResult,
  InstallMarketplaceSkillPayload,
  InstallMarketplaceSkillResult,
  ListSkillMarketplacePayload,
  MarketplaceSkill,
  ProjectLocation,
  PromptSegment,
  ScanSkillsPayload,
  SetSkillEnabledPayload,
  SkillEntry,
  SkillAvailability,
  SkillInvalidReason,
  SkillMarketplaceResult,
  SkillOrigin,
  SkillScanIssue,
  SkillScanResult,
  SkillScope,
  InstalledPlugins,
  LoadedPlugin,
} from "@/shared/contracts";
import {
  deleteSkillPayloadSchema,
  importSkillsPayloadSchema,
  installMarketplaceSkillPayloadSchema,
  isGitHubRepositorySource,
  isValidSkillName,
  listSkillMarketplacePayloadSchema,
  scanSkillsPayloadSchema,
  setSkillEnabledPayloadSchema,
  skillScanResultSchema,
} from "@/shared/contracts";
import { parseWslUncPath, toWslUncPath } from "@/shared/wsl";
import type { AgentAdapter, AgentSkillRootSpec } from "../agents/base";
import {
  batchWslCommandsAsync,
  quotePosixShellArg,
  resolveWslHomeDirectoryAsync,
} from "../agents/base";
import { parseSkillMarketplace, parseSkillsDirectoryMarketplace } from "./skillMarketplace";
import {
  buildInlineSkillInstructions,
  buildSkillPathHintText,
  isPathUnderAny,
  selectSkillSegmentsForInjection,
} from "./skillPromptInjection";
import { PLUGIN_SKILLS_DIR } from "@/supervisor/plugins";
import {
  pluginSkillProviderId,
  PluginSkillPolicy,
  type PluginSkillPolicyContext,
  type PluginSkillRoot,
} from "./pluginSkillPolicy";

const SKILL_FILE = "SKILL.md";
const MANIFEST_FILE = ".poracode-skill.json";
/** Root id/label for read-only skills shipped with the app (resources/skills). */
export const BUNDLED_PROVIDER_ID = "poracode-built-in";
const BUNDLED_PROVIDER_LABEL = "Poracode built-ins";
const PORACODE_PROVIDER_GROUP_ID = "poracode";
const PORACODE_PROVIDER_GROUP_LABEL = "Poracode";

const PORACODE_PROVIDER_GROUP_ORDER = -1;
const DISABLED_SUFFIX = ".poracode-disabled";
const MAX_SKILL_FILE_BYTES = 1024 * 1024;
const SKILLS_SH_URL = "https://www.skills.sh/";
const SKILLS_DIRECTORY_URL = "https://www.skillsdirectory.com/";
const MARKETPLACE_CACHE_MS = 5 * 60 * 1000;
const MAX_MARKETPLACE_HTML_BYTES = 5 * 1024 * 1024;
const MAX_MARKETPLACE_FILES = 200;
const MAX_MARKETPLACE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_MARKETPLACE_SKILL_BYTES = 10 * 1024 * 1024;
const MARKETPLACE_DOWNLOAD_CONCURRENCY = 8;

interface LocatedRoot {
  providerId: string;
  providerLabel: string;
  providerGroupId?: string;
  providerGroupLabel?: string;
  providerGroupOrder?: number;
  builtInPath?: string;
  scope: SkillScope;
  scopeLabel: string;
  availability?: SkillAvailability;
  fsPath: string;
  displayPath: string;
  origin: SkillOrigin;
  mutable: boolean;
  wslDistro?: string;
}

interface ResolvedEnvironment {
  homeFsPath: string;
  homeDisplayPath: string;
  projectFsPath?: string;
  projectDisplayPath?: string;
  projectLabel?: string;
  wsl: boolean;
  distro?: string;
  wslEnv?: Record<string, string>;
}

interface SkillManifest {
  version: 1;
  mode: "copy" | "projection";
  sourcePath: string;
  sourceHash: string;
}

interface PreparedSkillImport {
  input: ImportSkillPayload;
  environment: ResolvedEnvironment;
  destination: string;
  disabledDestination: string;
  stagingPath: string;
  sourceHash?: string;
  backups: Array<{ original: string; backup: string }>;
}

interface LinkedImportMove {
  sourcePath: string;
  destinationPath: string;
  sourceTarget: string;
  destinationTarget: string;
}

export interface SkillsServiceOptions {
  adapters: ReadonlyMap<AgentKind, AgentAdapter>;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: () => string;
  resolveWslHome?: (distro: string) => Promise<string | undefined>;
  resolveWslEnv?: (distro: string, names: readonly string[]) => Promise<Record<string, string>>;
  resolveWslRealPaths?: (
    distro: string,
    paths: readonly string[],
  ) => Promise<readonly (string | undefined)[]>;
  resolveHostPathForWsl?: (distro: string, hostPath: string) => Promise<string | undefined>;
  resolveWslWindowsPaths?: (
    distro: string,
    paths: readonly string[],
  ) => Promise<readonly (string | undefined)[]>;
  wslFsPath?: (distro: string, linuxPath: string) => string;
  fetch?: typeof fetch;
  readInstalledPlugins?: () => InstalledPlugins;
  /** Agent Plugins packages discovered by the supervisor's plugin registry. */
  readPlugins?: () => readonly LoadedPlugin[];
  hostPlatform?: NodeJS.Platform;
}

async function resolveWslEnvironment(
  distro: string,
  names: readonly string[],
): Promise<Record<string, string>> {
  const safeNames = [...new Set(names)].filter((name) => /^[A-Z][A-Z0-9_]*$/u.test(name));
  const results = await batchWslCommandsAsync(
    distro,
    safeNames.map((name) => `printenv ${name}`),
  );
  return Object.fromEntries(
    safeNames.flatMap((name, index) => {
      const result = results[index];
      return result?.ok && result.stdout ? [[name, result.stdout]] : [];
    }),
  );
}

async function resolveWslRealPaths(
  distro: string,
  paths: readonly string[],
): Promise<readonly (string | undefined)[]> {
  const results = await batchWslCommandsAsync(
    distro,
    paths.map((path) => `readlink -f -- ${quotePosixShellArg(path)}`),
  );
  return results.map((result) =>
    result?.ok && posix.isAbsolute(result.stdout) ? result.stdout : undefined,
  );
}

function disabledRoot(rootPath: string): string {
  return `${rootPath}${DISABLED_SUFFIX}`;
}

function normalizePath(path: string): string {
  const normalized = resolve(path).replace(/[\\/]+$/u, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isDirectChild(rootPath: string, childPath: string): boolean {
  const rel = relative(resolve(rootPath), resolve(childPath));
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel) && !/[\\/]/u.test(rel);
}

/** Run `fn` over `items` with at most `limit` in flight, preserving result order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : trimmed;
    } catch {
      return trimmed.replace(/^"|"$/gu, "");
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/gu, "'");
  }
  return trimmed.replace(/\s+#.*$/u, "").trim();
}

function parseSkillMetadata(
  content: string,
  folderName: string,
): {
  name: string;
  description: string;
  hasFrontmatter: boolean;
  hasName: boolean;
  hasDescription: boolean;
} {
  const normalized = content.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const match = /^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/u.exec(normalized);
  if (!match) {
    return {
      name: folderName,
      description: "",
      hasFrontmatter: false,
      hasName: false,
      hasDescription: false,
    };
  }
  let name = folderName;
  let description = "";
  let hasName = false;
  let hasDescription = false;
  const lines = match[1]?.split("\n") ?? [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const field = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u.exec(line);
    if (!field) continue;
    if (field[1] === "name") {
      hasName = true;
      name = parseScalar(field[2] ?? "");
    }
    if (field[1] !== "description") continue;
    hasDescription = true;
    const rawDescription = field[2] ?? "";
    if (!/^[>|][+-]?$/u.test(rawDescription.trim())) {
      description = parseScalar(rawDescription);
      continue;
    }
    const block: string[] = [];
    while (index + 1 < lines.length && /^(?:\s|$)/u.test(lines[index + 1]!)) {
      block.push(lines[++index]!.trim());
    }
    description = block.filter(Boolean).join(rawDescription.trim().startsWith("|") ? "\n" : " ");
  }
  return { name, description, hasFrontmatter: true, hasName, hasDescription };
}

function validateSkillMetadata(
  metadata: ReturnType<typeof parseSkillMetadata>,
  folderName: string,
): SkillInvalidReason | undefined {
  if (!metadata.hasFrontmatter) return "missing-frontmatter";
  if (!metadata.hasName || !metadata.name) return "missing-name";
  if (metadata.name.length > 64 || !isValidSkillName(metadata.name)) return "invalid-name";
  if (metadata.name !== folderName) return "name-mismatch";
  if (!metadata.hasDescription || !metadata.description) return "missing-description";
  if (metadata.description.length > 1024) return "description-too-long";
  return undefined;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readManifest(skillPath: string): Promise<SkillManifest | undefined> {
  try {
    const parsed = JSON.parse(await readFile(join(skillPath, MANIFEST_FILE), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const record = parsed as Record<string, unknown>;
    if (
      record.version !== 1 ||
      (record.mode !== "copy" && record.mode !== "projection") ||
      typeof record.sourcePath !== "string" ||
      typeof record.sourceHash !== "string"
    ) {
      return undefined;
    }
    return record as unknown as SkillManifest;
  } catch {
    return undefined;
  }
}

async function writeManifest(skillPath: string, manifest: SkillManifest): Promise<void> {
  await writeFile(join(skillPath, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function hashDirectory(rootPath: string): Promise<string> {
  const hash = createHash("sha256");
  const rootRealPath = await realpath(rootPath);
  const activeDirectories = new Set<string>();

  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    const realDirectory = await realpath(directory);
    const directoryKey = normalizePath(realDirectory);
    if (activeDirectories.has(directoryKey)) {
      throw new Error(`Skill contains a cyclic directory link: ${relativeDirectory || "."}`);
    }
    activeDirectories.add(directoryKey);
    try {
      const entries = await readdir(realDirectory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        if (entry.name === MANIFEST_FILE) continue;
        const path = join(realDirectory, entry.name);
        const relativePath = relativeDirectory
          ? posix.join(relativeDirectory, entry.name)
          : entry.name;
        const info = await lstat(path);
        if (info.isSymbolicLink()) {
          const target = await realpath(path);
          const rel = relative(rootRealPath, target);
          if (rel.startsWith("..") || isAbsolute(rel)) {
            throw new Error(`Skill contains a link outside its folder: ${relativePath}`);
          }
          const targetInfo = await stat(target);
          hash.update(`L\0${relativePath}\0`);
          if (targetInfo.isDirectory()) await visit(target, relativePath);
          else if (targetInfo.isFile()) hash.update(await readFile(target));
          continue;
        }
        if (info.isDirectory()) {
          hash.update(`D\0${relativePath}\0`);
          await visit(path, relativePath);
        } else if (info.isFile()) {
          hash.update(`F\0${relativePath}\0`);
          hash.update(await readFile(path));
        }
      }
    } finally {
      activeDirectories.delete(directoryKey);
    }
  };

  await visit(rootRealPath, "");
  return hash.digest("hex");
}

async function copyDirectorySafely(sourcePath: string, destinationPath: string): Promise<void> {
  const sourceRealPath = await realpath(sourcePath);
  const activeDirectories = new Set<string>();
  await mkdir(destinationPath, { recursive: true });

  const visit = async (source: string, destination: string): Promise<void> => {
    const realSource = await realpath(source);
    const directoryKey = normalizePath(realSource);
    if (activeDirectories.has(directoryKey)) {
      throw new Error(
        `Skill contains a cyclic directory link: ${relative(sourceRealPath, realSource) || "."}`,
      );
    }
    activeDirectories.add(directoryKey);
    try {
      const entries = await readdir(realSource, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === MANIFEST_FILE) continue;
        const from = join(realSource, entry.name);
        const to = join(destination, entry.name);
        const info = await lstat(from);
        if (info.isSymbolicLink()) {
          const target = await realpath(from);
          const rel = relative(sourceRealPath, target);
          if (rel.startsWith("..") || isAbsolute(rel)) {
            throw new Error(`Skill contains a link outside its folder: ${entry.name}`);
          }
          const targetInfo = await stat(target);
          if (targetInfo.isDirectory()) {
            await mkdir(to, { recursive: true });
            await visit(target, to);
          } else if (targetInfo.isFile()) {
            await copyFile(target, to);
          }
          continue;
        }
        if (info.isDirectory()) {
          await mkdir(to, { recursive: true });
          await visit(from, to);
        } else if (info.isFile()) {
          await copyFile(from, to);
        }
      }
    } finally {
      activeDirectories.delete(directoryKey);
    }
  };

  await visit(sourceRealPath, destinationPath);
}

async function removeSkillPath(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) await unlink(path);
  else await rm(path, { recursive: true, force: false });
}

async function createDirectoryLink(targetPath: string, linkPath: string): Promise<void> {
  await symlink(resolve(targetPath), linkPath, process.platform === "win32" ? "junction" : "dir");
}

export class SkillsService {
  private readonly adapters: ReadonlyMap<AgentKind, AgentAdapter>;
  private readonly env: NodeJS.ProcessEnv;
  private readonly homeDirectory: () => string;
  private readonly resolveWslHome: (distro: string) => Promise<string | undefined>;
  private readonly resolveWslEnv: (
    distro: string,
    names: readonly string[],
  ) => Promise<Record<string, string>>;
  private readonly resolveWslRealPaths: (
    distro: string,
    paths: readonly string[],
  ) => Promise<readonly (string | undefined)[]>;
  private readonly wslFsPath: (distro: string, linuxPath: string) => string;
  private readonly fetchImpl: typeof fetch;
  private readonly pluginSkillPolicy: PluginSkillPolicy;
  private readonly readPlugins: () => readonly LoadedPlugin[];
  private readonly marketplaceCache = new Map<
    string,
    { expiresAt: number; result: SkillMarketplaceResult }
  >();
  private readonly marketplaceSkills = new Map<string, MarketplaceSkill>();

  constructor(options: SkillsServiceOptions) {
    this.adapters = options.adapters;
    this.env = options.env ?? process.env;
    this.homeDirectory = options.homeDirectory ?? homedir;
    this.resolveWslHome = options.resolveWslHome ?? resolveWslHomeDirectoryAsync;
    this.resolveWslEnv = options.resolveWslEnv ?? resolveWslEnvironment;
    this.resolveWslRealPaths = options.resolveWslRealPaths ?? resolveWslRealPaths;
    this.wslFsPath = options.wslFsPath ?? toWslUncPath;
    this.fetchImpl = options.fetch ?? fetch;
    this.readPlugins = options.readPlugins ?? (() => []);
    this.pluginSkillPolicy = new PluginSkillPolicy({
      readPluginRoots: () => this.pluginSkillRoots(),
      readInstalledPlugins: options.readInstalledPlugins ?? (() => ({})),
      hostPlatform: options.hostPlatform ?? process.platform,
      resolveWslRealPaths: this.resolveWslRealPaths,
      ...(options.resolveHostPathForWsl
        ? { resolveHostPathForWsl: options.resolveHostPathForWsl }
        : {}),
      ...(options.resolveWslWindowsPaths
        ? { resolveWslWindowsPaths: options.resolveWslWindowsPaths }
        : {}),
    });
  }

  async listMarketplace(input: ListSkillMarketplacePayload): Promise<SkillMarketplaceResult> {
    const payload = listSkillMarketplacePayloadSchema.parse(input);
    const cacheKey = JSON.stringify(payload);
    const cached = this.marketplaceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    let result: SkillMarketplaceResult;
    if (payload.marketplace === "skills-directory") {
      const url = new URL("api/registry", SKILLS_DIRECTORY_URL);
      if (payload.query) url.searchParams.set("q", payload.query);
      url.searchParams.set("limit", "100");
      url.searchParams.set("sort", payload.sort === "rank" ? "stars" : payload.sort);
      const response = await this.fetchImpl(url, { headers: { "User-Agent": "Poracode" } });
      if (!response.ok) {
        throw new Error(`Skills Directory returned HTTP ${response.status}.`);
      }
      const parsed = parseSkillsDirectoryMarketplace(await response.json());
      result = {
        marketplace: "skills-directory",
        skills: parsed.skills,
        total: parsed.total,
      };
    } else {
      const response = await this.fetchImpl(SKILLS_SH_URL, {
        headers: { "User-Agent": "Poracode" },
      });
      if (!response.ok) throw new Error(`Skills.sh returned HTTP ${response.status}.`);
      const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
      if (declaredLength > MAX_MARKETPLACE_HTML_BYTES) {
        throw new Error("Skills.sh response is too large.");
      }
      const html = await response.text();
      if (Buffer.byteLength(html) > MAX_MARKETPLACE_HTML_BYTES) {
        throw new Error("Skills.sh response is too large.");
      }
      const normalizedQuery = payload.query?.toLowerCase();
      const skills = parseSkillMarketplace(html)
        .filter(
          (skill) =>
            !normalizedQuery ||
            `${skill.name} ${skill.source}`.toLowerCase().includes(normalizedQuery),
        )
        .toSorted((left, right) =>
          payload.sort === "recent"
            ? (right.weeklyInstalls?.at(-1) ?? 0) - (left.weeklyInstalls?.at(-1) ?? 0)
            : left.rank - right.rank,
        );
      if (skills.length === 0 && !payload.query) {
        throw new Error("Skills.sh returned no usable skills.");
      }
      result = {
        marketplace: "skills-sh",
        skills,
        total: skills.length,
      };
    }
    this.marketplaceCache.set(cacheKey, {
      expiresAt: Date.now() + MARKETPLACE_CACHE_MS,
      result,
    });
    for (const skill of result.skills) {
      this.marketplaceSkills.set(`${skill.marketplace}:${skill.id}`, skill);
    }
    return result;
  }

  async installMarketplace(
    input: InstallMarketplaceSkillPayload,
  ): Promise<InstallMarketplaceSkillResult> {
    const payload = installMarketplaceSkillPayloadSchema.parse(input);
    const marketplaceSkill = this.marketplaceSkills.get(
      `${payload.marketplace}:${payload.marketplaceSkillId}`,
    );
    if (
      !marketplaceSkill ||
      !isGitHubRepositorySource(marketplaceSkill.source) ||
      !isValidSkillName(marketplaceSkill.skillId)
    ) {
      throw new Error("Only validated GitHub marketplace skills can be installed.");
    }
    const source = marketplaceSkill.source;
    const skillId = marketplaceSkill.skillId;

    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "Poracode",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    let branch = marketplaceSkill.sourceRef;
    if (!branch) {
      const repoResponse = await this.fetchImpl(`https://api.github.com/repos/${source}`, {
        headers,
      });
      if (!repoResponse.ok) throw new Error(`GitHub returned HTTP ${repoResponse.status}.`);
      const repo = (await repoResponse.json()) as { default_branch?: unknown };
      if (typeof repo.default_branch !== "string" || !repo.default_branch) {
        throw new Error("GitHub did not return a default branch.");
      }
      branch = repo.default_branch;
    }
    const treeResponse = await this.fetchImpl(
      `https://api.github.com/repos/${source}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers },
    );
    if (!treeResponse.ok) throw new Error(`GitHub returned HTTP ${treeResponse.status}.`);
    const treeJson = (await treeResponse.json()) as {
      truncated?: unknown;
      tree?: Array<{ path?: unknown; type?: unknown; mode?: unknown; size?: unknown }>;
    };
    if (treeJson.truncated === true || !Array.isArray(treeJson.tree)) {
      throw new Error("GitHub returned an incomplete repository tree.");
    }
    const files = treeJson.tree.filter(
      (entry): entry is { path: string; type: "blob"; mode?: unknown; size?: unknown } =>
        entry.type === "blob" && typeof entry.path === "string",
    );
    const skillFiles = files.filter(
      (entry) =>
        posix.basename(entry.path) === SKILL_FILE &&
        posix.basename(posix.dirname(entry.path)) === skillId,
    );
    const prefix = marketplaceSkill.sourcePath ?? posix.dirname(skillFiles[0]?.path ?? "");
    if (
      !prefix ||
      !files.some((entry) => entry.path === `${prefix}/${SKILL_FILE}`) ||
      (!marketplaceSkill.sourcePath && skillFiles.length !== 1)
    ) {
      throw new Error("The marketplace skill folder could not be identified unambiguously.");
    }
    const selectedFiles = files.filter(
      (entry) => entry.path === `${prefix}/${SKILL_FILE}` || entry.path.startsWith(`${prefix}/`),
    );
    if (selectedFiles.length === 0 || selectedFiles.length > MAX_MARKETPLACE_FILES) {
      throw new Error("The marketplace skill contains too many files.");
    }
    let declaredBytes = 0;
    for (const entry of selectedFiles) {
      if (entry.mode === "120000") throw new Error("Marketplace skill links are not supported.");
      if (typeof entry.size === "number") declaredBytes += entry.size;
    }
    if (declaredBytes > MAX_MARKETPLACE_SKILL_BYTES) {
      throw new Error("The marketplace skill is too large.");
    }

    const environment = await this.resolveEnvironment(payload.projectLocation, payload.wslDistro);
    const destinationRoot = this.managedRoot(
      environment,
      payload.destinationScope,
      payload.availability,
    );
    const destination = join(destinationRoot.fsPath, skillId);
    const disabledDestination = join(disabledRoot(destinationRoot.fsPath), skillId);
    if (
      !payload.replace &&
      ((await pathExists(destination)) || (await pathExists(disabledDestination)))
    ) {
      throw new Error(`A managed skill named ${skillId} already exists.`);
    }
    const stagingPath = join(destinationRoot.fsPath, `.poracode-marketplace-${randomUUID()}`);
    const backups: Array<{ original: string; backup: string }> = [];
    try {
      await mkdir(stagingPath, { recursive: true });
      // The overall size is pre-checked against the declared sizes above; the
      // per-file cap here still bounds each download independently, so files
      // can be fetched concurrently without weakening either guard.
      const fileBytes = await mapWithConcurrency(
        selectedFiles,
        MARKETPLACE_DOWNLOAD_CONCURRENCY,
        async (entry) => {
          const relativePath = posix.relative(prefix, entry.path);
          if (!relativePath || relativePath.startsWith("../") || relativePath.includes("\\")) {
            throw new Error("Marketplace skill contains an invalid path.");
          }
          const rawPath = entry.path.split("/").map(encodeURIComponent).join("/");
          const rawResponse = await this.fetchImpl(
            `https://raw.githubusercontent.com/${source}/${encodeURIComponent(branch)}/${rawPath}`,
            { headers: { "User-Agent": "Poracode" } },
          );
          if (!rawResponse.ok) throw new Error(`GitHub returned HTTP ${rawResponse.status}.`);
          const contents = Buffer.from(await rawResponse.arrayBuffer());
          if (contents.length > MAX_MARKETPLACE_FILE_BYTES) {
            throw new Error("A marketplace skill file is too large.");
          }
          const outputPath = join(stagingPath, ...relativePath.split("/"));
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, contents);
          return contents.length;
        },
      );
      if (fileBytes.reduce((total, size) => total + size, 0) > MAX_MARKETPLACE_SKILL_BYTES) {
        throw new Error("The marketplace skill is too large.");
      }
      const skillContent = await readFile(join(stagingPath, SKILL_FILE));
      const metadata = parseSkillMetadata(skillContent.toString("utf8"), skillId);
      const invalidReason = validateSkillMetadata(metadata, skillId);
      if (invalidReason) throw new Error(`Cannot install an invalid skill (${invalidReason}).`);
      const sourceHash = await hashDirectory(stagingPath);
      await writeManifest(stagingPath, {
        version: 1,
        mode: "copy",
        sourcePath: `https://github.com/${source}/tree/${branch}/${prefix}`,
        sourceHash,
      });
      for (const original of [destination, disabledDestination]) {
        if (!(await pathExists(original))) continue;
        const backup = join(dirname(original), `.poracode-backup-${randomUUID()}`);
        await rename(original, backup);
        backups.push({ original, backup });
      }
      await rename(stagingPath, destination);
      try {
        await this.syncProjections(environment);
      } catch (error) {
        await removeSkillPath(destination);
        for (const backup of backups.toReversed()) await rename(backup.backup, backup.original);
        await this.syncProjections(environment).catch(() => undefined);
        throw error;
      }
      for (const backup of backups) await removeSkillPath(backup.backup);
      return { installed: destination };
    } catch (error) {
      if (await pathExists(stagingPath)) await removeSkillPath(stagingPath);
      for (const backup of backups.toReversed()) {
        if (await pathExists(backup.backup)) await rename(backup.backup, backup.original);
      }
      throw error;
    }
  }

  async scan(input: ScanSkillsPayload): Promise<SkillScanResult> {
    const payload = scanSkillsPayloadSchema.parse(input);
    const environment = await this.resolveEnvironment(payload.projectLocation, payload.wslDistro);
    const activeAdapter = payload.agentKind ? this.adapters.get(payload.agentKind) : undefined;
    const roots = this.roots(environment, activeAdapter ? [activeAdapter] : undefined);
    const issues: SkillScanIssue[] = [];
    const skills: SkillEntry[] = [];

    const builtInIssues: SkillScanIssue[] = [];
    const [rootScans, builtInSkills] = await Promise.all([
      Promise.all(
        roots.map(async (root) => {
          const rootIssues: SkillScanIssue[] = [];
          return { skills: await this.scanRoot(root, rootIssues), issues: rootIssues };
        }),
      ),
      this.scanProviderBuiltIns(roots, builtInIssues),
    ]);
    skills.push(
      ...this.pluginSkillPolicy.resolveScanEntries(
        rootScans.flatMap((result) => result.skills),
        {
          ...(payload.projectLocation ? { projectLocation: payload.projectLocation } : {}),
          ...(activeAdapter ? { capabilities: activeAdapter.capabilities } : {}),
          ...(payload.presentationMode ? { presentationMode: payload.presentationMode } : {}),
        },
      ),
    );
    for (const result of rootScans) issues.push(...result.issues);
    skills.push(...builtInSkills);
    issues.push(...builtInIssues);

    if (!activeAdapter) {
      // A managed skill's hash is only consumed when an external skill shares
      // its scope+name, so skip hashing (a full recursive directory read) for
      // managed skills that no external skill can collide with.
      const externalKeys = new Set(
        skills
          .filter((skill) => skill.origin === "external" && skill.valid)
          .map((skill) => `${skill.scope}:${skill.name.toLowerCase()}`),
      );
      const managedByScope = new Map<string, { hash: string; entry: SkillEntry }>();
      const managedHashes = await Promise.all(
        skills
          .filter(
            (skill) =>
              skill.origin === "managed" &&
              skill.availability !== "poracode" &&
              skill.valid &&
              externalKeys.has(`${skill.scope}:${skill.name.toLowerCase()}`),
          )
          .map(async (skill) => {
            try {
              return { skill, hash: await hashDirectory(skill.absolutePath) };
            } catch (error) {
              return { skill, error };
            }
          }),
      );
      for (const result of managedHashes) {
        if ("error" in result) {
          issues.push({
            providerId: result.skill.providerId,
            path: result.skill.absolutePath,
            message: result.error instanceof Error ? result.error.message : String(result.error),
          });
          continue;
        }
        managedByScope.set(`${result.skill.scope}:${result.skill.name.toLowerCase()}`, {
          hash: result.hash,
          entry: result.skill,
        });
      }

      const externalComparisons: { skill: SkillEntry; managedHash: string }[] = [];
      for (const skill of skills) {
        if (skill.origin !== "external" || !skill.valid) continue;
        const managed = managedByScope.get(`${skill.scope}:${skill.name.toLowerCase()}`);
        if (!managed) {
          skill.importState = "available";
          continue;
        }
        externalComparisons.push({ skill, managedHash: managed.hash });
      }
      const externalHashes = await Promise.all(
        externalComparisons.map(async ({ skill, managedHash }) => {
          try {
            return {
              skill,
              importState:
                (await hashDirectory(
                  skill.linked && skill.sourcePath ? skill.sourcePath : skill.absolutePath,
                )) === managedHash
                  ? ("already-imported" as const)
                  : ("conflict" as const),
            };
          } catch (error) {
            return { skill, error };
          }
        }),
      );
      for (const result of externalHashes) {
        if ("error" in result) {
          issues.push({
            providerId: result.skill.providerId,
            path: result.skill.absolutePath,
            message: result.error instanceof Error ? result.error.message : String(result.error),
          });
          result.skill.importState = "conflict";
          continue;
        }
        result.skill.importState = result.importState;
      }
    }

    skills.sort((left, right) => {
      const scopeOrder = left.scope === "project" ? -1 : right.scope === "project" ? 1 : 0;
      return (
        scopeOrder ||
        left.providerLabel.localeCompare(right.providerLabel) ||
        left.name.localeCompare(right.name)
      );
    });
    const effectiveSkillIds = activeAdapter
      ? this.effectiveSkillIds(activeAdapter, skills, environment)
      : [];
    return skillScanResultSchema.parse({
      skills,
      effectiveSkillIds,
      invocation: activeAdapter?.skillSupport?.invocation ?? null,
      issues,
      canLinkToGlobal: !environment.wsl,
    });
  }

  private effectiveSkillIds(
    adapter: AgentAdapter,
    skills: SkillEntry[],
    environment: ResolvedEnvironment,
  ): string[] {
    if (!adapter.skillSupport) return [];
    const disabledNames = new Set(
      (adapter.capabilities.disabledSkillNames ?? []).map((name) => name.toLowerCase()),
    );
    const readableRoots = new Set<string>();
    for (const root of this.locatedRootsForSpecs(
      environment,
      adapter,
      adapter.skillSupport.roots,
      () => adapter.label,
    )) {
      readableRoots.add(normalizePath(root.fsPath));
    }

    const candidates = skills
      .filter((skill) => {
        if (!skill.enabled || !skill.valid || disabledNames.has(skill.name.toLowerCase())) {
          return false;
        }
        if (skill.origin === "managed" || skill.origin === "plugin") return true;
        if (skill.origin === "built-in") {
          // App-bundled skills reach every provider through prompt injection
          // or path hints. Provider-native built-ins stay with their adapter.
          return skill.providerId === BUNDLED_PROVIDER_ID || skill.providerGroupId === adapter.kind;
        }
        return readableRoots.has(normalizePath(skill.rootPath));
      })
      .toSorted((left, right) => {
        const scopeOrder = adapter.skillSupport?.precedence?.scopeOrder ?? ["project", "global"];
        const leftScope = scopeOrder.indexOf(left.scope);
        const rightScope = scopeOrder.indexOf(right.scope);
        if (leftScope !== rightScope) return leftScope - rightScope;
        const declaredRootOrder = adapter.skillSupport?.precedence?.[left.scope] ?? [];
        const rootOrder = declaredRootOrder.includes("agents")
          ? declaredRootOrder.flatMap((id) => (id === "agents" ? ["poracode", id] : [id]))
          : [...declaredRootOrder, "poracode"];
        const leftRoot = rootOrder.indexOf(left.providerId);
        const rightRoot = rootOrder.indexOf(right.providerId);
        if (leftRoot >= 0 || rightRoot >= 0) {
          const normalizedLeft = leftRoot < 0 ? rootOrder.length : leftRoot;
          const normalizedRight = rightRoot < 0 ? rootOrder.length : rightRoot;
          if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
        }
        // Poracode-only skills take precedence over the shared `.agents` root;
        // all other provider-declared ordering stays intact. App-bundled
        // defaults remain the final fallback.
        const originWeight = (skill: SkillEntry) =>
          skill.providerId === BUNDLED_PROVIDER_ID || skill.origin === "plugin"
            ? 3
            : skill.origin !== "managed"
              ? 0
              : skill.availability === "poracode"
                ? 1
                : 2;
        return originWeight(left) - originWeight(right);
      });
    const names = new Set<string>();
    return candidates.flatMap((skill) => {
      const name = skill.name.toLowerCase();
      if (names.has(name)) return [];
      names.add(name);
      return [skill.id];
    });
  }

  async setEnabled(input: SetSkillEnabledPayload): Promise<void> {
    const payload = setSkillEnabledPayloadSchema.parse(input);
    const environment = await this.resolveEnvironment(payload.projectLocation, payload.wslDistro);
    const root = this.mutableRootForPath(payload.absolutePath, this.roots(environment));
    const currentlyDisabled = isDirectChild(disabledRoot(root.fsPath), payload.absolutePath);
    if (payload.enabled === !currentlyDisabled) return;
    const destinationRoot = payload.enabled ? root.fsPath : disabledRoot(root.fsPath);
    const destination = join(destinationRoot, basename(payload.absolutePath));
    const linkedImports =
      root.origin === "external"
        ? await this.linkedImportsForSource(
            environment,
            payload.absolutePath,
            destination,
            payload.enabled,
          )
        : [];
    let displacedProjection: string | undefined;
    if (await pathExists(destination)) {
      const manifest = payload.enabled ? await readManifest(destination) : undefined;
      if (manifest?.mode !== "projection") {
        throw new Error(
          `A skill named ${basename(payload.absolutePath)} already exists in the destination.`,
        );
      }
      displacedProjection = join(disabledRoot(root.fsPath), `.poracode-enable-${randomUUID()}`);
      await this.ensureDirectory(environment, dirname(displacedProjection));
      await this.moveSkillPath(environment, destination, displacedProjection);
    }
    await this.ensureDirectory(environment, destinationRoot);
    let sourceMoved = false;
    let movedLinkedImports: LinkedImportMove[] = [];
    try {
      await this.moveSkillPath(environment, payload.absolutePath, destination);
      sourceMoved = true;
      movedLinkedImports = await this.moveLinkedImports(linkedImports);
    } catch (error) {
      if (sourceMoved) await this.moveSkillPath(environment, destination, payload.absolutePath);
      if (displacedProjection) {
        await this.moveSkillPath(environment, displacedProjection, destination).catch(
          (rollbackError) => {
            console.warn("[skills] failed to restore displaced projection:", rollbackError);
          },
        );
      }
      throw error;
    }
    try {
      await this.syncProjections(environment);
    } catch (error) {
      await this.moveSkillPath(environment, destination, payload.absolutePath);
      await this.rollbackLinkedImports(movedLinkedImports).catch((rollbackError) => {
        console.warn(
          "[skills] failed to restore linked imports after toggle rollback:",
          rollbackError,
        );
      });
      if (displacedProjection) {
        await this.moveSkillPath(environment, displacedProjection, destination).catch(
          (rollbackError) => {
            console.warn("[skills] failed to restore displaced projection:", rollbackError);
          },
        );
      }
      await this.syncProjections(environment).catch((rollbackError) => {
        console.warn(
          "[skills] failed to restore projections after enable rollback:",
          rollbackError,
        );
      });
      throw error;
    }
    if (displacedProjection) await removeSkillPath(displacedProjection);
  }

  async delete(input: DeleteSkillPayload): Promise<void> {
    const payload = deleteSkillPayloadSchema.parse(input);
    const environment = await this.resolveEnvironment(payload.projectLocation, payload.wslDistro);
    this.mutableRootForPath(payload.absolutePath, this.roots(environment));
    const backup = join(dirname(payload.absolutePath), `.poracode-delete-${randomUUID()}`);
    await rename(payload.absolutePath, backup);
    try {
      await this.syncProjections(environment);
    } catch (error) {
      await rename(backup, payload.absolutePath);
      await this.syncProjections(environment).catch((rollbackError) => {
        console.warn(
          "[skills] failed to restore projections after delete rollback:",
          rollbackError,
        );
      });
      throw error;
    }
    await removeSkillPath(backup).catch((error) => {
      console.warn(`[skills] failed to remove delete backup ${backup}:`, error);
    });
  }

  async import(input: ImportSkillsPayload): Promise<ImportSkillsResult> {
    const payload = importSkillsPayloadSchema.parse(input);
    const prepared: PreparedSkillImport[] = [];
    const destinations = new Set<string>();
    try {
      for (const skill of payload.skills) {
        const item = await this.prepareImport(skill);
        const destinationKey = normalizePath(item.destination);
        if (destinations.has(destinationKey)) {
          throw new Error(`More than one selected skill would import to ${item.destination}.`);
        }
        destinations.add(destinationKey);
        prepared.push(item);
      }
      for (const item of prepared) await this.stageImport(item);
    } catch (error) {
      await this.removeStagedImports(prepared);
      throw error;
    }

    const committed: PreparedSkillImport[] = [];
    try {
      for (const item of prepared) {
        for (const original of [item.destination, item.disabledDestination]) {
          if (!(await pathExists(original))) continue;
          const backup = join(dirname(original), `.poracode-backup-${randomUUID()}`);
          await rename(original, backup);
          item.backups.push({ original, backup });
        }
        await rename(item.stagingPath, item.destination);
        committed.push(item);
      }
    } catch (error) {
      await this.rollbackImports(prepared, committed);
      throw error;
    }

    const environments = new Map<string, ResolvedEnvironment>();
    for (const item of prepared) {
      const key = `${item.environment.homeFsPath}\0${item.environment.projectFsPath ?? ""}`;
      environments.set(key, item.environment);
    }
    try {
      for (const environment of environments.values()) await this.syncProjections(environment);
    } catch (error) {
      await this.rollbackImports(prepared, committed);
      for (const environment of environments.values()) {
        await this.syncProjections(environment).catch((rollbackError) => {
          console.warn(
            "[skills] failed to restore projections after import rollback:",
            rollbackError,
          );
        });
      }
      throw error;
    }
    for (const item of prepared) {
      for (const backup of item.backups) {
        await removeSkillPath(backup.backup).catch((error) => {
          console.warn(`[skills] failed to remove import backup ${backup.backup}:`, error);
        });
      }
    }
    return { imported: prepared.map((item) => item.destination) };
  }

  async prepareForLaunch(projectLocation: ProjectLocation, agentKind?: string): Promise<void> {
    const adapter = agentKind ? this.adapters.get(agentKind) : undefined;
    await this.syncProjections(
      await this.resolveEnvironment(projectLocation),
      adapter ? [adapter] : undefined,
    );
  }

  /**
   * Enforce plugin installation policy at the supervisor boundary. Renderer
   * discovery is advisory: a stale or crafted bundled-plugin segment must not
   * reach a provider after the plugin or contribution has been disabled.
   */
  async filterPluginSkillSegments(
    segments: PromptSegment[],
    context: Omit<PluginSkillPolicyContext, "capabilities"> & { agentKind?: AgentKind } = {},
  ): Promise<PromptSegment[]> {
    const adapter = context.agentKind ? this.adapters.get(context.agentKind) : undefined;
    return this.pluginSkillPolicy.filterSegments(segments, {
      ...(context.projectLocation ? { projectLocation: context.projectLocation } : {}),
      ...(adapter ? { capabilities: adapter.capabilities } : {}),
      ...(context.presentationMode ? { presentationMode: context.presentationMode } : {}),
      ...(context.launchConfig ? { launchConfig: context.launchConfig } : {}),
    });
  }

  /**
   * Inline SKILL.md instructions for skill segments the active provider cannot
   * load natively — its `skillSupport.roots` don't cover the skill's folder
   * (canonical `.agents/skills`, app-bundled skills, another provider's
   * folder). This is the portable-skills fallback that makes an invoked skill
   * work on every provider; providers reading the folder natively (e.g. codex
   * skills under `.codex/skills`) get nothing extra. Returns `undefined` when
   * no segment needs inlining.
   */
  async buildTurnSkillInjection(input: {
    agentKind: string;
    projectLocation?: ProjectLocation;
    segments: readonly PromptSegment[];
  }): Promise<string | undefined> {
    if (!input.segments.some((segment) => segment.kind === "skill")) return undefined;
    const adapter = this.adapters.get(input.agentKind);
    const environment = await this.resolveEnvironment(input.projectLocation);
    const nativeRootPaths = this.nativeSkillRootPaths(adapter, environment);
    const pending = selectSkillSegmentsForInjection(input.segments, nativeRootPaths);
    if (pending.length === 0) return undefined;
    const sources = [];
    for (const segment of pending) {
      // Segment paths are display paths (Linux form inside WSL environments);
      // bundled skills keep host paths even there, so only rewrite
      // posix-absolute paths through the distro's UNC mapping.
      const fsPath =
        environment.wsl && environment.distro && segment.path.startsWith("/")
          ? this.wslFsPath(environment.distro, segment.path)
          : segment.path;
      try {
        const buffer = await readFile(fsPath);
        if (buffer.length > MAX_SKILL_FILE_BYTES) continue;
        sources.push({
          name: segment.name,
          directory: posix.dirname(segment.path.replace(/\\/gu, "/")),
          content: buffer.toString("utf8"),
        });
      } catch {
        // Unreadable skill (deleted since invocation, provider-native path,
        // …) — the invocation text still reaches the agent, just uninlined.
      }
    }
    if (sources.length === 0) return undefined;
    const text = buildInlineSkillInstructions(sources);
    return text.length > 0 ? text : undefined;
  }

  /**
   * Terminal-thread fallback: replace skill segments the agent's CLI cannot
   * resolve natively with a short path-hint sentence (the model reads the
   * SKILL.md itself), instead of typing a multi-KB body into the TUI. Native
   * cases keep the segment untouched: the skill lives under a root the CLI
   * scans, or it is a shared skill this adapter projects into its own folder.
   */
  async rewriteTerminalSkillSegments(input: {
    agentKind: string;
    projectLocation?: ProjectLocation;
    segments: PromptSegment[];
  }): Promise<PromptSegment[]> {
    const segments = input.segments;
    if (!segments.some((segment) => segment.kind === "skill")) return segments;
    const adapter = this.adapters.get(input.agentKind);
    const environment = await this.resolveEnvironment(input.projectLocation);
    const nativeRootPaths = this.nativeSkillRootPaths(adapter, environment);
    const bundledRoot = this.bundledRoot();
    let bundledHintRoot = bundledRoot?.displayPath;
    if (bundledRoot && environment.wsl && environment.distro) {
      const [result] = await batchWslCommandsAsync(environment.distro, [
        `wslpath -a -u -- ${quotePosixShellArg(bundledRoot.fsPath)}`,
      ]);
      if (result?.ok && result.stdout) bundledHintRoot = result.stdout;
    }
    const managedDisplayFor = (scope: SkillScope): string | undefined =>
      scope === "project" && !environment.projectFsPath
        ? undefined
        : this.managedRoot(environment, scope, "shared").displayPath;
    const projectsScope = (scope: SkillScope): boolean =>
      (adapter?.skillSupport?.projectionRoots ?? []).some((spec) =>
        scope === "global" ? Boolean(spec.globalPath) : Boolean(spec.projectPath),
      );

    let changed = false;
    const rewritten = segments.map<PromptSegment>((segment) => {
      if (segment.kind !== "skill") return segment;
      if (isPathUnderAny(segment.path, nativeRootPaths)) return segment;
      const managedDisplay = managedDisplayFor(segment.scope);
      // Managed skills this adapter projects into its own folders resolve
      // natively in the CLI (e.g. `.agents` skills copied to `.claude/skills`).
      if (
        managedDisplay &&
        isPathUnderAny(segment.path, [managedDisplay]) &&
        projectsScope(segment.scope)
      ) {
        return segment;
      }
      const normalized = segment.path.replace(/\\/gu, "/");
      const hintPath =
        bundledRoot && bundledHintRoot && isPathUnderAny(segment.path, [bundledRoot.displayPath])
          ? posix.join(
              bundledHintRoot,
              posix.relative(bundledRoot.displayPath.replace(/\\/gu, "/"), normalized),
            )
          : normalized;
      changed = true;
      return {
        kind: "text",
        content: buildSkillPathHintText(segment.name, hintPath),
      };
    });
    return changed ? rewritten : segments;
  }

  /**
   * Display paths of every skill root the adapter's own binary scans.
   */
  private nativeSkillRootPaths(
    adapter: AgentAdapter | undefined,
    environment: ResolvedEnvironment,
  ): string[] {
    if (!adapter?.skillSupport) return [];
    const nativeRootPaths: string[] = [];
    for (const root of this.locatedRootsForSpecs(
      environment,
      adapter,
      adapter.skillSupport.roots,
      () => adapter.label,
    )) {
      nativeRootPaths.push(root.displayPath);
    }
    return nativeRootPaths;
  }

  private async prepareImport(input: ImportSkillPayload): Promise<PreparedSkillImport> {
    const environment = await this.resolveEnvironment(input.projectLocation, input.wslDistro);
    const sourceEnvironment =
      input.sourceProjectLocation || input.sourceWslDistro
        ? await this.resolveEnvironment(input.sourceProjectLocation, input.sourceWslDistro)
        : environment;
    const sourceRoot = this.rootForPath(input.sourcePath, this.roots(sourceEnvironment));
    if (sourceRoot.origin !== "external") {
      throw new Error("Only skills discovered in an external provider folder can be imported.");
    }
    const sourceFile = join(input.sourcePath, SKILL_FILE);
    const content = await readFile(sourceFile);
    if (content.length > MAX_SKILL_FILE_BYTES) throw new Error("SKILL.md is too large to import.");

    const folderName = basename(input.sourcePath);
    const metadata = parseSkillMetadata(content.toString("utf8"), folderName);
    const invalidReason = validateSkillMetadata(metadata, folderName);
    if (invalidReason) throw new Error(`Cannot import an invalid skill (${invalidReason}).`);
    const sourceHash = input.mode === "copy" ? await hashDirectory(input.sourcePath) : undefined;
    const destinationRoot = this.managedRoot(
      environment,
      input.destinationScope,
      input.availability,
    );
    const destination = join(destinationRoot.fsPath, folderName);
    const disabledDestination = join(disabledRoot(destinationRoot.fsPath), folderName);
    if ((await pathExists(destination)) || (await pathExists(disabledDestination))) {
      if (!input.replace) throw new Error(`A managed skill named ${folderName} already exists.`);
    }

    if (input.mode === "link") {
      if (input.destinationScope !== "global" || environment.wsl) {
        throw new Error("Linked imports are available only for host-global skills.");
      }
    }
    return {
      input,
      environment,
      destination,
      disabledDestination,
      stagingPath: join(destinationRoot.fsPath, `.poracode-import-${randomUUID()}`),
      ...(sourceHash ? { sourceHash } : {}),
      backups: [],
    };
  }

  private async stageImport(item: PreparedSkillImport): Promise<void> {
    await mkdir(dirname(item.stagingPath), { recursive: true });
    if (item.input.mode === "link") {
      await createDirectoryLink(item.input.sourcePath, item.stagingPath);
      return;
    }
    try {
      await copyDirectorySafely(item.input.sourcePath, item.stagingPath);
      await writeManifest(item.stagingPath, {
        version: 1,
        mode: "copy",
        sourcePath: item.input.sourcePath,
        sourceHash: item.sourceHash!,
      });
    } catch (error) {
      if (await pathExists(item.stagingPath)) await removeSkillPath(item.stagingPath);
      throw error;
    }
  }

  private async removeStagedImports(items: PreparedSkillImport[]): Promise<void> {
    for (const item of items) {
      if (await pathExists(item.stagingPath)) await removeSkillPath(item.stagingPath);
    }
  }

  private async rollbackImports(
    prepared: PreparedSkillImport[],
    committed: PreparedSkillImport[],
  ): Promise<void> {
    for (const item of committed.toReversed()) {
      if (await pathExists(item.destination)) await removeSkillPath(item.destination);
    }
    for (const item of prepared.toReversed()) {
      for (const backup of item.backups.toReversed()) {
        if (await pathExists(backup.backup)) await rename(backup.backup, backup.original);
      }
      if (await pathExists(item.stagingPath)) await removeSkillPath(item.stagingPath);
    }
  }

  private async linkedImportsForSource(
    environment: ResolvedEnvironment,
    sourcePath: string,
    destinationTarget: string,
    enabled: boolean,
  ): Promise<LinkedImportMove[]> {
    const moves: LinkedImportMove[] = [];
    for (const availability of ["shared", "poracode"] as const) {
      const managedRoot = this.managedRoot(environment, "global", availability);
      const sourceRoot = enabled ? disabledRoot(managedRoot.fsPath) : managedRoot.fsPath;
      const destinationRoot = enabled ? managedRoot.fsPath : disabledRoot(managedRoot.fsPath);
      const linkName = basename(sourcePath);
      const linkPath = join(sourceRoot, linkName);
      let info;
      try {
        info = await lstat(linkPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (!info.isSymbolicLink()) continue;
      let targetPath: string;
      try {
        targetPath = await realpath(linkPath);
      } catch {
        continue;
      }
      if (normalizePath(targetPath) !== normalizePath(sourcePath)) continue;
      const destinationPath = join(destinationRoot, linkName);
      if (await pathExists(destinationPath)) {
        throw new Error(`A linked skill named ${linkName} already exists in the destination.`);
      }
      moves.push({
        sourcePath: linkPath,
        destinationPath,
        sourceTarget: sourcePath,
        destinationTarget,
      });
    }
    return moves;
  }

  private async moveLinkedImports(moves: LinkedImportMove[]): Promise<LinkedImportMove[]> {
    const moved: LinkedImportMove[] = [];
    try {
      for (const move of moves) {
        await mkdir(dirname(move.destinationPath), { recursive: true });
        await unlink(move.sourcePath);
        try {
          await createDirectoryLink(move.destinationTarget, move.destinationPath);
        } catch (error) {
          await createDirectoryLink(move.sourceTarget, move.sourcePath);
          throw error;
        }
        moved.push(move);
      }
      return moved;
    } catch (error) {
      await this.rollbackLinkedImports(moved);
      throw error;
    }
  }

  private async rollbackLinkedImports(moves: LinkedImportMove[]): Promise<void> {
    for (const move of moves.toReversed()) {
      if (await pathExists(move.destinationPath)) await removeSkillPath(move.destinationPath);
      await mkdir(dirname(move.sourcePath), { recursive: true });
      await createDirectoryLink(move.sourceTarget, move.sourcePath);
    }
  }

  private async resolveEnvironment(
    projectLocation?: ProjectLocation,
    wslDistro?: string,
  ): Promise<ResolvedEnvironment> {
    const distro = projectLocation?.kind === "wsl" ? projectLocation.distro : wslDistro;
    if (distro) {
      if (projectLocation && projectLocation.kind !== "wsl") {
        throw new Error("A Windows project cannot be combined with a WSL skills target.");
      }
      const overrideNames = [...this.adapters.values()].flatMap(
        (adapter) =>
          adapter.skillSupport?.roots.flatMap((root) =>
            root.globalOverride ? [root.globalOverride.env] : [],
          ) ?? [],
      );
      const [linuxHome, wslEnv] = await Promise.all([
        this.resolveWslHome(distro),
        this.resolveWslEnv(distro, overrideNames),
      ]);
      if (!linuxHome) throw new Error(`Unable to resolve the home directory for ${distro}.`);
      return {
        homeFsPath: this.wslFsPath(distro, linuxHome),
        homeDisplayPath: linuxHome,
        ...(projectLocation?.kind === "wsl"
          ? {
              projectFsPath: projectLocation.uncPath,
              projectDisplayPath: projectLocation.linuxPath,
              projectLabel: basename(projectLocation.linuxPath) || projectLocation.linuxPath,
            }
          : {}),
        wsl: true,
        distro,
        wslEnv,
      };
    }
    const home = this.homeDirectory();
    if (!projectLocation) return { homeFsPath: home, homeDisplayPath: home, wsl: false };
    if (projectLocation.kind === "wsl") {
      throw new Error("A WSL project requires a WSL skills environment.");
    }
    const projectPath = projectLocation.path;
    return {
      homeFsPath: home,
      homeDisplayPath: home,
      projectFsPath: projectPath,
      projectDisplayPath: projectPath,
      projectLabel: basename(projectPath) || projectPath,
      wsl: false,
    };
  }

  /**
   * Located roots for one adapter's spec list, applying the shared
   * scope/availability guard. Callers pass `providerLabel` because display
   * roots use the per-spec label while path-only lookups use the adapter label.
   */
  private *locatedRootsForSpecs(
    environment: ResolvedEnvironment,
    adapter: AgentAdapter,
    specs: readonly AgentSkillRootSpec[],
    providerLabel: (spec: AgentSkillRootSpec) => string,
  ): Generator<LocatedRoot> {
    for (const spec of specs) {
      for (const scope of ["global", "project"] as const) {
        const path = scope === "global" ? spec.globalPath : spec.projectPath;
        if (!path || (scope === "project" && !environment.projectFsPath)) continue;
        yield this.locateRoot(
          environment,
          spec,
          scope,
          providerLabel(spec),
          adapter.kind,
          adapter.label,
        );
      }
    }
  }

  private roots(
    environment: ResolvedEnvironment,
    selectedAdapters?: readonly AgentAdapter[],
  ): LocatedRoot[] {
    const roots: LocatedRoot[] = [
      this.managedRoot(environment, "global", "shared"),
      this.managedRoot(environment, "global", "poracode"),
    ];
    if (environment.projectFsPath) {
      roots.push(
        this.managedRoot(environment, "project", "shared"),
        this.managedRoot(environment, "project", "poracode"),
      );
    }
    const bundledRoot = this.bundledRoot();
    if (bundledRoot) roots.push(bundledRoot);
    roots.push(...this.pluginLocatedRoots());
    const seen = new Set(roots.map((root) => normalizePath(root.fsPath)));

    for (const adapter of selectedAdapters ?? this.adapters.values()) {
      if (!adapter.skillSupport) continue;
      for (const root of this.locatedRootsForSpecs(
        environment,
        adapter,
        adapter.skillSupport.roots,
        (spec) => spec.label,
      )) {
        const key = normalizePath(root.fsPath);
        if (seen.has(key)) continue;
        seen.add(key);
        roots.push(root);
      }
    }
    return roots;
  }

  private projectionRoots(
    environment: ResolvedEnvironment,
    selectedAdapters?: readonly AgentAdapter[],
  ): LocatedRoot[] {
    const roots: LocatedRoot[] = [];
    const seen = new Set<string>();
    for (const adapter of selectedAdapters ?? this.adapters.values()) {
      for (const root of this.locatedRootsForSpecs(
        environment,
        adapter,
        adapter.skillSupport?.projectionRoots ?? [],
        (spec) => spec.label,
      )) {
        const key = normalizePath(root.fsPath);
        if (seen.has(key)) continue;
        seen.add(key);
        roots.push(root);
      }
    }
    return roots;
  }

  private managedRoot(
    environment: ResolvedEnvironment,
    scope: SkillScope,
    availability: SkillAvailability = "shared",
  ): LocatedRoot {
    if (scope === "project" && !environment.projectFsPath) {
      throw new Error("A project is required for project-scoped skills.");
    }
    const base = scope === "global" ? environment.homeFsPath : environment.projectFsPath!;
    const displayBase =
      scope === "global" ? environment.homeDisplayPath : environment.projectDisplayPath!;
    return {
      providerId: availability === "poracode" ? "poracode" : "agents",
      providerLabel: availability === "poracode" ? "Poracode only" : "Shared agents",
      ...(availability === "poracode"
        ? {
            providerGroupId: PORACODE_PROVIDER_GROUP_ID,
            providerGroupLabel: PORACODE_PROVIDER_GROUP_LABEL,
            providerGroupOrder: PORACODE_PROVIDER_GROUP_ORDER,
          }
        : {}),
      scope,
      scopeLabel: scope === "global" ? "Global" : environment.projectLabel!,
      availability,
      fsPath: join(base, availability === "poracode" ? ".poracode" : ".agents", "skills"),
      displayPath: posix.join(
        displayBase.replace(/\\/gu, "/"),
        availability === "poracode" ? ".poracode" : ".agents",
        "skills",
      ),
      origin: "managed",
      mutable: true,
      ...(environment.distro ? { wslDistro: environment.distro } : {}),
    };
  }

  /**
   * Read-only skills shipped with the app (`resources/skills`, surfaced via
   * `PORACODE_BUNDLED_SKILLS_DIR`). Always host-side paths, even for WSL
   * environments — the supervisor reads them directly and delivers them
   * through prompt injection or terminal path hints.
   */
  private bundledRoot(): LocatedRoot | undefined {
    const dir = this.env.PORACODE_BUNDLED_SKILLS_DIR?.trim();
    if (!dir) return undefined;
    return {
      providerId: BUNDLED_PROVIDER_ID,
      providerLabel: BUNDLED_PROVIDER_LABEL,
      providerGroupId: PORACODE_PROVIDER_GROUP_ID,
      providerGroupLabel: PORACODE_PROVIDER_GROUP_LABEL,
      providerGroupOrder: PORACODE_PROVIDER_GROUP_ORDER,
      scope: "global",
      scopeLabel: "Global",
      fsPath: dir,
      displayPath: dir.replace(/\\/gu, "/"),
      origin: "built-in",
      mutable: false,
    };
  }

  /**
   * One scan root per loaded Agent Plugins package that ships skills. Each root
   * is that package's own `skills/` directory, so containment and attribution
   * follow the package boundary rather than a shared folder.
   */
  private pluginSkillRoots(): PluginSkillRoot[] {
    return this.readPlugins().flatMap((plugin) =>
      plugin.skills.length > 0
        ? [{ plugin, skillsRoot: join(plugin.root, PLUGIN_SKILLS_DIR) }]
        : [],
    );
  }

  private pluginLocatedRoots(): LocatedRoot[] {
    return this.pluginSkillRoots().map(({ plugin, skillsRoot }) => {
      const label = plugin.poracode.title ?? plugin.name;
      return {
        providerId: pluginSkillProviderId(plugin.name),
        providerLabel: label,
        providerGroupId: pluginSkillProviderId(plugin.name),
        providerGroupLabel: label,
        providerGroupOrder: -2,
        scope: "global",
        scopeLabel: "Global",
        fsPath: skillsRoot,
        displayPath: skillsRoot.replace(/\\/gu, "/"),
        origin: "plugin",
        mutable: false,
      };
    });
  }

  private locateRoot(
    environment: ResolvedEnvironment,
    spec: AgentSkillRootSpec,
    scope: SkillScope,
    providerLabel: string,
    providerGroupId: string,
    providerGroupLabel: string,
  ): LocatedRoot {
    const explicitBase = scope === "global" ? spec.globalBasePath?.trim() : undefined;
    const environmentBase =
      scope === "global" && spec.globalOverride
        ? (environment.wsl
            ? (environment.wslEnv?.[spec.globalOverride.env] ?? this.env[spec.globalOverride.env])
            : this.env[spec.globalOverride.env]
          )?.trim()
        : undefined;
    const configured = explicitBase || environmentBase;
    const relativePath =
      configured && spec.globalOverride
        ? spec.globalOverride.path
        : scope === "global"
          ? spec.globalPath!
          : spec.projectPath!;
    let base = scope === "global" ? environment.homeFsPath : environment.projectFsPath!;
    let displayBase =
      scope === "global" ? environment.homeDisplayPath : environment.projectDisplayPath!;
    if (configured) {
      if (environment.wsl) {
        const normalized = configured.replace(/\\/gu, "/");
        const linuxBase =
          normalized === "~"
            ? environment.homeDisplayPath
            : normalized.startsWith("~/")
              ? posix.join(environment.homeDisplayPath, normalized.slice(2))
              : posix.isAbsolute(normalized)
                ? normalized
                : posix.join(environment.homeDisplayPath, normalized);
        base = this.wslFsPath(environment.distro!, linuxBase);
        displayBase = linuxBase;
      } else {
        const expanded =
          configured === "~"
            ? environment.homeFsPath
            : /^~[\\/]/u.test(configured)
              ? join(environment.homeFsPath, configured.slice(2))
              : configured;
        base = isAbsolute(expanded) ? expanded : resolve(environment.homeFsPath, expanded);
        displayBase = base;
      }
    }
    return {
      providerId: spec.id,
      providerLabel,
      providerGroupId,
      providerGroupLabel,
      ...(spec.builtInPath ? { builtInPath: spec.builtInPath } : {}),
      scope,
      scopeLabel: scope === "global" ? "Global" : environment.projectLabel!,
      fsPath: join(base, ...relativePath.split("/")),
      displayPath: posix.join(displayBase.replace(/\\/gu, "/"), relativePath),
      origin: "external",
      mutable: true,
      ...(environment.distro ? { wslDistro: environment.distro } : {}),
    };
  }

  private async scanRoot(root: LocatedRoot, issues: SkillScanIssue[]): Promise<SkillEntry[]> {
    const activeIssues: SkillScanIssue[] = [];
    const disabledIssues: SkillScanIssue[] = [];
    const [active, disabled] = await Promise.all([
      this.scanRootState(root, root.fsPath, true, activeIssues),
      root.mutable
        ? this.scanRootState(root, disabledRoot(root.fsPath), false, disabledIssues)
        : Promise.resolve([]),
    ]);
    issues.push(...activeIssues, ...disabledIssues);
    return [...active, ...disabled];
  }

  private async scanRootState(
    root: LocatedRoot,
    rootPath: string,
    enabled: boolean,
    issues: SkillScanIssue[],
  ): Promise<SkillEntry[]> {
    let directories;
    try {
      directories = await readdir(rootPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        issues.push({
          providerId: root.providerId,
          path: root.displayPath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return [];
    }

    const wslLinks = directories.flatMap((directory) => {
      if (!directory.isSymbolicLink() || !root.wslDistro) return [];
      const absolutePath = join(rootPath, directory.name);
      const displayRootPath =
        rootPath === root.fsPath ? root.displayPath : disabledRoot(root.displayPath);
      return [
        {
          absolutePath,
          distro: root.wslDistro,
          linuxPath: posix.join(displayRootPath, directory.name),
        },
      ];
    });
    const resolvedWslLinks = new Map<string, string>();
    if (wslLinks.length > 0) {
      const distro = wslLinks[0]!.distro;
      const links = wslLinks.filter((link) => link.distro.toLowerCase() === distro.toLowerCase());
      const targets = await this.resolveWslRealPaths(
        distro,
        links.map((link) => link.linuxPath),
      ).catch(() => []);
      links.forEach((link, index) => {
        const target = targets[index];
        if (target) resolvedWslLinks.set(link.absolutePath, this.wslFsPath(distro, target));
      });
    }

    const scanned = await Promise.all(
      directories.map(async (directory): Promise<SkillEntry | undefined> => {
        if (
          (!directory.isDirectory() && !directory.isSymbolicLink()) ||
          directory.name.startsWith(".")
        ) {
          return undefined;
        }
        const absolutePath = join(rootPath, directory.name);
        const resolvedWslLink = resolvedWslLinks.get(absolutePath);
        const readablePath = resolvedWslLink ?? absolutePath;
        const manifest = await readManifest(readablePath);
        if (manifest?.mode === "projection") return undefined;
        const skillFsPath = join(readablePath, SKILL_FILE);
        const skillFilePath = posix.join(root.displayPath, directory.name, SKILL_FILE);
        let content: string | undefined;
        let fileInvalidReason: SkillInvalidReason | undefined;
        try {
          const buffer = await readFile(skillFsPath);
          if (buffer.length > MAX_SKILL_FILE_BYTES) fileInvalidReason = "too-large";
          else content = buffer.toString("utf8");
        } catch (error) {
          fileInvalidReason =
            (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing-file" : "read-error";
        }
        const metadata = content
          ? parseSkillMetadata(content, directory.name)
          : {
              name: directory.name,
              description: "",
              hasFrontmatter: false,
              hasName: false,
              hasDescription: false,
            };
        const metadataInvalidReason = content
          ? validateSkillMetadata(metadata, directory.name)
          : undefined;
        const invalidReason = fileInvalidReason ?? metadataInvalidReason;
        let linked = directory.isSymbolicLink();
        let sourcePath = resolvedWslLink ?? manifest?.sourcePath;
        if (linked && !sourcePath) {
          try {
            const target = await readlink(absolutePath);
            sourcePath = isAbsolute(target) ? target : resolve(dirname(absolutePath), target);
          } catch {
            linked = false;
          }
        }
        return {
          id: `${root.scope}:${root.providerId}:${directory.name}:${enabled ? "on" : "off"}`,
          name: metadata.name,
          description: metadata.description,
          folderName: directory.name,
          absolutePath,
          skillFilePath,
          rootPath: root.fsPath,
          providerId: root.providerId,
          providerLabel: root.providerLabel,
          ...(root.providerGroupId ? { providerGroupId: root.providerGroupId } : {}),
          ...(root.providerGroupLabel ? { providerGroupLabel: root.providerGroupLabel } : {}),
          ...(root.providerGroupOrder !== undefined
            ? { providerGroupOrder: root.providerGroupOrder }
            : {}),
          scope: root.scope,
          scopeLabel: root.scopeLabel,
          ...(root.availability ? { availability: root.availability } : {}),
          origin: root.origin,
          enabled,
          mutable: root.mutable,
          valid: !fileInvalidReason && (root.origin === "managed" ? !metadataInvalidReason : true),
          portable: !invalidReason,
          linked,
          ...(sourcePath ? { sourcePath } : {}),
          ...(invalidReason ? { invalidReason } : {}),
        };
      }),
    );
    return scanned.filter((skill): skill is SkillEntry => skill !== undefined);
  }

  private async scanProviderBuiltIns(
    roots: LocatedRoot[],
    issues: SkillScanIssue[],
  ): Promise<SkillEntry[]> {
    const skills: SkillEntry[] = [];
    const scans = await Promise.all(
      roots
        .filter((root) => root.builtInPath)
        .map(async (root) => {
          const builtInPath = root.builtInPath!;
          const rootIssues: SkillScanIssue[] = [];
          const builtInRoot: LocatedRoot = {
            ...root,
            fsPath: join(root.fsPath, ...builtInPath.split("/")),
            displayPath: posix.join(root.displayPath, builtInPath),
            providerId: `${root.providerId}-built-in`,
            providerLabel: `${root.providerGroupLabel ?? root.providerLabel} built-ins`,
            origin: "built-in",
            mutable: false,
          };
          return {
            skills: await this.scanRootState(builtInRoot, builtInRoot.fsPath, true, rootIssues),
            issues: rootIssues,
          };
        }),
    );
    for (const scan of scans) {
      skills.push(...scan.skills);
      issues.push(...scan.issues);
    }
    return skills;
  }

  private rootForPath(path: string, roots: LocatedRoot[]): LocatedRoot {
    const root = roots.find(
      (candidate) =>
        isDirectChild(candidate.fsPath, path) ||
        isDirectChild(disabledRoot(candidate.fsPath), path),
    );
    if (!root) throw new Error("Skill path is outside the configured provider roots.");
    return root;
  }

  private mutableRootForPath(path: string, roots: LocatedRoot[]): LocatedRoot {
    const root = this.rootForPath(path, roots);
    if (!root.mutable || root.origin === "built-in" || root.origin === "plugin") {
      throw new Error("This skill is managed by its provider and cannot be changed here.");
    }
    return root;
  }

  private async syncProjections(
    environment: ResolvedEnvironment,
    selectedAdapters?: readonly AgentAdapter[],
  ): Promise<void> {
    for (const scope of ["global", "project"] as const) {
      if (scope === "project" && !environment.projectFsPath) continue;
      const managedRoot = this.managedRoot(environment, scope, "shared");
      for (const projectionPath of [managedRoot.fsPath, disabledRoot(managedRoot.fsPath)]) {
        const entries = await readdir(projectionPath, { withFileTypes: true }).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        });
        for (const entry of entries) {
          if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
          const path = join(projectionPath, entry.name);
          if ((await readManifest(path))?.mode === "projection") await removeSkillPath(path);
        }
      }
      const managed = await this.scanRootState(managedRoot, managedRoot.fsPath, true, []);
      // Provider projection roots receive shared skills only. Poracode-only
      // and bundled skills are delivered through prompt injection or path hints.
      const sourceByFolder = new Map(
        managed.filter((skill) => skill.valid).map((skill) => [skill.folderName, skill]),
      );
      // A skill's source tree is invariant across the projection roots
      // in this scope, so hash it at most once and reuse it per root.
      const sourceHashCache = new Map<string, string>();
      const sourceHashFor = async (absolutePath: string): Promise<string> => {
        const cached = sourceHashCache.get(absolutePath);
        if (cached !== undefined) return cached;
        const hash = await hashDirectory(absolutePath);
        sourceHashCache.set(absolutePath, hash);
        return hash;
      };

      for (const projectionRoot of this.projectionRoots(environment, selectedAdapters).filter(
        (root) => root.scope === scope,
      )) {
        await this.projectInto(projectionRoot.fsPath, sourceByFolder, sourceHashFor);
      }
    }
  }

  /**
   * Sync one projection target: remove stale/disabled Poracode-owned copies
   * (identified by their projection manifest), then copy each source skill in,
   * skipping unchanged copies via the source hash. Folders without a matching
   * manifest are user-owned and never overwritten.
   */
  private async projectInto(
    targetFsPath: string,
    sourceByFolder: ReadonlyMap<string, SkillEntry>,
    sourceHashFor: (absolutePath: string) => Promise<string>,
  ): Promise<void> {
    const disabledNames = new Set(
      await readdir(disabledRoot(targetFsPath), { withFileTypes: true })
        .then((entries) =>
          entries
            .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
            .map((entry) => entry.name),
        )
        .catch((error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        }),
    );
    if (sourceByFolder.size === 0 && !(await pathExists(targetFsPath))) return;
    await mkdir(targetFsPath, { recursive: true });
    const existing = await readdir(targetFsPath, { withFileTypes: true });
    for (const entry of existing) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const destination = join(targetFsPath, entry.name);
      const manifest = await readManifest(destination);
      if (
        manifest?.mode === "projection" &&
        (!sourceByFolder.has(entry.name) || disabledNames.has(entry.name))
      ) {
        await removeSkillPath(destination);
      }
    }

    for (const skill of sourceByFolder.values()) {
      if (disabledNames.has(skill.folderName)) continue;
      const destination = join(targetFsPath, skill.folderName);
      const sourceHash = await sourceHashFor(skill.absolutePath);
      if (await pathExists(destination)) {
        const manifest = await readManifest(destination);
        if (manifest?.mode === "projection" && manifest.sourcePath === skill.absolutePath) {
          if (manifest.sourceHash === sourceHash) continue;
          await removeSkillPath(destination);
        } else {
          try {
            if ((await hashDirectory(destination)) === sourceHash) continue;
          } catch {
            // The user-owned destination remains authoritative on a conflict.
          }
          console.warn(
            `[skills] projection skipped because ${destination} already contains a different skill`,
          );
          continue;
        }
      }
      await copyDirectorySafely(skill.absolutePath, destination);
      await writeManifest(destination, {
        version: 1,
        mode: "projection",
        sourcePath: skill.absolutePath,
        sourceHash,
      });
    }
  }

  private async moveSkillPath(
    environment: ResolvedEnvironment,
    source: string,
    destination: string,
  ): Promise<void> {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (!environment.wsl || !environment.distro) throw error;
      const sourcePath = parseWslUncPath(source);
      const destinationPath = parseWslUncPath(destination);
      if (
        !sourcePath ||
        !destinationPath ||
        sourcePath.distro.toLowerCase() !== environment.distro.toLowerCase() ||
        destinationPath.distro.toLowerCase() !== environment.distro.toLowerCase()
      ) {
        throw error;
      }
      const [result] = await batchWslCommandsAsync(environment.distro, [
        `mkdir -p -- ${quotePosixShellArg(posix.dirname(destinationPath.linuxPath))} && mv -- ${quotePosixShellArg(sourcePath.linuxPath)} ${quotePosixShellArg(destinationPath.linuxPath)}`,
      ]);
      if (!result?.ok) throw error;
    }
  }

  private async ensureDirectory(environment: ResolvedEnvironment, path: string): Promise<void> {
    try {
      await mkdir(path, { recursive: true });
      return;
    } catch (error) {
      if (!environment.wsl || !environment.distro) throw error;
      const parsed = parseWslUncPath(path);
      if (!parsed || parsed.distro.toLowerCase() !== environment.distro.toLowerCase()) throw error;
      const [result] = await batchWslCommandsAsync(environment.distro, [
        `mkdir -p -- ${quotePosixShellArg(parsed.linuxPath)}`,
      ]);
      if (!result?.ok) throw error;
    }
  }
}
