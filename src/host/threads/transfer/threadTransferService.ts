import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readdir, realpath, rm, stat, truncate } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { z, ZodError } from "zod";
import type { Project, ProjectLocation, Thread } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import type {
  IpcProcedurePayload,
  IpcProcedureResult,
  SupervisorProcedureName,
} from "@/shared/ipc";
import { persistedRuntimeItemSchema, type PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { msg, type MessageKey } from "@/shared/messages";
import type { PoracodePaths } from "@/shared/poracodePaths";
import { toLocalFileUrl } from "@/shared/promptContent";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import {
  canTransferThread,
  THREAD_TRANSFER_CHUNK_MAX_BYTES,
  THREAD_TRANSFER_PACKAGE_MAX_BYTES,
  transferableThreadConfig,
  type ThreadTransferBlocker,
  type ThreadTransferCommand,
  type ThreadTransferExportSummary,
  type ThreadTransferResult,
  type ThreadTransferResultOf,
  type ThreadTransferUploadQuery,
} from "@/shared/threadTransfer";
import { buildWorktreeLocation, type WorktreePlacement } from "@/shared/worktree";
import {
  retainThreadAttachmentDirectory,
  saveUploadedAttachmentFile,
} from "@/host/attachments/attachmentStorage";
import { dbGetProject, dbGetProjects, dbGetThread } from "@/host/db";
import { dbCreateTransferredThread } from "@/host/db/threadForks";
import { dbStageThreadTransferTranscript } from "@/host/db/threadTransferTranscript";
import { RemoteHttpError } from "@/host/remote/auth";
import {
  openThreadTransferPackage,
  sha256File,
  ThreadTransferPackageError,
  writeThreadTransferPackage,
  type ThreadTransferPackageHeader,
} from "./packageFormat";

/** Staged bytes expire when a client stops driving the transfer. */
const STAGING_TTL_MS = 30 * 60_000;
/** A committed transfer answers retries of its commit for this long. */
const COMMIT_RECEIPT_TTL_MS = 10 * 60_000;
const MAX_ACTIVE_PER_DIRECTION = 4;
const MAX_ITEMS_JSON_BYTES = 256 * 1024 * 1024;
const MAX_ITEMS = 200_000;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 200;
const MAX_PLAN_PROJECTS = 500;
const MAX_PROBED_PROJECTS = 200;

type CallSupervisor = <Name extends SupervisorProcedureName>(
  name: Name,
  payload: IpcProcedurePayload<Name>,
) => Promise<IpcProcedureResult<Name>>;

export interface ThreadTransferServiceOptions {
  readonly paths: PoracodePaths;
  readonly identity: () => {
    readonly hostId: string;
    readonly hostLabel: string;
    readonly appVersion?: string | undefined;
  };
  readonly callSupervisor: CallSupervisor;
  readonly resolveWorktreePlacement?:
    | ((location: ProjectLocation) => WorktreePlacement)
    | undefined;
  /** Host worktree preflight (watches, setup script); runs after a commit, best effort. */
  readonly prepareWorktree: (projectId: string, worktreePath: string) => Promise<void>;
  readonly publishThreadsChanged: (threadIds: readonly string[]) => void;
  readonly now?: () => number;
}

interface StagedExport {
  readonly threadId: string;
  readonly dir: string;
  readonly packagePath: string;
  readonly result: ThreadTransferResultOf<"export">;
  expiresAt: number;
}

interface StagedImport {
  readonly dir: string;
  readonly packagePath: string;
  readonly total: number;
  readonly sha256: string;
  received: number;
  expiresAt: number;
  lock: Promise<unknown>;
}

type CommitResult = ThreadTransferResultOf<"commit">;

/** Supervisor Git refusals that clients localize by code. */
const GIT_REFUSAL_CODES: ReadonlyArray<readonly [MessageKey, string]> = [
  ["thread.transferHistoryMissing", "thread_transfer_history_missing"],
  ["thread.transferTargetNotGit", "thread_transfer_target_not_git"],
  ["thread.transferNoCommits", "thread_transfer_no_commits"],
  ["thread.transferUnsupportedLocation", "thread_transfer_unsupported_location"],
  ["thread.transferBranchInvalid", "thread_transfer_branch_invalid"],
];

function refusal(code: string, key: MessageKey, status: number): RemoteHttpError {
  return new RemoteHttpError(code, msg(key), status);
}

const blockerRefusals: Record<ThreadTransferBlocker, () => RemoteHttpError> = {
  not_chat: () => refusal("thread_transfer_not_chat", "thread.transferNotChat", 409),
  busy: () => refusal("thread_transfer_busy", "thread.transferBusy", 409),
  no_history: () => refusal("thread_transfer_no_history", "thread.transferNoHistory", 409),
  unsupported_location: () =>
    refusal("thread_transfer_unsupported_location", "thread.transferUnsupportedLocation", 409),
};

function transferError(error: unknown): unknown {
  if (error instanceof RemoteHttpError) return error;
  if (error instanceof ThreadTransferPackageError || error instanceof ZodError) {
    return refusal("thread_transfer_invalid_package", "thread.transferPackageInvalid", 400);
  }
  if (error instanceof Error && error.name === "Error") {
    const known = GIT_REFUSAL_CODES.find(([key]) => error.message === msg(key));
    if (known) return new RemoteHttpError(known[1], error.message, 409);
    if (error.message === msg("thread.alreadyExists")) {
      return new RemoteHttpError("thread_already_exists", error.message, 409);
    }
    return new RemoteHttpError("thread_transfer_failed", error.message, 422);
  }
  return error;
}

/** `EPERM` means the process exists under another user; only `ESRCH` proves it exited. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function locationPath(location: ProjectLocation): string {
  return location.kind === "wsl" ? location.linuxPath : location.path;
}

function threadLocation(thread: Thread, project: Project): ProjectLocation {
  return thread.worktreePath
    ? buildWorktreeLocation(project.location, thread.worktreePath)
    : project.location;
}

function requireThread(threadId: string): Thread {
  const thread = dbGetThread(threadId);
  if (!thread) throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  return thread;
}

function requireProject(projectId: string): Project {
  const project = dbGetProject(projectId);
  if (!project) throw refusal("project_not_found", "remote.project.notFound", 404);
  return project;
}

interface OwnedAttachment {
  readonly sourcePath: string;
  readonly fileName: string;
  /** The resolved file inside the attachment root, streamed into the package. */
  readonly file: string;
}

