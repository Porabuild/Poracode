import type { Dirent, Stats } from "node:fs";
import { readdir, readFile, rename, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, posix, relative, resolve } from "node:path";
import micromatch from "micromatch";
import { readWslCommandOutputAsync } from "./agents/base";
import type {
  CreateProjectEntryPayload,
  DeleteProjectEntryPayload,
  ListProjectTreePayload,
  ListProjectTreeResult,
  MoveProjectEntryPayload,
  ProjectLocation,
  ProjectTreeEntry,
  ReadAbsoluteFilePayload,
  ReadAbsoluteFileResult,
  ReadExternalFilePayload,
  ReadExternalFileResult,
  ReadProjectFilePayload,
  ReadProjectFileResult,
  RenameProjectEntryPayload,
  SearchConfigPayload,
  SearchProjectTreePayload,
  SearchProjectTreeResult,
  WriteExternalFilePayload,
  WriteExternalFileResult,
  WriteProjectFilePayload,
  WriteProjectFileResult,
} from "@/shared/contracts";
import { getProjectFsPath, joinProjectPosixPath } from "@/shared/wsl";
import { execGit, getLocationIdentity } from "./git";
import { readSshCommandOutput } from "./ssh";
import type { WslBridgeClient } from "./wsl/bridge/client";

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const CACHE_TTL_MS = 10_000;
const MAX_CACHE_ENTRIES = 4;
const MAX_SEARCH_INDEX_SIZE = 50_000;
const MAX_EDITABLE_FILE_SIZE = 1_000_000;

interface CachedSearchIndex {
  entries: ProjectTreeEntry[];
  createdAt: number;
}

type RawFileRead =
  | { kind: "tooLarge"; modifiedAtMs: number }
  | { kind: "ok"; buffer: Buffer; modifiedAtMs: number };
type SshProjectLocation = Extract<ProjectLocation, { kind: "ssh" }>;

function normalizeRelativePath(input: string): string {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return "";
  const parts = normalized.split("/");
  const resolvedParts: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      throw new Error("Path traversal is not allowed.");
    }
    resolvedParts.push(part);
  }
  return resolvedParts.join("/");
}

function joinRelativePath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function getParentRelativePath(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

function validateEntryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty.");
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Name cannot contain path separators.");
  }
  if (trimmed === "." || trimmed === "..") {
    throw new Error("Invalid name.");
  }
  return trimmed;
}

function isBinaryBuffer(buffer: Buffer): boolean {
  for (const byte of buffer) {
    if (byte === 0) return true;
  }
  return false;
}

function detectLineEnding(content: string): "lf" | "crlf" {
  return content.includes("\r\n") ? "crlf" : "lf";
}

function normalizeContentForWrite(content: string, lineEnding: "lf" | "crlf"): string {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lineEnding === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
}

/**
 * Build the on-disk bytes for a save, preserving the original file's BOM
 * and line-ending convention. Throws if the original is not valid UTF-8.
 */
function buildWriteBuffer(existingBuffer: Buffer, nextContent: string): Buffer {
  const hasBom = existingBuffer.subarray(0, BOM.length).equals(BOM);
  const contentBuffer = hasBom ? existingBuffer.subarray(BOM.length) : existingBuffer;
  let existingContent = "";
  try {
    existingContent = new TextDecoder("utf-8", { fatal: true }).decode(contentBuffer);
  } catch {
    throw new Error("This file uses an unsupported encoding.");
  }
  const normalized = normalizeContentForWrite(nextContent, detectLineEnding(existingContent));
  const nextBuffer = Buffer.from(normalized, "utf8");
  return hasBom ? Buffer.concat([BOM, nextBuffer]) : nextBuffer;
}

