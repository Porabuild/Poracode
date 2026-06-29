import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type {
  CreateSkillPayload,
  DeleteSkillPayload,
  InstallMarketplaceSkillPayload,
  InstallMarketplaceSkillResult,
  InstallSkillFromGitPayload,
  OptimizeSkillsPayload,
  OptimizeSkillsResult,
  ProjectLocation,
  ReadSkillPayload,
  RenameSkillPayload,
  ScanSkillsPayload,
  SkillDetail,
  SkillFileInfo,
  SkillScan,
  SkillScope,
  SkillSummary,
  SkillSyncOp,
  TransferSkillPayload,
  TransferSkillResult,
  WriteSkillPayload,
} from "@/shared/contracts";
import {
  buildSkillMarkdown,
  makeScopeId,
  marketplaceSkillById,
  SKILL_ROOTS,
  slugifySkillName,
  type SkillRoot,
} from "@/shared/skills";
import { getProjectFsPath } from "@/shared/wsl";

const execFileAsync = promisify(execFile);

const SKILL_FILE = "SKILL.md";
const MAX_LISTED_FILES = 500;
const MAX_FRONTMATTER_BYTES = 64_000;

interface SkillSignature {
  hash: string;
  mtimeMs: number;
}

function normalizeName(name: string): string {
  return name.trim().replace(/^["']|["']$/g, "");
}

/** Validate a single path segment used as a skill folder name. */
function validateFolderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Skill folder name cannot be empty.");
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Skill folder name cannot contain path separators.");
  }
  if (trimmed === "." || trimmed === "..") throw new Error("Invalid skill folder name.");
  return trimmed;
}

interface SkillOperationContext {
  projectLocation?: ProjectLocation | undefined;
}

/**
 * Guard every mutating operation. The renderer always passes paths that came
 * from {@link SkillsService.scanSkills}, but these methods sit on a trusted IPC
 * boundary that performs destructive fs ops. Require absolute paths and confirm
 * that they match the global skill roots, or the supplied project skill roots,
 * rather than trusting any folder on disk named `.agents/skills`.
 */
function assertSkillFolder(folderPath: string, context: SkillOperationContext): void {
  if (!isAbsolute(folderPath)) {
    throw new Error("Skill path must be absolute.");
  }
  if (!isAllowedScopeDir(dirname(resolve(folderPath)), context)) {
    throw new Error("Refusing to operate outside a skills directory.");
  }
}

function assertSkillsScopeDir(scopeDir: string, context: SkillOperationContext): void {
  if (!isAbsolute(scopeDir)) {
    throw new Error("Skill scope path must be absolute.");
  }
  if (!isAllowedScopeDir(scopeDir, context)) {
    throw new Error("Destination is not a skills directory.");
  }
}

function isAllowedScopeDir(scopeDir: string, context: SkillOperationContext): boolean {
  const normalized = normalizeFsPath(scopeDir);
  return allowedScopeDirs(context).some((allowed) => sameFsPath(normalized, allowed));
}

function allowedScopeDirs(context: SkillOperationContext): string[] {
  const bases = [homedir()];
  if (context.projectLocation) bases.push(getProjectFsPath(context.projectLocation));
  return bases.flatMap((base) =>
    SKILL_ROOTS.map((root) => normalizeFsPath(join(base, ...root.dirName.split("/")))),
  );
}

function normalizeFsPath(path: string): string {
  return resolve(path);
}