/** Owned attachment files referenced by the moving conversation, once each. */
async function collectOwnedAttachments(
  candidatePaths: readonly string[],
  attachmentsDir: string,
): Promise<OwnedAttachment[]> {
  const found = new Map<string, OwnedAttachment>();
  let realRoot: string | undefined;
  for (const sourcePath of candidatePaths) {
    if (found.has(sourcePath) || found.size >= MAX_ATTACHMENTS) continue;
    const owned = relative(attachmentsDir, sourcePath);
    if (!owned || owned === ".." || owned.startsWith(`..${sep}`) || isAbsolute(owned)) continue;
    realRoot ??= await realpath(attachmentsDir);
    const actual = await realpath(sourcePath).catch(() => undefined);
    if (!actual) continue;
    const inside = relative(realRoot, actual);
    if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) continue;
    const info = await stat(actual);
    if (!info.isFile() || info.size > MAX_ATTACHMENT_BYTES) continue;
    found.set(sourcePath, {
      sourcePath,
      fileName: basename(sourcePath).slice(0, 255),
      file: actual,
    });
  }
  return [...found.values()];
}

/** Points moved attachment blocks at their new files; every other item is untouched. */
function rewriteAttachmentPaths(
  items: readonly PersistedRuntimeItem[],
  paths: ReadonlyMap<string, string>,
): PersistedRuntimeItem[] {
  if (paths.size === 0) return [...items];
  return items.map((item) => {
    if (item.type !== "user_message" && item.type !== "assistant_message") return item;
    const payload = item.payload as { content?: unknown } | undefined;
    if (!Array.isArray(payload?.content)) return item;
    const content = payload.content.map((entry: unknown) => {
      const block = entry as { kind?: unknown; path?: unknown } | null;
      const target = typeof block?.path === "string" ? paths.get(block.path) : undefined;
      if (!target || (block?.kind !== "image" && block?.kind !== "file")) return entry;
      return {
        ...(entry as object),
        path: target,
        ...(block.kind === "image" ? { dataUrl: toLocalFileUrl(target) } : {}),
      };
    });
    return { ...item, payload: { ...payload, content } };
  });
}