function sortEntries(entries: ProjectTreeEntry[]): ProjectTreeEntry[] {
  return entries.toSorted((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

export class ProjectTreeService {
  private searchCache = new Map<string, CachedSearchIndex>();
  private wslClient: WslBridgeClient | undefined;

  /** Late-bound so the supervisor can wire the bridge client after boot. */
  setWslClient(client: WslBridgeClient): void {
    this.wslClient = client;
  }

  async listProjectTree(payload: ListProjectTreePayload): Promise<ListProjectTreeResult> {
    const directoryPath = normalizeRelativePath(payload.directoryPath);

    if (payload.projectLocation.kind === "wsl" && this.wslClient) {
      return this.listProjectTreeWsl(payload.projectLocation, directoryPath, this.wslClient);
    }
    if (payload.projectLocation.kind === "ssh") {
      return this.listProjectTreeSsh(payload.projectLocation, directoryPath);
    }

    const fullPath = this.resolveEntryPath(payload.projectLocation, directoryPath);
    const entries = await readdir(fullPath, { withFileTypes: true });
    const visible = entries.filter((entry) => entry.name !== ".git");

    // Batch-classify symlinks so we don't spawn one wsl.exe per symlink.
    const symlinkDirs = await this.classifySymlinks(
      payload.projectLocation,
      directoryPath,
      visible,
    );

    const visibleEntries = await Promise.all(
      visible.map(async (entry): Promise<ProjectTreeEntry> => {
        const path = joinRelativePath(directoryPath, entry.name);
        const isDir = entry.isDirectory() || symlinkDirs.has(entry.name);

        if (isDir) {
          return {
            path,
            name: entry.name,
            type: "directory",
            hasChildren: await this.directoryHasVisibleChildren(
              this.resolveEntryPath(payload.projectLocation, path),
            ),
          };
        }
        return { path, name: entry.name, type: "file" };
      }),
    );

    return {
      directoryPath,
      entries: sortEntries(visibleEntries),
    };
  }

  private async listProjectTreeWsl(
    location: Extract<ProjectLocation, { kind: "wsl" }>,
    directoryPath: string,
    wslClient: WslBridgeClient,
  ): Promise<ListProjectTreeResult> {
    const absolute = joinProjectPosixPath(location, directoryPath);
    const { entries } = await wslClient.readdir(location, absolute, {
      includeChildCount: true,
    });
    const visible = entries.filter((e) => e.name !== ".git");
    const mapped: ProjectTreeEntry[] = visible.map((entry) => {
      const path = joinRelativePath(directoryPath, entry.name);
      const isDir = entry.type === "directory" || entry.isDirectoryLink === true;
      if (isDir) {
        return {
          path,
          name: entry.name,
          type: "directory",
          hasChildren: entry.hasChildren ?? false,
        };
      }
      return { path, name: entry.name, type: "file" };
    });
    return { directoryPath, entries: sortEntries(mapped) };
  }

  private async listProjectTreeSsh(
    location: SshProjectLocation,
    directoryPath: string,
  ): Promise<ListProjectTreeResult> {
    const absolute = joinProjectPosixPath(location, directoryPath);
    const script = `
dir=$1
for entry in "$dir"/* "$dir"/.[!.]* "$dir"/..?*; do
  [ -e "$entry" ] || [ -L "$entry" ] || continue
  name=\${entry##*/}
  [ "$name" = ".git" ] && continue
  if [ -d "$entry" ]; then
    if find "$entry" -mindepth 1 -maxdepth 1 ! -name .git -print -quit | grep -q .; then
      has=1
    else
      has=0
    fi
    printf 'directory\\0%s\\0%s\\0' "$has" "$name"
  else
    printf 'file\\0\\0%s\\0' "$name"
  fi
done
`;
    const result = await readSshCommandOutput(location, "sh", ["-c", script, "sh", absolute]);
    const parts = result.stdout.split("\0");
    const entries: ProjectTreeEntry[] = [];
    for (let i = 0; i + 2 < parts.length; i += 3) {
      const type = parts[i];
      const hasChildren = parts[i + 1] === "1";
      const name = parts[i + 2];
      if (!type || !name) continue;
      const path = joinRelativePath(directoryPath, name);
      if (type === "directory") {
        entries.push({ path, name, type: "directory", hasChildren });
      } else {
        entries.push({ path, name, type: "file" });
      }
    }
    return { directoryPath, entries: sortEntries(entries) };
  }

  async searchProjectTree(payload: SearchProjectTreePayload): Promise<SearchProjectTreeResult> {
    const query = payload.query.trim().toLowerCase();
    if (!query) return { entries: [] };

    const config = payload.searchConfig ?? { useIgnoreFiles: true, excludePatterns: [] };
    const { entries } = await this.getOrBuildSearchIndex(payload.projectLocation, config);
    return {
      entries: this.rankEntries(entries, query, payload.limit),
    };
  }

  async readProjectFile(payload: ReadProjectFilePayload): Promise<ReadProjectFileResult> {
    const path = normalizeRelativePath(payload.path);

    const raw =
      payload.projectLocation.kind === "wsl" && this.wslClient
        ? await this.readProjectFileBufferWsl(payload.projectLocation, path, this.wslClient)
        : payload.projectLocation.kind === "ssh"
          ? await this.readProjectFileBufferSsh(payload.projectLocation, path)
          : await this.readProjectFileBufferNative(payload.projectLocation, path);

    if (raw.kind === "tooLarge") {
      return { path, status: "too_large", modifiedAtMs: raw.modifiedAtMs };
    }

    if (isBinaryBuffer(raw.buffer)) {
      return { path, status: "binary", modifiedAtMs: raw.modifiedAtMs };
    }

    const hasBom = raw.buffer.subarray(0, BOM.length).equals(BOM);
    const contentBuffer = hasBom ? raw.buffer.subarray(BOM.length) : raw.buffer;

    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(contentBuffer);
    } catch {
      return { path, status: "unsupported", modifiedAtMs: raw.modifiedAtMs };
    }

    return {
      path,
      status: "ready",
      modifiedAtMs: raw.modifiedAtMs,
      content,
      lineEnding: detectLineEnding(content),
      hasBom,
    };
  }

  /**
   * Read a file from the project's location context. Used by the chat UI to
   * surface a just-created file's content when the agent didn't stream it.
   * Native FS for Windows/POSIX projects; the WSL bridge for WSL projects.
   *
   * Relative paths resolve against the project root for convenience. Absolute
   * paths are read as-is, even outside the project root — the user/agent may
   * reference any file (e.g. a plan in a `~/.lightcode/worktrees` worktree),
   * and the editor must be able to open it.
   *
   * Returns `{ status: "missing" }` for ENOENT instead of throwing, since the
   * file may have been deleted between the agent run and the renderer fetch
   * — common enough that a per-row error toast would be noise.
   */
  async readAbsoluteFile(payload: ReadAbsoluteFilePayload): Promise<ReadAbsoluteFileResult> {
    let raw: RawFileRead;
    try {
      if (payload.projectLocation.kind === "wsl" && this.wslClient) {
        const linuxPath = this.resolveProjectLinuxReadPath(
          payload.projectLocation,
          payload.absolutePath,
        );
        raw = await this.readAbsoluteFileBufferWsl(
          this.externalWslLocation(payload.projectLocation, linuxPath),
          linuxPath,
          this.wslClient,
        );
      } else if (payload.projectLocation.kind === "ssh") {
        raw = await this.readAbsoluteFileBufferSsh(
          payload.projectLocation,
          this.resolveProjectSshReadPath(payload.projectLocation, payload.absolutePath),
        );
      } else {
        raw = await this.readAbsoluteFileBufferNative(
          this.resolveProjectNativeReadPath(payload.projectLocation, payload.absolutePath),
        );
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
      throw err;
    }

    if (raw.kind === "tooLarge") {
      return { status: "too_large", modifiedAtMs: raw.modifiedAtMs };
    }

    if (isBinaryBuffer(raw.buffer)) {
      return { status: "binary", modifiedAtMs: raw.modifiedAtMs };
    }

    const hasBom = raw.buffer.subarray(0, BOM.length).equals(BOM);
    const contentBuffer = hasBom ? raw.buffer.subarray(BOM.length) : raw.buffer;

    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(contentBuffer);
    } catch {
      return { status: "unsupported", modifiedAtMs: raw.modifiedAtMs };
    }

    return { status: "ready", modifiedAtMs: raw.modifiedAtMs, content };
  }

  /**
   * Read a file at an absolute path that is NOT required to live inside the
   * project root. Used by the in-app editor when the user opens an
   * out-of-project absolute path (e.g. /etc/hosts) from chat. WSL projects
   * route through the WSL bridge; native projects use the OS file system.
   */
  async readExternalFile(payload: ReadExternalFilePayload): Promise<ReadExternalFileResult> {
    if (!isAbsolute(payload.absolutePath) && !payload.absolutePath.startsWith("/")) {
      throw new Error("Path must be absolute.");
    }
    let raw: RawFileRead;
    try {
      raw =
        payload.projectLocation.kind === "wsl" && this.wslClient
          ? await this.readAbsoluteFileBufferWsl(
              this.externalWslLocation(payload.projectLocation, payload.absolutePath),
              payload.absolutePath,
              this.wslClient,
            )
          : payload.projectLocation.kind === "ssh"
            ? await this.readAbsoluteFileBufferSsh(payload.projectLocation, payload.absolutePath)
            : await this.readAbsoluteFileBufferNative(payload.absolutePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { path: payload.absolutePath, status: "missing", modifiedAtMs: 0 };
      }
      throw err;
    }

    if (raw.kind === "tooLarge") {
      return { path: payload.absolutePath, status: "too_large", modifiedAtMs: raw.modifiedAtMs };
    }

    if (isBinaryBuffer(raw.buffer)) {
      return { path: payload.absolutePath, status: "binary", modifiedAtMs: raw.modifiedAtMs };
    }

    const hasBom = raw.buffer.subarray(0, BOM.length).equals(BOM);
    const contentBuffer = hasBom ? raw.buffer.subarray(BOM.length) : raw.buffer;

    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(contentBuffer);
    } catch {
      return { path: payload.absolutePath, status: "unsupported", modifiedAtMs: raw.modifiedAtMs };
    }

    return {
      path: payload.absolutePath,
      status: "ready",
      modifiedAtMs: raw.modifiedAtMs,
      content,
      lineEnding: detectLineEnding(content),
      hasBom,
    };
  }

  /**
   * Write a file at an absolute path that is NOT required to live inside the
   * project root. Mirrors writeProjectFile's mtime conflict and BOM/EOL
   * preservation, but does not enforce project-root containment.
   */
  async writeExternalFile(payload: WriteExternalFilePayload): Promise<WriteExternalFileResult> {
    if (!isAbsolute(payload.absolutePath) && !payload.absolutePath.startsWith("/")) {
      throw new Error("Path must be absolute.");
    }
    if (payload.projectLocation.kind === "wsl" && this.wslClient) {
      return this.writeExternalFileWsl(payload.projectLocation, payload, this.wslClient);
    }
    if (payload.projectLocation.kind === "ssh") {
      return this.writeExternalFileSsh(payload.projectLocation, payload);
    }

    const fileStat = await stat(payload.absolutePath);
    if (!fileStat.isFile()) {
      throw new Error("Only files can be saved from the editor.");
    }
    if (Math.abs(fileStat.mtimeMs - payload.baseModifiedAtMs) > 1) {
      throw new Error("The file changed on disk. Reload it before saving.");
    }
    if (fileStat.size > MAX_EDITABLE_FILE_SIZE) {
      throw new Error("This file is too large to save from the editor.");
    }

    const existingBuffer = await readFile(payload.absolutePath);
    if (isBinaryBuffer(existingBuffer)) {
      throw new Error("Binary files cannot be saved from the editor.");
    }

    const nextBuffer = buildWriteBuffer(existingBuffer, payload.content);
    await writeFile(payload.absolutePath, nextBuffer);
    const nextStat = await stat(payload.absolutePath);
    return { modifiedAtMs: nextStat.mtimeMs };
  }

  private async writeExternalFileWsl(
    location: Extract<ProjectLocation, { kind: "wsl" }>,
    payload: WriteExternalFilePayload,
    wslClient: WslBridgeClient,
  ): Promise<WriteExternalFileResult> {
    const externalLocation = this.externalWslLocation(location, payload.absolutePath);
    const existing = await wslClient.readFile(externalLocation, payload.absolutePath, {
      maxBytes: MAX_EDITABLE_FILE_SIZE,
    });
    if (existing.tooLarge) {
      throw new Error("This file is too large to save from the editor.");
    }
    if (Math.abs(existing.mtimeMs - payload.baseModifiedAtMs) > 1) {
      throw new Error("The file changed on disk. Reload it before saving.");
    }
    const existingBuffer = Buffer.from(existing.contentBase64, "base64");
    if (isBinaryBuffer(existingBuffer)) {
      throw new Error("Binary files cannot be saved from the editor.");
    }
    const nextBuffer = buildWriteBuffer(existingBuffer, payload.content);
    const result = await wslClient.writeFile(externalLocation, payload.absolutePath, nextBuffer, {
      expectedMtimeMs: existing.mtimeMs,
    });
    return { modifiedAtMs: result.mtimeMs };
  }

  private async writeExternalFileSsh(
    location: SshProjectLocation,
    payload: WriteExternalFilePayload,
  ): Promise<WriteExternalFileResult> {
    const existing = await this.readAbsoluteFileBufferSsh(location, payload.absolutePath);
    if (existing.kind === "tooLarge") {
      throw new Error("This file is too large to save from the editor.");
    }
    return this.writeSshFile(
      location,
      payload.absolutePath,
      existing.buffer,
      payload.content,
      payload.baseModifiedAtMs,
      existing.modifiedAtMs,
    );
  }

  /**
   * External reads/writes are intentionally NOT confined to the project root,
   * but the WSL bridge still requires every target to sit within a declared
   * `projectRoot`. Anchor that root at the file's own parent directory so the
   * bridge's path-safety check passes for exactly this file — siblings and
   * ancestors stay out of scope. Without this, opening an out-of-root path on
   * WSL (e.g. a plan in a `~/.lightcode/worktrees` worktree, or `/etc/hosts`)
   * fails with "path escapes projectRoot". Mirrors the `{ ...location,
   * linuxPath }` idiom used for out-of-root git operations in `git/exec.ts`.
   */
  private externalWslLocation(
    location: Extract<ProjectLocation, { kind: "wsl" }>,
    absolutePath: string,
  ): Extract<ProjectLocation, { kind: "wsl" }> {
    return { ...location, linuxPath: posix.dirname(absolutePath) };
  }

  /**
   * Resolve a path for a native read. Relative paths resolve against the
   * project root (and may not traverse out via `..`); absolute paths are
   * returned as-is so files outside the project root can be opened.
   */
  private resolveProjectNativeReadPath(location: ProjectLocation, path: string): string {
    if (!isAbsolute(path)) {
      return this.resolveEntryPath(location, path);
    }
    return resolve(path);
  }

  /**
   * Resolve a path for a WSL read. Relative paths resolve against the project
   * root; absolute paths are returned as-is so files outside the project root
   * can be opened. The bridge's own path-safety check is satisfied by anchoring
   * `projectRoot` to the file's directory (see {@link externalWslLocation}).
   */
  private resolveProjectLinuxReadPath(
    location: Extract<ProjectLocation, { kind: "wsl" }>,
    path: string,
  ): string {
    const root = posix.resolve(location.linuxPath);
    return path.startsWith("/") ? posix.resolve(path) : posix.resolve(root, path);
  }

  private resolveProjectSshReadPath(location: SshProjectLocation, path: string): string {
    const root = posix.resolve(location.path);
    return path.startsWith("/") ? posix.resolve(path) : posix.resolve(root, path);
  }

  private async readAbsoluteFileBufferNative(absolutePath: string): Promise<RawFileRead> {
    if (!isAbsolute(absolutePath)) throw new Error("Path must be absolute.");
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) throw new Error("Only files can be read.");
    if (fileStat.size > MAX_EDITABLE_FILE_SIZE) {
      return { kind: "tooLarge", modifiedAtMs: fileStat.mtimeMs };
    }
    const buffer = await readFile(absolutePath);
    return { kind: "ok", buffer, modifiedAtMs: fileStat.mtimeMs };
  }

  private async readAbsoluteFileBufferWsl(
    location: Extract<ProjectLocation, { kind: "wsl" }>,
    absolutePath: string,
    wslClient: WslBridgeClient,
  ): Promise<RawFileRead> {
    const result = await wslClient.readFile(location, absolutePath, {
      maxBytes: MAX_EDITABLE_FILE_SIZE,
    });
    if (result.tooLarge) {
      return { kind: "tooLarge", modifiedAtMs: result.mtimeMs };
    }
    return {
      kind: "ok",
      buffer: Buffer.from(result.contentBase64, "base64"),
      modifiedAtMs: result.mtimeMs,
    };
  }

  private async readAbsoluteFileBufferSsh(
    location: SshProjectLocation,
    absolutePath: string,
  ): Promise<RawFileRead> {
    const script = `
path=$1
max=$2
if [ ! -e "$path" ]; then
  printf 'missing\\n'
  exit 0
fi
if [ ! -f "$path" ]; then
  printf 'not_file\\n'
  exit 0
fi
size=$(wc -c < "$path" | tr -d '[:space:]')
mtime=$(stat -c %Y "$path" 2>/dev/null || stat -f %m "$path" 2>/dev/null || printf 0)
if [ "$size" -gt "$max" ]; then
  printf 'too_large\\t%s\\n' "$mtime"
  exit 0
fi
printf 'ok\\t%s\\n' "$mtime"
base64 "$path"
`;
    const result = await readSshCommandOutput(
      location,
      "sh",
      ["-c", script, "sh", absolutePath, String(MAX_EDITABLE_FILE_SIZE)],
      { maxBuffer: MAX_EDITABLE_FILE_SIZE * 2 },
    );
    const headerEnd = result.stdout.indexOf("\n");
    const header = headerEnd === -1 ? result.stdout.trim() : result.stdout.slice(0, headerEnd);
    const [status, mtimeRaw] = header.split("\t");
    if (status === "missing") {
      throw Object.assign(new Error(`ENOENT: no such file or directory, open '${absolutePath}'`), {
        code: "ENOENT",
      });
    }
    if (status === "not_file") {
      throw new Error("Only files can be read.");
    }
    const modifiedAtMs = (Number.parseFloat(mtimeRaw ?? "0") || 0) * 1000;
    if (status === "too_large") {
      return { kind: "tooLarge", modifiedAtMs };
    }
    if (status !== "ok" || headerEnd === -1) {
      throw new Error("Unable to read SSH file.");
    }
    const encoded = result.stdout.slice(headerEnd + 1).replace(/\s/g, "");
    return { kind: "ok", buffer: Buffer.from(encoded, "base64"), modifiedAtMs };
  }

  private async readProjectFileBufferNative(
    location: ProjectLocation,
    relativePath: string,
  ): Promise<RawFileRead> {
    const { fullPath, fileStat } = await this.statFollowingWslSymlinks(location, relativePath);
    if (!fileStat.isFile()) throw new Error("Only files can be opened in the editor.");
    if (fileStat.size > MAX_EDITABLE_FILE_SIZE) {
      return { kind: "tooLarge", modifiedAtMs: fileStat.mtimeMs };
    }
    const buffer = await readFile(fullPath);
    return { kind: "ok", buffer, modifiedAtMs: fileStat.mtimeMs };
  }

  private async readProjectFileBufferWsl(
    location: Extract<ProjectLocation, { kind: "wsl" }>,
    relativePath: string,
    wslClient: WslBridgeClient,
  ): Promise<RawFileRead> {
    const absolute = joinProjectPosixPath(location, relativePath);
    const result = await wslClient.readFile(location, absolute, {
      maxBytes: MAX_EDITABLE_FILE_SIZE,
    });
    if (result.tooLarge) {
      return { kind: "tooLarge", modifiedAtMs: result.mtimeMs };
    }
    return {
      kind: "ok",
      buffer: Buffer.from(result.contentBase64, "base64"),
      modifiedAtMs: result.mtimeMs,
    };
  }

  private async readProjectFileBufferSsh(
    location: SshProjectLocation,
    relativePath: string,
  ): Promise<RawFileRead> {
    return this.readAbsoluteFileBufferSsh(location, joinProjectPosixPath(location, relativePath));
  }

  async writeProjectFile(payload: WriteProjectFilePayload): Promise<WriteProjectFileResult> {
    const path = normalizeRelativePath(payload.path);

    if (payload.projectLocation.kind === "wsl" && this.wslClient) {
      return this.writeProjectFileWsl(payload.projectLocation, path, payload, this.wslClient);
    }
    if (payload.projectLocation.kind === "ssh") {
      return this.writeProjectFileSsh(payload.projectLocation, path, payload);
    }

    const { fullPath, fileStat } = await this.statFollowingWslSymlinks(
      payload.projectLocation,
      path,
    );
    if (!fileStat.isFile()) {
      throw new Error("Only files can be saved from the editor.");
    }
    if (Math.abs(fileStat.mtimeMs - payload.baseModifiedAtMs) > 1) {
      throw new Error("The file changed on disk. Reload it before saving.");
    }
    if (fileStat.size > MAX_EDITABLE_FILE_SIZE) {
      throw new Error("This file is too large to save from the editor.");
    }

    const existingBuffer = await readFile(fullPath);
    if (isBinaryBuffer(existingBuffer)) {
      throw new Error("Binary files cannot be saved from the editor.");
    }

    const nextBuffer = buildWriteBuffer(existingBuffer, payload.content);
    await writeFile(fullPath, nextBuffer);
    this.invalidateCaches(payload.projectLocation);
    const nextStat = await stat(fullPath);
    return { modifiedAtMs: nextStat.mtimeMs };
  }

  private async writeProjectFileWsl(
    location: Extract<ProjectLocation, { kind: "wsl" }>,
    relativePath: string,
    payload: WriteProjectFilePayload,
    wslClient: WslBridgeClient,
  ): Promise<WriteProjectFileResult> {
    const absolute = joinProjectPosixPath(location, relativePath);
    const existing = await wslClient.readFile(location, absolute, {
      maxBytes: MAX_EDITABLE_FILE_SIZE,
    });
    if (existing.tooLarge) {
      throw new Error("This file is too large to save from the editor.");
    }
    if (Math.abs(existing.mtimeMs - payload.baseModifiedAtMs) > 1) {
      throw new Error("The file changed on disk. Reload it before saving.");
    }
    const existingBuffer = Buffer.from(existing.contentBase64, "base64");
    if (isBinaryBuffer(existingBuffer)) {
      throw new Error("Binary files cannot be saved from the editor.");
    }
    const nextBuffer = buildWriteBuffer(existingBuffer, payload.content);
    const result = await wslClient.writeFile(location, absolute, nextBuffer, {
      expectedMtimeMs: existing.mtimeMs,
    });
    this.invalidateCaches(location);
    return { modifiedAtMs: result.mtimeMs };
  }

  private async writeProjectFileSsh(
    location: SshProjectLocation,
    relativePath: string,
    payload: WriteProjectFilePayload,
  ): Promise<WriteProjectFileResult> {
    const absolute = joinProjectPosixPath(location, relativePath);
    const existing = await this.readAbsoluteFileBufferSsh(location, absolute);
    if (existing.kind === "tooLarge") {
      throw new Error("This file is too large to save from the editor.");
    }
    const result = await this.writeSshFile(
      location,
      absolute,
      existing.buffer,
      payload.content,
      payload.baseModifiedAtMs,
      existing.modifiedAtMs,
    );
    this.invalidateCaches(location);
    return result;
  }

  private async writeSshFile(
    location: SshProjectLocation,
    absolutePath: string,
    existingBuffer: Buffer,
    content: string,
    baseModifiedAtMs: number,
    existingModifiedAtMs: number,
  ): Promise<WriteProjectFileResult> {
    if (Math.abs(existingModifiedAtMs - baseModifiedAtMs) > 1) {
      throw new Error("The file changed on disk. Reload it before saving.");
    }
    if (isBinaryBuffer(existingBuffer)) {
      throw new Error("Binary files cannot be saved from the editor.");
    }

    const nextBuffer = buildWriteBuffer(existingBuffer, content);
    const encoded = nextBuffer.toString("base64");
    const expectedMtime = String(Math.round(existingModifiedAtMs / 1000));
    const script = `
target=$1
expected=$2
current=$(stat -c %Y "$target" 2>/dev/null || stat -f %m "$target" 2>/dev/null || printf 0)
if [ "$current" != "$expected" ]; then
  echo "The file changed on disk. Reload it before saving." >&2
  exit 3
fi
parent=\${target%/*}
if [ -n "$parent" ] && [ "$parent" != "$target" ]; then
  mkdir -p "$parent"
fi
tmp="$target.lightcode.$$"
trap 'rm -f "$tmp"' EXIT
base64 -d > "$tmp" <<'__LIGHTCODE_FILE__'
${encoded}
__LIGHTCODE_FILE__
mv "$tmp" "$target"
stat -c %Y "$target" 2>/dev/null || stat -f %m "$target" 2>/dev/null || printf 0
`;
    const result = await readSshCommandOutput(location, "sh", [
      "-c",
      script,
      "sh",
      absolutePath,
      expectedMtime,
    ]);
    return { modifiedAtMs: (Number.parseFloat(result.stdout.trim()) || 0) * 1000 };
  }

  async createProjectEntry(payload: CreateProjectEntryPayload): Promise<void> {
    const path = normalizeRelativePath(payload.path);
    if (!path) {
      throw new Error("A new entry must have a path.");
    }

    if (payload.projectLocation.kind === "wsl" && this.wslClient) {
      const absolute = joinProjectPosixPath(payload.projectLocation, path);
      const parent = absolute.slice(0, absolute.lastIndexOf("/"));
      if (parent && parent !== payload.projectLocation.linuxPath) {
        await this.wslClient.mkdir(payload.projectLocation, parent, { recursive: true });
      }
      if (payload.type === "directory") {
        await this.wslClient.mkdir(payload.projectLocation, absolute);
      } else {
        await this.wslClient.writeNewFile(payload.projectLocation, absolute, Buffer.alloc(0));
      }
      this.invalidateCaches(payload.projectLocation);
      return;
    }
    if (payload.projectLocation.kind === "ssh") {
      const absolute = joinProjectPosixPath(payload.projectLocation, path);
      await readSshCommandOutput(payload.projectLocation, "sh", [
        "-c",
        'parent=${1%/*}; [ -n "$parent" ] && [ "$parent" != "$1" ] && mkdir -p "$parent"; [ ! -e "$1" ] || exit 1; if [ "$2" = directory ]; then mkdir "$1"; else : > "$1"; fi',
        "sh",
        absolute,
        payload.type,
      ]);
      this.invalidateCaches(payload.projectLocation);
      return;
    }

    const fullPath = this.resolveEntryPath(payload.projectLocation, path);
    await mkdir(dirname(fullPath), { recursive: true });
    if (payload.type === "directory") {
      await mkdir(fullPath);
    } else {
      await writeFile(fullPath, "");
    }
    this.invalidateCaches(payload.projectLocation);
  }

  async renameProjectEntry(payload: RenameProjectEntryPayload): Promise<void> {
    const path = normalizeRelativePath(payload.path);
    const nextName = validateEntryName(payload.nextName);
    const nextPath = joinRelativePath(getParentRelativePath(path), nextName);
    if (nextPath === path) return;

    if (payload.projectLocation.kind === "wsl" && this.wslClient) {
      await this.wslClient.rename(
        payload.projectLocation,
        joinProjectPosixPath(payload.projectLocation, path),
        joinProjectPosixPath(payload.projectLocation, nextPath),
      );
      this.invalidateCaches(payload.projectLocation);
      return;
    }
    if (payload.projectLocation.kind === "ssh") {
      await readSshCommandOutput(payload.projectLocation, "mv", [
        "--",
        joinProjectPosixPath(payload.projectLocation, path),
        joinProjectPosixPath(payload.projectLocation, nextPath),
      ]);
      this.invalidateCaches(payload.projectLocation);
      return;
    }

    await rename(
      this.resolveEntryPath(payload.projectLocation, path),
      this.resolveEntryPath(payload.projectLocation, nextPath),
    );
    this.invalidateCaches(payload.projectLocation);
  }

  async moveProjectEntry(payload: MoveProjectEntryPayload): Promise<void> {
    const path = normalizeRelativePath(payload.path);
    const nextParentPath = normalizeRelativePath(payload.nextParentPath);
    if (!path) {
      throw new Error("The project root cannot be moved.");
    }

    const currentName = path.split("/").at(-1);
    if (!currentName) throw new Error("Invalid path.");

    const nextPath = joinRelativePath(nextParentPath, currentName);
    if (nextPath === path) return;

    if (payload.projectLocation.kind === "wsl" && this.wslClient) {
      const stats = await this.wslClient.stat(payload.projectLocation, [
        joinProjectPosixPath(payload.projectLocation, path),
      ]);
      const entry = stats.stats[0];
      if (
        entry?.isDirectory &&
        (nextParentPath === path || nextParentPath.startsWith(`${path}/`))
      ) {
        throw new Error("Folders cannot be moved into themselves.");
      }
      await this.wslClient.rename(
        payload.projectLocation,
        joinProjectPosixPath(payload.projectLocation, path),
        joinProjectPosixPath(payload.projectLocation, nextPath),
      );
      this.invalidateCaches(payload.projectLocation);
      return;
    }
    if (payload.projectLocation.kind === "ssh") {
      const sourcePath = joinProjectPosixPath(payload.projectLocation, path);
      const targetPath = joinProjectPosixPath(payload.projectLocation, nextPath);
      if (nextParentPath === path || nextParentPath.startsWith(`${path}/`)) {
        const sourceType = await readSshCommandOutput(
          payload.projectLocation,
          "sh",
          ["-c", 'test -d "$1" && printf d || printf f', "sh", sourcePath],
          { maxBuffer: 16 },
        ).catch(() => ({ stdout: "f" }));
        if (sourceType.stdout.trim() === "d") {
          throw new Error("Folders cannot be moved into themselves.");
        }
      }
      await readSshCommandOutput(payload.projectLocation, "mv", ["--", sourcePath, targetPath]);
      this.invalidateCaches(payload.projectLocation);
      return;
    }

    const { fullPath: sourceFullPath, fileStat: entryStat } = await this.statFollowingWslSymlinks(
      payload.projectLocation,
      path,
    );
    if (
      entryStat.isDirectory() &&
      (nextParentPath === path || nextParentPath.startsWith(`${path}/`))
    ) {
      throw new Error("Folders cannot be moved into themselves.");
    }

    await rename(sourceFullPath, this.resolveEntryPath(payload.projectLocation, nextPath));
    this.invalidateCaches(payload.projectLocation);
  }

  async deleteProjectEntry(payload: DeleteProjectEntryPayload): Promise<void> {
    const path = normalizeRelativePath(payload.path);

    if (payload.projectLocation.kind === "wsl" && this.wslClient) {
      await this.wslClient.rm(
        payload.projectLocation,
        joinProjectPosixPath(payload.projectLocation, path),
        { recursive: true, force: false },
      );
      this.invalidateCaches(payload.projectLocation);
      return;
    }
    if (payload.projectLocation.kind === "ssh") {
      await readSshCommandOutput(payload.projectLocation, "rm", [
        "-r",
        "--",
        joinProjectPosixPath(payload.projectLocation, path),
      ]);
      this.invalidateCaches(payload.projectLocation);
      return;
    }

    await rm(this.resolveEntryPath(payload.projectLocation, path), {
      recursive: true,
      force: false,
    });
    this.invalidateCaches(payload.projectLocation);
  }

  private async getOrBuildSearchIndex(
    location: ProjectLocation,
    config: SearchConfigPayload,
  ): Promise<{ entries: ProjectTreeEntry[] }> {
    const key = `${getLocationIdentity(location)}|${cacheKeyForSearchConfig(config)}`;
    const cached = this.searchCache.get(key);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      this.searchCache.delete(key);
      this.searchCache.set(key, cached);
      return { entries: cached.entries };
    }

    const entries = await this.buildSearchIndex(location, config);
    if (this.searchCache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.searchCache.keys().next().value;
      if (oldest !== undefined) this.searchCache.delete(oldest);
    }
    this.searchCache.set(key, { entries, createdAt: Date.now() });
    return { entries };
  }

  private async buildSearchIndex(
    location: ProjectLocation,
    config: SearchConfigPayload,
  ): Promise<ProjectTreeEntry[]> {
    const { ignoreNames, residualPatterns } = partitionExcludePatterns(config.excludePatterns);
    // `.git` is always skipped here too — it's locked at the schema level.
    const ignoreSet = new Set<string>([".git", ...ignoreNames]);

    let raw: ProjectTreeEntry[] | undefined;
    if (config.useIgnoreFiles) {
      raw = await this.buildIndexFromGit(location, ignoreSet);
    }
    if (!raw) {
      raw = await this.buildIndexFromWalk(location, ignoreSet);
    }

    if (residualPatterns.length === 0) return raw;
    const filterPatterns = expandDirPatterns(residualPatterns);
    return raw.filter((entry) => !micromatch.isMatch(entry.path, filterPatterns, { dot: true }));
  }

  /**
   * Build the search index from `git ls-files`, which honors `.gitignore`
   * automatically. Returns `undefined` if the project isn't a git repo or
   * git isn't available — the caller falls back to a filesystem walk.
   */
  private async buildIndexFromGit(
    location: ProjectLocation,
    ignoreSet: Set<string>,
  ): Promise<ProjectTreeEntry[] | undefined> {
    let raw: string;
    try {
      raw = await execGit(location, ["ls-files", "--cached", "--others", "--exclude-standard"]);
    } catch {
      return undefined;
    }

    const filePaths = raw
      .split("\n")
      .filter(Boolean)
      .map((p) => p.replace(/\\/g, "/"))
      .filter((p) => !pathHitsIgnoredName(p, ignoreSet))
      .slice(0, MAX_SEARCH_INDEX_SIZE);

    const entries: ProjectTreeEntry[] = [];
    const dirSet = new Set<string>();

    for (const fp of filePaths) {
      const lastSlash = fp.lastIndexOf("/");
      entries.push({
        path: fp,
        name: lastSlash >= 0 ? fp.slice(lastSlash + 1) : fp,
        type: "file",
      });
      const parts = fp.split("/");
      for (let i = 1; i < parts.length; i++) {
        dirSet.add(parts.slice(0, i).join("/"));
      }
    }

    for (const dp of dirSet) {
      const lastSlash = dp.lastIndexOf("/");
      entries.push({
        path: dp,
        name: lastSlash >= 0 ? dp.slice(lastSlash + 1) : dp,
        type: "directory",
        hasChildren: true,
      });
    }

    return entries;
  }

  private async buildIndexFromWalk(
    location: ProjectLocation,
    ignoreSet: Set<string>,
  ): Promise<ProjectTreeEntry[]> {
    if (location.kind === "wsl" && this.wslClient) {
      const { entries } = await this.wslClient.find(location, {
        maxEntries: MAX_SEARCH_INDEX_SIZE,
        ignore: Array.from(ignoreSet),
      });
      return entries.map((entry) => {
        if (entry.type === "directory") {
          return { path: entry.path, name: entry.name, type: "directory", hasChildren: true };
        }
        return { path: entry.path, name: entry.name, type: "file" };
      });
    }
    if (location.kind === "ssh") {
      return this.buildIndexFromWalkSsh(location, ignoreSet);
    }

    const rootPath = getProjectFsPath(location);
    const stack = [""];
    const results: ProjectTreeEntry[] = [];

    while (stack.length > 0 && results.length < MAX_SEARCH_INDEX_SIZE) {
      const directoryPath = stack.pop()!;
      const fullPath = directoryPath ? this.resolveEntryPath(location, directoryPath) : rootPath;
      const entries = await readdir(fullPath, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (ignoreSet.has(entry.name)) continue;
        const path = joinRelativePath(directoryPath, entry.name);
        if (entry.isDirectory()) {
          results.push({ path, name: entry.name, type: "directory", hasChildren: true });
          if (results.length >= MAX_SEARCH_INDEX_SIZE) break;
          stack.push(path);
          continue;
        }
        results.push({ path, name: entry.name, type: "file" });
        if (results.length >= MAX_SEARCH_INDEX_SIZE) break;
      }
    }
    return results;
  }

  private async buildIndexFromWalkSsh(
    location: SshProjectLocation,
    ignoreSet: Set<string>,
  ): Promise<ProjectTreeEntry[]> {
    // Prune the heavy build/dependency directories at the `find` level so the
    // 10MB buffer is not exhausted enumerating (e.g.) node_modules before the
    // real source files are reached. `pathHitsIgnoredName` below still applies
    // the project's full ignore set to whatever survives.
    const pruneExpr = [
      ".git",
      "node_modules",
      ".next",
      "dist",
      "build",
      ".turbo",
      "__pycache__",
      ".venv",
    ]
      .map((name) => `-name '${name}'`)
      .join(" -o ");
    const script = `find "$1" -mindepth 1 \\( ${pruneExpr} \\) -prune -o -printf '%y\\0%P\\0'`;
    const result = await readSshCommandOutput(location, "sh", ["-c", script, "sh", location.path], {
      maxBuffer: 10 * 1024 * 1024,
    }).catch(() => ({ stdout: "" }));
    const parts = result.stdout.split("\0");
    const entries: ProjectTreeEntry[] = [];
    for (let i = 0; i + 1 < parts.length && entries.length < MAX_SEARCH_INDEX_SIZE; i += 2) {
      const type = parts[i];
      const path = parts[i + 1]?.replace(/\\/g, "/");
      if (!type || !path || pathHitsIgnoredName(path, ignoreSet)) continue;
      const slash = path.lastIndexOf("/");
      const name = slash >= 0 ? path.slice(slash + 1) : path;
      if (type === "d") {
        entries.push({ path, name, type: "directory", hasChildren: true });
      } else {
        entries.push({ path, name, type: "file" });
      }
    }
    return entries;
  }

  private rankEntries(
    entries: ProjectTreeEntry[],
    query: string,
    limit: number,
  ): ProjectTreeEntry[] {
    const scored: { entry: ProjectTreeEntry; score: number }[] = [];
    for (const entry of entries) {
      const nameLower = entry.name.toLowerCase();
      const pathLower = entry.path.toLowerCase();
      let score = 0;
      if (nameLower.startsWith(query)) score = 3;
      else if (nameLower.includes(query)) score = 2;
      else if (pathLower.includes(query)) score = 1;
      if (score > 0) scored.push({ entry, score });
    }

    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.entry.type !== b.entry.type) return a.entry.type === "file" ? -1 : 1;
      if (a.entry.path.length !== b.entry.path.length) {
        return a.entry.path.length - b.entry.path.length;
      }
      return a.entry.path.localeCompare(b.entry.path, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    return scored.slice(0, limit).map((item) => item.entry);
  }

  private resolveEntryPath(location: ProjectLocation, path: string): string {
    const rootPath = resolve(getProjectFsPath(location));
    const candidatePath = resolve(
      rootPath,
      ...normalizeRelativePath(path).split("/").filter(Boolean),
    );
    const relativePath = relative(rootPath, candidatePath);
    if (relativePath.startsWith("..") || relativePath === ".." || isAbsolute(relativePath)) {
      throw new Error("Path escapes the project root.");
    }
    return candidatePath;
  }

  /**
   * Determine which symlink entries point to directories.
   * For WSL projects this runs a single batched `wsl.exe` command instead of
   * spawning one process per symlink (~800-1000ms each).
   * Returns a Set of entry names whose symlink targets are directories.
   */
  private async classifySymlinks(
    location: ProjectLocation,
    directoryPath: string,
    entries: Dirent[],
  ): Promise<Set<string>> {
    const symlinks = entries.filter((e) => e.isSymbolicLink());
    if (symlinks.length === 0) return new Set();

    if (location.kind === "wsl") {
      return this.classifyWslSymlinks(location, directoryPath, symlinks);
    }

    // Non-WSL: stat each symlink locally (fast syscall, follows symlinks).
    const dirNames = new Set<string>();
    await Promise.all(
      symlinks.map(async (entry) => {
        try {
          const path = joinRelativePath(directoryPath, entry.name);
          const full = this.resolveEntryPath(location, path);
          if ((await stat(full)).isDirectory()) dirNames.add(entry.name);
        } catch {
          // broken symlink
        }
      }),
    );
    return dirNames;
  }

  /** Batch-classify WSL symlinks via a single `wsl.exe` invocation. */
  private async classifyWslSymlinks(
    location: Extract<ProjectLocation, { kind: "wsl" }>,
    directoryPath: string,
    symlinks: Dirent[],
  ): Promise<Set<string>> {
    const linuxDir = joinProjectPosixPath(location, directoryPath);

    // Build a POSIX script that outputs 'd' or 'f' per symlink, one per line.
    const tests = symlinks
      .map((e) => {
        const escaped = e.name.replace(/'/g, "'\\''");
        return `test -d '${linuxDir}/${escaped}' && printf 'd\\n' || printf 'f\\n'`;
      })
      .join(";");

    const result = await readWslCommandOutputAsync(location.distro, "sh", ["-c", tests]);

    const dirNames = new Set<string>();
    if (result.ok) {
      const lines = result.stdout.split("\n");
      for (let i = 0; i < symlinks.length; i++) {
        if (lines[i]?.trim() === "d") dirNames.add(symlinks[i]!.name);
      }
    }
    return dirNames;
  }

  /**
   * `stat()` a project entry, following WSL symlinks when necessary.
   * Returns both the resolved path and the Stats object so callers never
   * need a redundant second `stat()`.
   *
   * The Windows 9P bridge cannot follow Linux symlinks over UNC paths, so
   * when `stat` fails with ENOENT on a WSL location we resolve the real
   * path via `realpath` inside the distro and rebuild the UNC path.
   */
  private async statFollowingWslSymlinks(
    location: ProjectLocation,
    relativePath: string,
  ): Promise<{ fullPath: string; fileStat: Stats }> {
    const fullPath = this.resolveEntryPath(location, relativePath);
    try {
      return { fullPath, fileStat: await stat(fullPath) };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT" || location.kind !== "wsl") throw err;
    }

    // UNC stat failed — the path likely contains Linux symlinks.
    // Ask WSL to resolve the real path inside the distro.
    const linuxTarget = joinProjectPosixPath(location, relativePath);
    const result = await readWslCommandOutputAsync(location.distro, "realpath", [
      "-e",
      linuxTarget,
    ]);
    if (!result.ok) {
      throw Object.assign(new Error(`ENOENT: no such file or directory, stat '${fullPath}'`), {
        code: "ENOENT",
        syscall: "stat",
        path: fullPath,
      });
    }
    const resolved = `\\\\wsl.localhost\\${location.distro}${result.stdout.replace(/\//g, "\\")}`;
    return { fullPath: resolved, fileStat: await stat(resolved) };
  }

  private async directoryHasVisibleChildren(fullPath: string): Promise<boolean> {
    const entries = await readdir(fullPath, { withFileTypes: true }).catch(() => []);
    return entries.some((entry) => entry.name !== ".git");
  }

  private invalidateCaches(location: ProjectLocation): void {
    const prefix = `${getLocationIdentity(location)}|`;
    for (const key of this.searchCache.keys()) {
      if (key === getLocationIdentity(location) || key.startsWith(prefix)) {
        this.searchCache.delete(key);
      }
    }
  }

  /**
   * Drop all cached search indexes. Called on tree-change events from the
   * watcher — cheap because the cache is bounded to MAX_CACHE_ENTRIES.
   */
  invalidateAllCaches(): void {
    this.searchCache.clear();
  }
}

