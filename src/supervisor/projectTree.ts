import type { Dirent, Stats } from "node:fs";
import { readdir, readFile, rename, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import type {
  BrowseHostDirectoryPayload,
  BrowseHostDirectoryResult,
  CreateProjectEntryPayload,
  DeleteProjectEntryPayload,
  HostDirectoryEntry,
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
  SearchProjectTreePayload,
  SearchProjectTreeResult,
  WriteExternalFilePayload,
  WriteExternalFileResult,
  WriteProjectFilePayload,
  WriteProjectFileResult,
} from "@/shared/contracts";
import { getProjectFsPath, joinProjectPosixPath } from "@/shared/wsl";
import { ProjectSearchIndex } from "./ProjectSearchIndex";
import type { WslBridgeClient } from "./wsl/bridge/client";

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const MAX_HOST_BROWSE_ENTRIES = 4_000;
const MAX_EDITABLE_FILE_SIZE = 1_000_000;

type RawFileRead =
  | { kind: "tooLarge"; modifiedAtMs: number }
  | { kind: "ok"; buffer: Buffer; modifiedAtMs: number };

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

function sortHostEntries(entries: HostDirectoryEntry[]): HostDirectoryEntry[] {
  return entries.toSorted((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

export class ProjectTreeService {
  private readonly searchIndex = new ProjectSearchIndex((location, path) =>
    this.resolveEntryPath(location, path),
  );
  private wslClient: WslBridgeClient | undefined;

  /** Late-bound so the supervisor can wire the bridge client after boot. */
  setWslClient(client: WslBridgeClient): void {
    this.wslClient = client;
    this.searchIndex.setWslClient(client);
  }

  private requireWslClient(): WslBridgeClient {
    if (!this.wslClient) {
      throw new Error("WSL bridge unavailable.");
    }
    return this.wslClient;
  }

  async listProjectTree(payload: ListProjectTreePayload): Promise<ListProjectTreeResult> {
    const directoryPath = normalizeRelativePath(payload.directoryPath);

    if (payload.projectLocation.kind === "wsl") {
      return this.listProjectTreeWsl(
        payload.projectLocation,
        directoryPath,
        this.requireWslClient(),
      );
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

  /**
   * List an arbitrary absolute directory on the host for the folder picker
   * (add-existing / clone parent). Not confined to a project root — this is the
   * one entry point that browses the wider filesystem, so it's gated behind the
   * `projects:manage` remote scope (see gitProcedures.ts), the same capability
   * that can already register any path as a project.
   *
   * Native FS only: paths are the host's own filesystem (POSIX or Windows).
   * Symlinks that resolve to directories are surfaced as directories so they can
   * be navigated into. Hidden entries are included so the user can reach dotted
   * folders. Errors (missing dir, permission denied) propagate to a toast.
   */
  async browseHostDirectory(
    payload: BrowseHostDirectoryPayload,
  ): Promise<BrowseHostDirectoryResult> {
    const home = homedir();
    const requested = payload.path.trim();
    const target = requested ? resolve(requested) : home;

    const targetStat = await stat(target);
    if (!targetStat.isDirectory()) {
      throw new Error("Not a directory.");
    }

    const allDirents = await readdir(target, { withFileTypes: true });
    const truncated = allDirents.length > MAX_HOST_BROWSE_ENTRIES;
    const dirents = truncated ? allDirents.slice(0, MAX_HOST_BROWSE_ENTRIES) : allDirents;

    // Resolve symlink targets in parallel so a folder full of links doesn't
    // serialize a stat() per entry.
    const symlinkDirNames = new Set<string>();
    await Promise.all(
      dirents
        .filter((entry) => entry.isSymbolicLink())
        .map(async (entry) => {
          try {
            if ((await stat(join(target, entry.name))).isDirectory()) {
              symlinkDirNames.add(entry.name);
            }
          } catch {
            // Broken symlink — treat as a file.
          }
        }),
    );

    const entries: HostDirectoryEntry[] = dirents.map((entry) => {
      const isDir = entry.isDirectory() || symlinkDirNames.has(entry.name);
      return {
        name: entry.name,
        path: join(target, entry.name),
        type: isDir ? "directory" : "file",
      };
    });

    const parent = dirname(target);
    return {
      path: target,
      parentPath: parent === target ? null : parent,
      homePath: home,
      entries: sortHostEntries(entries),
      truncated,
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

  async searchProjectTree(payload: SearchProjectTreePayload): Promise<SearchProjectTreeResult> {
    return this.searchIndex.searchProjectTree(payload);
  }

  async readProjectFile(payload: ReadProjectFilePayload): Promise<ReadProjectFileResult> {
    const path = normalizeRelativePath(payload.path);

    const raw =
      payload.projectLocation.kind === "wsl"
        ? await this.readProjectFileBufferWsl(
            payload.projectLocation,
            path,
            this.requireWslClient(),
          )
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
   * reference any file (e.g. a plan in a `~/.poracode/worktrees` worktree),
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
        payload.projectLocation.kind === "wsl"
          ? await this.readAbsoluteFileBufferWsl(
              this.externalWslLocation(payload.projectLocation, payload.absolutePath),
              payload.absolutePath,
              this.requireWslClient(),
            )
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
    if (payload.projectLocation.kind === "wsl") {
      return this.writeExternalFileWsl(payload.projectLocation, payload, this.requireWslClient());
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

  /**
   * External reads/writes are intentionally NOT confined to the project root,
   * but the WSL bridge still requires every target to sit within a declared
   * `projectRoot`. Anchor that root at the file's own parent directory so the
   * bridge's path-safety check passes for exactly this file — siblings and
   * ancestors stay out of scope. Without this, opening an out-of-root path on
   * WSL (e.g. a plan in a `~/.poracode/worktrees` worktree, or `/etc/hosts`)
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

  async writeProjectFile(payload: WriteProjectFilePayload): Promise<WriteProjectFileResult> {
    const path = normalizeRelativePath(payload.path);

    if (payload.projectLocation.kind === "wsl") {
      return this.writeProjectFileWsl(
        payload.projectLocation,
        path,
        payload,
        this.requireWslClient(),
      );
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

  async createProjectEntry(payload: CreateProjectEntryPayload): Promise<void> {
    const path = normalizeRelativePath(payload.path);
    if (!path) {
      throw new Error("A new entry must have a path.");
    }

    if (payload.projectLocation.kind === "wsl") {
      const wslClient = this.requireWslClient();
      const absolute = joinProjectPosixPath(payload.projectLocation, path);
      const parent = absolute.slice(0, absolute.lastIndexOf("/"));
      if (parent && parent !== payload.projectLocation.linuxPath) {
        await wslClient.mkdir(payload.projectLocation, parent, { recursive: true });
      }
      if (payload.type === "directory") {
        await wslClient.mkdir(payload.projectLocation, absolute);
      } else {
        await wslClient.writeNewFile(payload.projectLocation, absolute, Buffer.alloc(0));
      }
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

    if (payload.projectLocation.kind === "wsl") {
      await this.requireWslClient().rename(
        payload.projectLocation,
        joinProjectPosixPath(payload.projectLocation, path),
        joinProjectPosixPath(payload.projectLocation, nextPath),
      );
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

    if (payload.projectLocation.kind === "wsl") {
      const wslClient = this.requireWslClient();
      const stats = await wslClient.stat(payload.projectLocation, [
        joinProjectPosixPath(payload.projectLocation, path),
      ]);
      const entry = stats.stats[0];
      if (
        entry?.isDirectory &&
        (nextParentPath === path || nextParentPath.startsWith(`${path}/`))
      ) {
        throw new Error("Folders cannot be moved into themselves.");
      }
      await wslClient.rename(
        payload.projectLocation,
        joinProjectPosixPath(payload.projectLocation, path),
        joinProjectPosixPath(payload.projectLocation, nextPath),
      );
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

    if (payload.projectLocation.kind === "wsl") {
      await this.requireWslClient().rm(
        payload.projectLocation,
        joinProjectPosixPath(payload.projectLocation, path),
        { recursive: true, force: false },
      );
      this.invalidateCaches(payload.projectLocation);
      return;
    }

    await rm(this.resolveEntryPath(payload.projectLocation, path), {
      recursive: true,
      force: false,
    });
    this.invalidateCaches(payload.projectLocation);
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
   * Returns a Set of entry names whose symlink targets are directories.
   */
  private async classifySymlinks(
    location: ProjectLocation,
    directoryPath: string,
    entries: Dirent[],
  ): Promise<Set<string>> {
    const symlinks = entries.filter((e) => e.isSymbolicLink());
    if (symlinks.length === 0) return new Set();

    if (location.kind === "wsl") return new Set();

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

  /**
   * `stat()` a native project entry.
   * Returns both the resolved path and the Stats object so callers never
   * need a redundant second `stat()`.
   */
  private async statFollowingWslSymlinks(
    location: ProjectLocation,
    relativePath: string,
  ): Promise<{ fullPath: string; fileStat: Stats }> {
    const fullPath = this.resolveEntryPath(location, relativePath);
    return { fullPath, fileStat: await stat(fullPath) };
  }

  private async directoryHasVisibleChildren(fullPath: string): Promise<boolean> {
    const entries = await readdir(fullPath, { withFileTypes: true }).catch((error) => {
      console.warn(`[project-tree] failed to read directory ${fullPath}:`, error);
      return [] as import("node:fs").Dirent[];
    });
    return entries.some((entry) => entry.name !== ".git");
  }

  private invalidateCaches(location: ProjectLocation): void {
    this.searchIndex.invalidateCaches(location);
  }

  /**
   * Drop all cached search indexes. Called on tree-change events from the
   * watcher — cheap because the cache is bounded to MAX_CACHE_ENTRIES.
   */
  invalidateAllCaches(): void {
    this.searchIndex.invalidateAllCaches();
  }
}