const gunzipAsync = promisify(gunzip);

async function parsePackagedItems(compressed: Buffer, header: ThreadTransferPackageHeader) {
  const json = (await gunzipAsync(compressed, { maxOutputLength: MAX_ITEMS_JSON_BYTES })).toString(
    "utf8",
  );
  const items = z.array(persistedRuntimeItemSchema).max(MAX_ITEMS).parse(JSON.parse(json));
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length || !ids.has(header.transcript.throughItemId)) {
    throw new ThreadTransferPackageError("inconsistent transcript");
  }
  return items;
}

/**
 * Host side of a thread transfer (see `src/shared/threadTransfer.ts`). One
 * instance per remote server; staged files live under the host cache and are
 * cleared at first use, so a restart never resumes a half transfer.
 */
export class ThreadTransferService {
  private readonly parent: string;
  private readonly root: string;
  private readonly exports = new Map<string, StagedExport>();
  private readonly pendingExports = new Map<
    string,
    { threadId: string; promise: Promise<ThreadTransferResultOf<"export">> }
  >();
  private readonly imports = new Map<string, StagedImport>();
  private readonly committed = new Map<string, { result: CommitResult; expiresAt: number }>();
  private prepared: Promise<void> | null = null;

  constructor(private readonly options: ThreadTransferServiceOptions) {
    this.parent = join(options.paths.cacheDir, "thread-transfers");
    this.root = join(this.parent, `${process.pid}-${randomUUID()}`);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private prepare(): Promise<void> {
    this.prepared ??= (async () => {
      // Every instance stages under its own `<pid>-<id>` directory, so another
      // server in this process keeps its files; those of exited processes are orphans.
      for (const entry of await readdir(this.parent).catch(() => [] as string[])) {
        const pid = Number(entry.split("-", 1)[0]);
        if (Number.isSafeInteger(pid) && pid > 0 && processAlive(pid)) continue;
        await rm(join(this.parent, entry), { recursive: true, force: true }).catch(() => undefined);
      }
      await mkdir(join(this.root, "exports"), { recursive: true });
      await mkdir(join(this.root, "imports"), { recursive: true });
    })();
    return this.prepared;
  }

  private sweep(): void {
    const now = this.now();
    for (const [id, staged] of this.exports) {
      if (staged.expiresAt > now) continue;
      this.exports.delete(id);
      void rm(staged.dir, { recursive: true, force: true }).catch(() => undefined);
    }
    for (const [id, staged] of this.imports) {
      if (staged.expiresAt > now) continue;
      this.imports.delete(id);
      void rm(staged.dir, { recursive: true, force: true }).catch(() => undefined);
    }
    for (const [id, receipt] of this.committed) {
      if (receipt.expiresAt <= now) this.committed.delete(id);
    }
  }

  async run(command: ThreadTransferCommand): Promise<ThreadTransferResult> {
    await this.prepare();
    this.sweep();
    try {
      switch (command.kind) {
        case "describe":
          return await this.describe(command.threadId);
        case "plan":
          return await this.plan(command);
        case "export":
          return await this.exportThread(command);
        case "read":
          return await this.read(command);
        case "release":
          await this.release(command.transferId);
          return { kind: "release", ok: true };
        case "commit":
          return await this.commit(command);
        case "abort":
          await this.abort(command.transferId);
          return { kind: "abort", ok: true };
      }
    } catch (error) {
      throw transferError(error);
    }
  }

  private async describe(threadId: string): Promise<ThreadTransferResultOf<"describe">> {
    const thread = requireThread(threadId);
    const project = requireProject(thread.projectId);
    const location = threadLocation(thread, project);
    const home = isHomeProjectId(project.id);
    const blocker: ThreadTransferBlocker | undefined =
      thread.presentationMode !== "gui"
        ? "not_chat"
        : !canTransferThread(thread)
          ? "busy"
          : !home && location.kind === "wsl"
            ? "unsupported_location"
            : undefined;
    let git: ThreadTransferResultOf<"describe">["source"]["git"] = null;
    if (!home && location.kind !== "wsl") {
      const inspection = await this.options.callSupervisor("threadTransferInspectGit", {
        projectLocation: location,
      });
      if (inspection.repository) {
        git = {
          ...(inspection.branch ? { branch: inspection.branch } : {}),
          ...(inspection.head ? { head: inspection.head } : {}),
          changedFiles: inspection.changedFiles,
          repoIdentities: inspection.repoIdentities,
        };
      }
    }
    return {
      kind: "describe",
      source: {
        threadId: thread.id,
        title: thread.title,
        agentKind: thread.agentKind,
        presentationMode: thread.presentationMode ?? "terminal",
        ...(blocker ? { blocker } : {}),
        git,
      },
    };
  }

  private async plan(
    command: Extract<ThreadTransferCommand, { kind: "plan" }>,
  ): Promise<ThreadTransferResultOf<"plan">> {
    const requested = command.projectId ? dbGetProject(command.projectId) : undefined;
    const projects = command.projectId
      ? requested
        ? [requested]
        : []
      : dbGetProjects().slice(0, MAX_PLAN_PROJECTS);
    const probed = projects
      .filter((project) => !isHomeProjectId(project.id) && project.location.kind !== "wsl")
      .slice(0, MAX_PROBED_PROJECTS);
    const probe =
      probed.length > 0
        ? await this.options.callSupervisor("threadTransferRepoProbe", {
            projectLocations: probed.map((project) => project.location),
          })
        : { repositories: [] };
    const repositories = new Map(
      probed.map((project, index) => [project.id, probe.repositories[index]]),
    );
    const wanted = new Set(command.repoIdentities);
    const planned = projects.map((project) => {
      const repository = repositories.get(project.id);
      return {
        projectId: project.id,
        name: project.name,
        git: repository?.repository ?? false,
        matched: repository?.repoIdentities.some((identity) => wanted.has(identity)) ?? false,
      };
    });
    const selected = command.projectId
      ? planned.find((project) => project.projectId === command.projectId)
      : planned.find((project) => project.matched);
    const selectedProject = selected
      ? projects.find((project) => project.id === selected.projectId)
      : undefined;
    const haves =
      selected?.git && selectedProject
        ? (
            await this.options.callSupervisor("threadTransferGitHaves", {
              projectLocation: selectedProject.location,
            })
          ).haves
        : [];
    return {
      kind: "plan",
      projects: planned,
      ...(selected ? { selectedProjectId: selected.projectId } : {}),
      haves,
    };
  }

  private exportThread(
    command: Extract<ThreadTransferCommand, { kind: "export" }>,
  ): Promise<ThreadTransferResultOf<"export">> {
    const staged = this.exports.get(command.transferId);
    if (staged) {
      if (staged.threadId !== command.threadId) {
        throw new RemoteHttpError("thread_transfer_mismatch", "Transfer id already in use.", 409);
      }
      staged.expiresAt = this.now() + STAGING_TTL_MS;
      return Promise.resolve(staged.result);
    }
    const pending = this.pendingExports.get(command.transferId);
    if (pending) {
      if (pending.threadId !== command.threadId) {
        throw new RemoteHttpError("thread_transfer_mismatch", "Transfer id already in use.", 409);
      }
      return pending.promise;
    }
    if (this.exports.size + this.pendingExports.size >= MAX_ACTIVE_PER_DIRECTION) {
      throw refusal("thread_transfer_limit", "thread.transferLimit", 429);
    }
    const attempt = this.stageExport(command).finally(() =>
      this.pendingExports.delete(command.transferId),
    );
    this.pendingExports.set(command.transferId, { threadId: command.threadId, promise: attempt });
    return attempt;
  }

  private async stageExport(
    command: Extract<ThreadTransferCommand, { kind: "export" }>,
  ): Promise<ThreadTransferResultOf<"export">> {
    const thread = requireThread(command.threadId);
    const project = requireProject(thread.projectId);
    const location = threadLocation(thread, project);
    const home = isHomeProjectId(project.id);
    if (thread.presentationMode !== "gui") throw blockerRefusals.not_chat();
    if (!canTransferThread(thread)) throw blockerRefusals.busy();
    if (!home && location.kind === "wsl") throw blockerRefusals.unsupported_location();
    const dir = join(this.root, "exports", command.transferId);
    const itemsPath = join(dir, "items.json.gz");
    await mkdir(dir, { recursive: true });
    try {
      const snapshot = await dbStageThreadTransferTranscript(thread.id, itemsPath);
      if (!snapshot) throw blockerRefusals.no_history();
      let git: ThreadTransferPackageHeader["git"] = null;
      let bundleFile: string | undefined;
      let bundleBytes = 0;
      const inspection = home
        ? null
        : await this.options.callSupervisor("threadTransferInspectGit", {
            projectLocation: location,
          });
      if (inspection?.repository) {
        const bundlePath = join(dir, "repo.bundle");
        const exported = await this.options.callSupervisor("threadTransferExportGit", {
          projectLocation: location,
          transferId: command.transferId,
          haves: command.haves,
          bundlePath,
        });
        const { bundleBytes: written, ...state } = exported;
        bundleBytes = written;
        git = { ...state, bundle: written > 0 };
        if (written > 0) bundleFile = bundlePath;
      }
      const attachments = await collectOwnedAttachments(
        snapshot.attachmentCandidatePaths,
        this.options.paths.attachmentsDir,
      );
      const identity = this.options.identity();
      const packagePath = join(dir, "package.bin");
      const written = await writeThreadTransferPackage(
        packagePath,
        {
          formatVersion: 1,
          createdAt: new Date(this.now()).toISOString(),
          source: {
            hostId: identity.hostId,
            // The machine name, as clients show it ("Poracode on X" → "X").
            hostLabel: desktopTitle(identity.hostLabel),
            ...(identity.appVersion ? { appVersion: identity.appVersion } : {}),
          },
          thread: {
            id: thread.id,
            title: thread.title,
            agentKind: thread.agentKind,
            config: transferableThreadConfig(thread.config),
            presentationMode: "gui",
            createdAt: thread.createdAt,
            starred: thread.starred,
            workingDirectory: locationPath(location),
          },
          transcript: { throughItemId: snapshot.throughItemId, turns: snapshot.turns },
          git,
          attachments: attachments.map((attachment, index) => ({
            part: `attachment-${index}`,
            fileName: attachment.fileName,
            sourcePath: attachment.sourcePath,
          })),
        },
        [
          {
            name: "items",
            file: itemsPath,
          },
          ...(bundleFile ? [{ name: "bundle", file: bundleFile }] : []),
          ...attachments.map((attachment, index) => ({
            name: `attachment-${index}`,
            file: attachment.file,
          })),
        ],
      );
      await rm(itemsPath, { force: true });
      if (bundleFile) await rm(bundleFile, { force: true });
      if (written.byteLength > THREAD_TRANSFER_PACKAGE_MAX_BYTES) {
        throw new RemoteHttpError(
          "thread_transfer_too_large",
          msg("thread.transferTooLarge", {
            size: `${Math.ceil(written.byteLength / 1024 / 1024)} MB`,
          }),
          413,
        );
      }
      const summary: ThreadTransferExportSummary = {
        itemCount: snapshot.itemCount,
        turnCount: snapshot.turns.length,
        attachmentCount: attachments.length,
        git: git
          ? {
              ...(git.branch ? { branch: git.branch } : {}),
              head: git.head,
              changedFiles: git.changedFiles,
              basisCount: git.basis.length,
              bundleBytes,
            }
          : null,
      };
      const result: ThreadTransferResultOf<"export"> = {
        kind: "export",
        transferId: command.transferId,
        byteLength: written.byteLength,
        sha256: written.sha256,
        summary,
      };
      this.exports.set(command.transferId, {
        threadId: thread.id,
        dir,
        packagePath,
        result,
        expiresAt: this.now() + STAGING_TTL_MS,
      });
      return result;
    } catch (error) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async read(
    command: Extract<ThreadTransferCommand, { kind: "read" }>,
  ): Promise<ThreadTransferResultOf<"read">> {
    const staged = this.exports.get(command.transferId);
    if (!staged) throw refusal("thread_transfer_expired", "thread.transferExpired", 410);
    const { byteLength } = staged.result;
    if (command.offset > byteLength) {
      throw new RemoteHttpError("invalid_request", "Read offset is past the package end.", 400);
    }
    staged.expiresAt = this.now() + STAGING_TTL_MS;
    const length = Math.min(command.length, byteLength - command.offset);
    const data = Buffer.alloc(length);
    const handle = await open(staged.packagePath, "r");
    try {
      if (length > 0) await handle.read(data, 0, length, command.offset);
    } finally {
      await handle.close();
    }
    return { kind: "read", offset: command.offset, data: data.toString("base64") };
  }

  private async release(transferId: string): Promise<void> {
    const staged = this.exports.get(transferId);
    if (!staged) return;
    this.exports.delete(transferId);
    await rm(staged.dir, { recursive: true, force: true });
  }

  private async abort(transferId: string): Promise<void> {
    const staged = this.imports.get(transferId);
    if (!staged) return;
    await this.locked(staged, async () => {
      if (this.imports.get(transferId) !== staged) return;
      this.imports.delete(transferId);
      await rm(staged.dir, { recursive: true, force: true });
    });
  }

  /** Serializes the upload and commit steps of one transfer. */
  private locked<T>(staged: StagedImport, operation: () => Promise<T>): Promise<T> {
    const next = staged.lock.catch(() => undefined).then(operation);
    staged.lock = next.catch(() => undefined);
    return next;
  }

  async upload(
    transferId: string,
    query: ThreadTransferUploadQuery,
    data: Uint8Array,
  ): Promise<{ received: number }> {
    await this.prepare();
    this.sweep();
    if (this.committed.has(transferId)) return { received: query.total };
    if (data.length === 0 || data.length > THREAD_TRANSFER_CHUNK_MAX_BYTES) {
      throw new RemoteHttpError("invalid_request", "Upload chunk size is invalid.", 400);
    }
    let staged = this.imports.get(transferId);
    if (!staged) {
      if (query.offset !== 0) {
        throw refusal("thread_transfer_expired", "thread.transferExpired", 410);
      }
      if (this.imports.size >= MAX_ACTIVE_PER_DIRECTION) {
        throw refusal("thread_transfer_limit", "thread.transferLimit", 429);
      }
      const dir = join(this.root, "imports", transferId);
      await mkdir(dir, { recursive: true });
      staged = this.imports.get(transferId) ?? {
        dir,
        packagePath: join(dir, "package.bin"),
        total: query.total,
        sha256: query.sha256,
        received: 0,
        expiresAt: this.now() + STAGING_TTL_MS,
        lock: Promise.resolve(),
      };
      this.imports.set(transferId, staged);
    }
    if (staged.total !== query.total || staged.sha256 !== query.sha256) {
      throw new RemoteHttpError("thread_transfer_mismatch", "The upload does not match.", 409);
    }
    const target = staged;
    return this.locked(target, async () => {
      // A retried chunk that already landed is acknowledged without a second write.
      if (query.offset + data.length <= target.received) return { received: target.received };
      if (query.offset !== target.received || query.offset + data.length > target.total) {
        throw new RemoteHttpError(
          "thread_transfer_out_of_order",
          "The upload chunk is out of order.",
          409,
        );
      }
      try {
        await appendFile(target.packagePath, data);
      } catch (error) {
        await truncate(target.packagePath, target.received).catch(() => undefined);
        throw error;
      }
      target.received += data.length;
      target.expiresAt = this.now() + STAGING_TTL_MS;
      return { received: target.received };
    });
  }

  private async commit(
    command: Extract<ThreadTransferCommand, { kind: "commit" }>,
  ): Promise<CommitResult> {
    const receipt = this.committed.get(command.transferId);
    if (receipt) return { ...receipt.result, replayed: true };
    const existing = dbGetThread(command.threadId);
    if (existing) {
      // A lost reply after a restart: the saved row proves this transfer committed.
      if (existing.forkedFrom?.transfer?.transferId !== command.transferId) {
        throw refusal("thread_already_exists", "thread.alreadyExists", 409);
      }
      return {
        kind: "commit",
        thread: existing,
        ...(existing.worktreePath ? { worktreePath: existing.worktreePath } : {}),
        ...(existing.worktreeBranch ? { branch: existing.worktreeBranch } : {}),
        branchRenamed: false,
        replayed: true,
      };
    }
    const staged = this.imports.get(command.transferId);
    if (!staged) throw refusal("thread_transfer_expired", "thread.transferExpired", 410);
    return this.locked(staged, async () => {
      const repeat = this.committed.get(command.transferId);
      if (repeat) return { ...repeat.result, replayed: true };
      if (
        staged.received !== staged.total ||
        staged.total !== command.byteLength ||
        staged.sha256 !== command.sha256
      ) {
        throw new RemoteHttpError("thread_transfer_incomplete", "The upload is incomplete.", 409);
      }
      if ((await sha256File(staged.packagePath)) !== staged.sha256) {
        throw new ThreadTransferPackageError("checksum mismatch");
      }
      const result = await this.applyPackage(command, staged);
      this.committed.set(command.transferId, {
        result,
        expiresAt: this.now() + COMMIT_RECEIPT_TTL_MS,
      });
      this.imports.delete(command.transferId);
      void rm(staged.dir, { recursive: true, force: true }).catch(() => undefined);
      this.options.publishThreadsChanged([result.thread.id]);
      if (result.worktreePath) {
        void this.options
          .prepareWorktree(command.projectId, result.worktreePath)
          .catch(() => undefined);
      }
      return result;
    });
  }

  private async applyPackage(
    command: Extract<ThreadTransferCommand, { kind: "commit" }>,
    staged: StagedImport,
  ): Promise<CommitResult> {
    const project = requireProject(command.projectId);
    const pkg = await openThreadTransferPackage(staged.packagePath);
    const { header } = pkg;
    const items = await parsePackagedItems(
      await pkg.readPart("items", MAX_ITEMS_JSON_BYTES),
      header,
    );
    if (header.git && (isHomeProjectId(project.id) || project.location.kind === "wsl")) {
      throw refusal(
        project.location.kind === "wsl"
          ? "thread_transfer_unsupported_location"
          : "thread_transfer_target_not_git",
        project.location.kind === "wsl"
          ? "thread.transferUnsupportedLocation"
          : "thread.transferTargetNotGit",
        409,
      );
    }
    const releaseAttachments = retainThreadAttachmentDirectory(command.threadId);
    const savedAttachments: string[] = [];
    let git: IpcProcedureResult<"threadTransferImportGit"> | undefined;
    try {
      const movedPaths = new Map<string, string>();
      for (const attachment of header.attachments) {
        const saved = await saveUploadedAttachmentFile(this.options.paths, {
          threadId: command.threadId,
          fileName: attachment.fileName,
          data: await pkg.readPart(attachment.part, MAX_ATTACHMENT_BYTES),
        });
        savedAttachments.push(saved);
        movedPaths.set(attachment.sourcePath, saved);
      }
      if (header.git) {
        const { bundle, ...state } = header.git;
        let bundlePath: string | undefined;
        if (bundle) {
          bundlePath = join(staged.dir, "repo.bundle");
          await rm(bundlePath, { force: true });
          await pkg.copyPartToFile("bundle", bundlePath);
        }
        const placement = this.options.resolveWorktreePlacement?.(project.location);
        git = await this.options.callSupervisor("threadTransferImportGit", {
          projectLocation: project.location,
          transferId: command.transferId,
          ...(bundlePath ? { bundlePath } : {}),
          git: state,
          ...(placement?.root ? { worktreeRoot: placement.root } : {}),
          ...(placement?.omitRepoDir ? { worktreeOmitRepoDir: true } : {}),
        });
      }
      const now = new Date(this.now()).toISOString();
      // The client always sends the composer's agent+config; an absent agent
      // (older client) keeps the source provider and its portable settings.
      const agentChanged =
        command.agent !== undefined && command.agent.kind !== header.thread.agentKind;
      const thread: Thread = {
        id: command.threadId,
        projectId: project.id,
        title: header.thread.title,
        agentKind: command.agent?.kind ?? header.thread.agentKind,
        config: transferableThreadConfig(command.agent?.config ?? header.thread.config),
        status: "inactive",
        attention: "none",
        canResumeWithConfig: true,
        archived: false,
        done: false,
        starred: header.thread.starred,
        presentationMode: "gui",
        threadStatusSource: "server",
        ...(git
          ? {
              worktreePath: git.worktreePath,
              ...(git.branch ? { worktreeBranch: git.branch } : {}),
            }
          : {}),
        forkedFrom: {
          version: 1,
          threadId: header.thread.id,
          title: header.thread.title,
          throughItemId: header.transcript.throughItemId,
          inheritedTurnCount: Math.max(1, header.transcript.turns.length),
          contextStrategy: "transcript",
          transfer: {
            version: 1,
            transferId: command.transferId,
            sourceHostLabel: header.source.hostLabel,
            sourceHostId: header.source.hostId,
            ...(header.thread.workingDirectory
              ? { sourceWorkingDirectory: header.thread.workingDirectory }
              : {}),
            targetHostLabel: desktopTitle(this.options.identity().hostLabel),
            ...(agentChanged ? { fromAgentKind: header.thread.agentKind } : {}),
            transferredAt: now,
          },
        },
        createdAt: header.thread.createdAt,
        updatedAt: now,
      };
      const created = await dbCreateTransferredThread({
        thread,
        items: rewriteAttachmentPaths(items, movedPaths),
        turns: header.transcript.turns,
      });
      return {
        kind: "commit",
        thread: created,
        ...(git
          ? { worktreePath: git.worktreePath, ...(git.branch ? { branch: git.branch } : {}) }
          : {}),
        branchRenamed: git?.branchRenamed ?? false,
        replayed: false,
      };
    } catch (error) {
      if (git) {
        await this.options
          .callSupervisor("gitRemoveWorktree", {
            projectLocation: project.location,
            path: git.worktreePath,
            force: true,
            deleteBranch: git.branchCreated,
            ...(git.branchCreated && git.branch ? { expectedBranch: git.branch } : {}),
          })
          .catch(() => undefined);
      }
      for (const path of savedAttachments) await rm(path, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      releaseAttachments();
    }
  }
}