function sameFsPath(left: string, right: string): boolean {
  if (process.platform === "win32") return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

function unquoteScalar(raw: string): string {
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return value.startsWith('"') ? (JSON.parse(value) as string) : value.slice(1, -1);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Parse a SKILL.md's leading YAML frontmatter for `name`, `description`, and
 * the `metadata.source` provenance tag we write on marketplace installs.
 * Intentionally minimal (no YAML dependency) — handles the simple
 * `key: value` / quoted-value shapes the skill format uses. Line endings are
 * normalized (CRLF) and a leading UTF-8 BOM is stripped so Windows / git-cloned
 * files parse the same as LF files.
 */
export function parseSkillFrontmatter(content: string): {
  name?: string;
  description?: string;
  source?: string;
} {
  const text = content
    .slice(0, MAX_FRONTMATTER_BYTES)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end === -1) return {};
  const block = text.slice(text.indexOf("\n", 3) + 1, end);
  const result: { name?: string; description?: string; source?: string } = {};
  for (const rawLine of block.split("\n")) {
    // Top-level name/description.
    const top = /^(name|description)\s*:\s*(.*)$/.exec(rawLine);
    if (top) {
      result[top[1] as "name" | "description"] = unquoteScalar(top[2] ?? "");
      continue;
    }
    // `source` lives under `metadata:` (indented); capture it for provenance.
    const source = /^\s+source\s*:\s*(.*)$/.exec(rawLine);
    if (source) result.source = unquoteScalar(source[1] ?? "");
  }
  return result;
}

export class SkillsService {
  /** Resolve the absolute base directory for a given scope level. */
  private scopeBase(level: "global" | "project", projectLocation?: ProjectLocation): string | null {
    if (level === "global") return homedir();
    if (!projectLocation) return null;
    return getProjectFsPath(projectLocation);
  }

  private scopeFor(root: SkillRoot, level: "global" | "project", base: string): SkillScope {
    const absolutePath = join(base, ...root.dirName.split("/"));
    return {
      id: makeScopeId(level, root.id),
      level,
      rootId: root.id,
      rootLabel: root.label,
      consumerLabel: root.consumerLabel,
      dirName: root.dirName,
      absolutePath,
      exists: false,
    };
  }

  async scanSkills(payload: ScanSkillsPayload): Promise<SkillScan> {
    const scopes: SkillScope[] = [];
    const skills: SkillSummary[] = [];
    const unavailable: { scopeId: string; reason: string }[] = [];

    const levels: ("global" | "project")[] = payload.projectLocation
      ? ["global", "project"]
      : ["global"];

    for (const level of levels) {
      const base = this.scopeBase(level, payload.projectLocation);
      if (!base) continue;
      for (const root of SKILL_ROOTS) {
        const scope = this.scopeFor(root, level, base);
        try {
          const found = await this.scanScope(scope);
          scope.exists = found.exists;
          skills.push(...found.skills);
        } catch (error) {
          unavailable.push({ scopeId: scope.id, reason: errorMessage(error) });
        }
        scopes.push(scope);
      }
    }

    return { scopes, skills, unavailable };
  }

  private async scanScope(scope: SkillScope): Promise<{ exists: boolean; skills: SkillSummary[] }> {
    let entries: Dirent[];
    try {
      entries = await readdir(scope.absolutePath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { exists: false, skills: [] };
      }
      throw error;
    }

    const dirs = entries.filter((entry) => entry.isDirectory() || entry.isSymbolicLink());
    const skills = await Promise.all(dirs.map((entry) => this.summarizeSkill(scope, entry.name)));
    return {
      exists: true,
      skills: skills.filter((skill): skill is SkillSummary => skill !== null),
    };
  }

  private async summarizeSkill(
    scope: SkillScope,
    folderName: string,
  ): Promise<SkillSummary | null> {
    const folderPath = join(scope.absolutePath, folderName);
    let dirStat: Stats;
    try {
      dirStat = await stat(folderPath);
    } catch {
      return null;
    }
    if (!dirStat.isDirectory()) return null;

    let fileCount = 0;
    let hasSkillFile = false;
    try {
      const inner = await readdir(folderPath, { withFileTypes: true });
      fileCount = inner.filter((entry) => entry.isFile()).length;
      hasSkillFile = inner.some((entry) => entry.isFile() && entry.name === SKILL_FILE);
    } catch {
      // Unreadable folder — still surface it so the user can fix/remove it.
    }

    let name = folderName;
    let description = "";
    let source: string | undefined;
    if (hasSkillFile) {
      try {
        const content = await readFile(join(folderPath, SKILL_FILE), "utf8");
        const front = parseSkillFrontmatter(content);
        if (front.name) name = normalizeName(front.name);
        if (front.description) description = front.description;
        if (front.source) source = front.source;
      } catch {
        // Ignore read errors; fall back to folder name.
      }
    }

    return {
      id: `${scope.id}/${folderName}`,
      scopeId: scope.id,
      level: scope.level,
      rootId: scope.rootId,
      folderName,
      absolutePath: folderPath,
      name,
      description,
      fileCount,
      hasSkillFile,
      ...(source !== undefined ? { source } : {}),
    };
  }

  async readSkill(payload: ReadSkillPayload): Promise<SkillDetail> {
    // Guard the read path like the mutating ones — it walks the folder tree and
    // returns file contents, so keep it confined to skills directories.
    assertSkillFolder(payload.absolutePath, payload);
    const folderPath = payload.absolutePath;
    const skillFile = join(folderPath, SKILL_FILE);
    let content = "";
    try {
      content = await readFile(skillFile, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const front = parseSkillFrontmatter(content);
    const files = await this.listSkillFiles(folderPath);
    return {
      absolutePath: folderPath,
      folderName: basename(folderPath),
      name: front.name ? normalizeName(front.name) : basename(folderPath),
      description: front.description ?? "",
      content,
      files,
    };
  }

  private async listSkillFiles(folderPath: string): Promise<SkillFileInfo[]> {
    const out: SkillFileInfo[] = [];
    const walk = async (relDir: string): Promise<void> => {
      if (out.length >= MAX_LISTED_FILES) return;
      const absDir = relDir ? join(folderPath, relDir) : folderPath;
      let entries: Dirent[];
      try {
        entries = await readdir(absDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (out.length >= MAX_LISTED_FILES) return;
        const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(rel);
        } else if (entry.isFile()) {
          try {
            const info = await stat(join(folderPath, rel));
            out.push({ path: rel, sizeBytes: info.size });
          } catch {
            // skip unreadable file
          }
        }
      }
    };
    await walk("");
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }

  async writeSkill(payload: WriteSkillPayload): Promise<void> {
    assertSkillFolder(payload.absolutePath, payload);
    await mkdir(payload.absolutePath, { recursive: true });
    await writeFile(join(payload.absolutePath, SKILL_FILE), payload.content, "utf8");
  }

  async createSkill(payload: CreateSkillPayload): Promise<TransferSkillResult> {
    assertSkillsScopeDir(payload.scopeDir, payload);
    const folderName = validateFolderName(payload.folderName);
    const folderPath = join(payload.scopeDir, folderName);
    if (await pathExists(folderPath)) {
      throw new Error(`A skill named "${folderName}" already exists here.`);
    }
    await mkdir(folderPath, { recursive: true });
    const markdown = buildSkillMarkdown({
      name: payload.name,
      description: payload.description,
      ...(payload.body !== undefined ? { body: payload.body } : {}),
    });
    await writeFile(join(folderPath, SKILL_FILE), markdown, "utf8");
    return { absolutePath: folderPath };
  }

  async deleteSkill(payload: DeleteSkillPayload): Promise<void> {
    assertSkillFolder(payload.absolutePath, payload);
    await rm(payload.absolutePath, { recursive: true, force: false });
  }

  async renameSkill(payload: RenameSkillPayload): Promise<TransferSkillResult> {
    assertSkillFolder(payload.absolutePath, payload);
    const nextName = validateFolderName(payload.nextFolderName);
    const nextPath = join(dirname(payload.absolutePath), nextName);
    if (nextPath === payload.absolutePath) return { absolutePath: payload.absolutePath };
    if (await pathExists(nextPath)) {
      throw new Error(`A skill named "${nextName}" already exists here.`);
    }
    await rename(payload.absolutePath, nextPath);
    return { absolutePath: nextPath };
  }

  async transferSkill(payload: TransferSkillPayload): Promise<TransferSkillResult> {
    assertSkillFolder(payload.fromPath, payload);
    assertSkillsScopeDir(payload.toScopeDir, payload);
    const folderName = basename(payload.fromPath);
    const destPath = join(payload.toScopeDir, folderName);
    if (destPath === payload.fromPath) {
      throw new Error("Source and destination are the same.");
    }
    const destExists = await pathExists(destPath);
    if (destExists && !payload.overwrite) {
      throw new Error(`A skill named "${folderName}" already exists in the destination.`);
    }
    await mkdir(payload.toScopeDir, { recursive: true });
    if (destExists) await rm(destPath, { recursive: true, force: true });
    // dereference so a copied symlinked skill becomes real files, not a link
    // that still points at the source location.
    await cp(payload.fromPath, destPath, { recursive: true, dereference: true });
    if (payload.move) {
      await rm(payload.fromPath, { recursive: true, force: true });
    }
    return { absolutePath: destPath };
  }

  /**
   * Mirror skills across every root at a level so all installed agents see the
   * same set — the "optimizer". For each skill folder present in any root we:
   *  - copy it into roots that lack it (`kind: "create"`), and
   *  - re-copy it into roots whose copy has *diverged* from the most recently
   *    edited copy (`kind: "update"`), so editing a shared skill in one root no
   *    longer leaves a stale copy behind in another.
   * The newest copy (by max file mtime) wins. With `apply: false`, returns the
   * plan without writing.
   */
  async optimizeSkills(payload: OptimizeSkillsPayload): Promise<OptimizeSkillsResult> {
    const base = this.scopeBase(payload.level, payload.projectLocation);
    if (!base) {
      return { applied: false, ops: [] };
    }

    const allScopes = SKILL_ROOTS.map((root) => this.scopeFor(root, payload.level, base));
    // scopeId -> folderName -> { skill, signature }
    const present = new Map<string, Map<string, { skill: SkillSummary; sig: SkillSignature }>>();
    // Only scopes we could actually read participate — a root that errors mid-scan
    // must NOT be treated as empty (that would plan spurious copies into it).
    const scopes: SkillScope[] = [];
    for (const scope of allScopes) {
      let found: { exists: boolean; skills: SkillSummary[] };
      try {
        found = await this.scanScope(scope);
      } catch {
        continue;
      }
      const byFolder = new Map<string, { skill: SkillSummary; sig: SkillSignature }>();
      for (const skill of found.skills) {
        // Don't mirror malformed folders (no SKILL.md) or non-skill junk dirs.
        if (!skill.hasSkillFile) continue;
        byFolder.set(skill.folderName, {
          skill,
          sig: await this.skillSignature(skill.absolutePath),
        });
      }
      present.set(scope.id, byFolder);
      scopes.push(scope);
    }

    const allFolders = new Set<string>();
    for (const byFolder of present.values()) {
      for (const folder of byFolder.keys()) allFolders.add(folder);
    }

    const ops: SkillSyncOp[] = [];
    for (const folder of allFolders) {
      // The most recently edited copy is the source of truth for this skill.
      let source: SkillScope | undefined;
      let sourceEntry: { skill: SkillSummary; sig: SkillSignature } | undefined;
      for (const scope of scopes) {
        const entry = present.get(scope.id)?.get(folder);
        if (!entry) continue;
        if (!sourceEntry || entry.sig.mtimeMs > sourceEntry.sig.mtimeMs) {
          source = scope;
          sourceEntry = entry;
        }
      }
      if (!source || !sourceEntry) continue;

      for (const target of scopes) {
        if (target.id === source.id) continue;
        const targetEntry = present.get(target.id)?.get(folder);
        if (targetEntry && targetEntry.sig.hash === sourceEntry.sig.hash) continue;
        ops.push({
          folderName: folder,
          skillName: sourceEntry.skill.name,
          fromScopeId: source.id,
          toScopeId: target.id,
          toPath: join(target.absolutePath, folder),
          kind: targetEntry ? "update" : "create",
        });
      }
    }

    if (payload.apply) {
      for (const op of ops) {
        const source = scopes.find((scope) => scope.id === op.fromScopeId)!;
        await mkdir(dirname(op.toPath), { recursive: true });
        // Replace divergent copies wholesale so files removed upstream don't linger.
        if (op.kind === "update") await rm(op.toPath, { recursive: true, force: true });
        await cp(join(source.absolutePath, op.folderName), op.toPath, {
          recursive: true,
          dereference: true,
        });
      }
    }

    return { applied: payload.apply, ops };
  }

  /**
   * A content fingerprint for a skill folder: a hash over every file's relative
   * path and full bytes, plus the newest file mtime (used only to pick the
   * freshest source). The optimizer compares hashes to detect divergence, so we
   * hash actual contents — not just sizes — otherwise a same-size in-place edit
   * to an auxiliary file would look "in sync". Skill folders are small (capped
   * at MAX_LISTED_FILES), so reading each file on demand is acceptable.
   */
  private async skillSignature(folderPath: string): Promise<SkillSignature> {
    const hash = createHash("sha1");
    let mtimeMs = 0;
    const files = await this.listSkillFiles(folderPath);
    for (const file of files) {
      hash.update(` ${file.path} `);
      try {
        hash.update(await readFile(join(folderPath, file.path)));
        const info = await stat(join(folderPath, file.path));
        if (info.mtimeMs > mtimeMs) mtimeMs = info.mtimeMs;
      } catch {
        // Unreadable file — fold its size in so it still affects the hash.
        hash.update(`size:${file.sizeBytes}`);
      }
    }
    return { hash: hash.digest("hex"), mtimeMs };
  }

  async installMarketplaceSkill(
    payload: InstallMarketplaceSkillPayload,
  ): Promise<InstallMarketplaceSkillResult> {
    assertSkillsScopeDir(payload.targetScopeDir, payload);
    const entry = marketplaceSkillById(payload.catalogId);
    if (!entry) throw new Error(`Unknown marketplace skill: ${payload.catalogId}`);
    const folderName = validateFolderName(payload.folderName ?? entry.folderName);
    const folderPath = join(payload.targetScopeDir, folderName);
    if (await pathExists(folderPath)) {
      throw new Error(`A skill named "${folderName}" already exists here.`);
    }
    await mkdir(folderPath, { recursive: true });
    const markdown = buildSkillMarkdown({
      name: entry.name,
      description: entry.description,
      body: entry.template,
      metadata: { author: entry.author, source: entry.id },
    });
    await writeFile(join(folderPath, SKILL_FILE), markdown, "utf8");
    return { absolutePath: folderPath, folderName };
  }

  async installSkillFromGit(
    payload: InstallSkillFromGitPayload,
  ): Promise<InstallMarketplaceSkillResult> {
    assertSkillsScopeDir(payload.targetScopeDir, payload);
    const temp = await mkdtemp(join(tmpdir(), "lightcode-skill-"));
    try {
      try {
        // `--` stops a `-`-prefixed repoUrl from being read as a git option;
        // the hardened env makes auth-required remotes fail fast instead of
        // hanging on a credential prompt for the full timeout.
        await execFileAsync(
          "git",
          ["clone", "--depth", "1", "--single-branch", "--no-tags", "--", payload.repoUrl, "repo"],
          {
            cwd: temp,
            timeout: 60_000,
            env: {
              ...process.env,
              GIT_TERMINAL_PROMPT: "0",
              GIT_ASKPASS: "",
              GCM_INTERACTIVE: "never",
            },
          },
        );
      } catch (error) {
        throw new Error(`git clone failed: ${errorMessage(error)}`, { cause: error });
      }
      const repoRoot = resolve(join(temp, "repo"));
      const sourceDir = payload.sourcePath
        ? join(repoRoot, ...payload.sourcePath.split("/").filter(Boolean))
        : repoRoot;
      // Reject a sourcePath that escapes the clone via `..`.
      const resolvedSource = resolve(sourceDir);
      if (resolvedSource !== repoRoot && !resolvedSource.startsWith(repoRoot + sep)) {
        throw new Error("Invalid source path inside the repository.");
      }
      if (!(await pathExists(join(resolvedSource, SKILL_FILE)))) {
        throw new Error(
          `No ${SKILL_FILE} found at ${payload.sourcePath ?? "the repository root"}.`,
        );
      }
      const folderName = validateFolderName(
        payload.folderName ??
          slugifySkillName(basename(payload.sourcePath || payload.repoUrl).replace(/\.git$/, "")),
      );
      const folderPath = join(payload.targetScopeDir, folderName);
      if (await pathExists(folderPath)) {
        throw new Error(`A skill named "${folderName}" already exists here.`);
      }
      await mkdir(payload.targetScopeDir, { recursive: true });
      await cp(resolvedSource, folderPath, { recursive: true, dereference: true });
      await rm(join(folderPath, ".git"), { recursive: true, force: true });
      return { absolutePath: folderPath, folderName };
    } finally {
      await rm(temp, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