function cacheKeyForSearchConfig(config: SearchConfigPayload): string {
  return [...config.excludePatterns].sort().join(",");
}

/**
 * Split exclude globs into two buckets:
 * - `ignoreNames`: simple `**\/<name>` (or `**\/<name>/**`) patterns that we
 *   can prune at walk time by skipping the dirent name. Big perf win for
 *   `node_modules`-shaped trees.
 * - `residualPatterns`: anything more complex; applied via micromatch after
 *   the index is built.
 */
function partitionExcludePatterns(patterns: string[]): {
  ignoreNames: string[];
  residualPatterns: string[];
} {
  const ignoreNames: string[] = [];
  const residualPatterns: string[] = [];
  for (const p of patterns) {
    const m = p.match(/^\*\*\/([^/*?[\]]+)(?:\/\*\*)?$/);
    if (m) ignoreNames.push(m[1]!);
    else residualPatterns.push(p);
  }
  return { ignoreNames, residualPatterns };
}

function expandDirPatterns(patterns: string[]): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    out.push(p);
    if (!/(\/\*\*|\*)$/.test(p)) out.push(`${p}/**`);
  }
  return out;
}

/**
 * True if any segment of the path equals one of the ignored names. Used to
 * apply name-based excludes to the git ls-files output (which doesn't
 * support per-segment skipping the way our walker does).
 */
function pathHitsIgnoredName(path: string, ignored: Set<string>): boolean {
  if (ignored.size === 0) return false;
  for (const segment of path.split("/")) {
    if (ignored.has(segment)) return true;
  }
  return false;
}
