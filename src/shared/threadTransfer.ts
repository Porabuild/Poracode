import { z } from "zod";
import { agentKindSchema, threadPresentationModeSchema } from "./contracts/common";
import { threadConfigSchema, type ThreadConfig } from "./contracts/config";
import { threadSchema, type Thread } from "./contracts/thread";
import { parseForgeRemote } from "./forgeRemote";
import type { PersistedCompletedTurn, PersistedRuntimeItem } from "./ipc/schemas";
import { canForkThread, settledSnapshotItems } from "./threadFork";

/**
 * Thread transfer ("Move to another machine"). A client that holds grants for
 * two hosts moves one settled chat thread, with the Git state of its working
 * directory, from one host to the other: the source host packages the thread,
 * the client streams the package to the target host, and the target saves an
 * inactive thread whose first turn inherits the conversation. Each host stays
 * the only writer of its own data; hosts never talk to each other.
 *
 * Version 1 covers the `threadTransfer` capability, the command and upload
 * routes, and package format 1. Bump it for any change an older peer would
 * misread, and keep serving version 1 while supported clients still send it.
 */
export const THREAD_TRANSFER_VERSION = 1 as const;

/** One read or upload request: below every transport cap (bridge, relay, JSON). */
export const THREAD_TRANSFER_CHUNK_MAX_BYTES = 4 * 1024 * 1024;
/** Whole package bound, enforced by both hosts before staging bytes. */
export const THREAD_TRANSFER_PACKAGE_MAX_BYTES = 512 * 1024 * 1024;
/** Commits the target offers as already present, so the bundle carries only the rest. */
export const THREAD_TRANSFER_HAVES_MAX = 256;
export const THREAD_TRANSFER_REPO_IDENTITIES_MAX = 16;
const THREAD_TRANSFER_PLAN_PROJECTS_MAX = 500;
/** Base64 length of a full chunk (four characters per three bytes, padded). */
const THREAD_TRANSFER_CHUNK_BASE64_MAX = Math.ceil(THREAD_TRANSFER_CHUNK_MAX_BYTES / 3) * 4;

/** Client-minted transfer id; also a staging directory name, so the charset is closed. */
export const threadTransferIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/u);
export const gitCommitShaSchema = z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u);
export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/u);

export const threadTransferCommandSchema = z.discriminatedUnion("kind", [
  /** Source: what would move, and whether the thread can move now. */
  z.object({ kind: z.literal("describe"), threadId: z.string().min(1) }),
  /** Target: projects that could receive the thread, and commits it already has. */
  z.object({
    kind: z.literal("plan"),
    projectId: z.string().min(1).optional(),
    repoIdentities: z.array(z.string().min(1).max(512)).max(THREAD_TRANSFER_REPO_IDENTITIES_MAX),
  }),
  /** Source: stage the package. Read-only for the thread and the checkout. */
  z.object({
    kind: z.literal("export"),
    transferId: threadTransferIdSchema,
    threadId: z.string().min(1),
    haves: z.array(gitCommitShaSchema).max(THREAD_TRANSFER_HAVES_MAX),
  }),
  /** Source: one byte range of a staged package. */
  z.object({
    kind: z.literal("read"),
    transferId: threadTransferIdSchema,
    offset: z.number().int().nonnegative(),
    length: z.number().int().min(1).max(THREAD_TRANSFER_CHUNK_MAX_BYTES),
  }),
  /** Source: drop a staged package. */
  z.object({ kind: z.literal("release"), transferId: threadTransferIdSchema }),
  /** Target: verify the uploaded package and save the moved thread. Idempotent per transfer. */
  z.object({
    kind: z.literal("commit"),
    transferId: threadTransferIdSchema,
    threadId: z.string().min(1),
    projectId: z.string().min(1),
    byteLength: z.number().int().min(1).max(THREAD_TRANSFER_PACKAGE_MAX_BYTES),
    sha256: sha256HexSchema,
    /**
     * The provider and settings the moved thread continues with, chosen
     * against this host's agents. The host strips host-bound fields before
     * saving. Absent keeps the source provider and its settings.
     */
    agent: z.object({ kind: agentKindSchema, config: threadConfigSchema }).optional(),
  }),
  /** Target: drop an unfinished upload. */
  z.object({ kind: z.literal("abort"), transferId: threadTransferIdSchema }),
]);
export type ThreadTransferCommand = z.infer<typeof threadTransferCommandSchema>;

/** Why a thread cannot move right now. */
export const threadTransferBlockerSchema = z.enum([
  "not_chat",
  "busy",
  "no_history",
  "unsupported_location",
]);
export type ThreadTransferBlocker = z.infer<typeof threadTransferBlockerSchema>;

const threadTransferGitSummarySchema = z.object({
  /** Absent for a detached HEAD. */
  branch: z.string().min(1).optional(),
  /** Absent for a repository without commits. */
  head: gitCommitShaSchema.optional(),
  /** Staged, unstaged and untracked (not ignored) paths. */
  changedFiles: z.number().int().nonnegative(),
  repoIdentities: z.array(z.string().min(1)).max(THREAD_TRANSFER_REPO_IDENTITIES_MAX),
});
export type ThreadTransferGitSummary = z.infer<typeof threadTransferGitSummarySchema>;

export const threadTransferSourceSchema = z.object({
  threadId: z.string().min(1),
  title: z.string().min(1),
  agentKind: agentKindSchema,
  presentationMode: threadPresentationModeSchema,
  blocker: threadTransferBlockerSchema.optional(),
  /** Null when the working directory is not a Git checkout: only the conversation moves. */
  git: threadTransferGitSummarySchema.nullable(),
});
export type ThreadTransferSource = z.infer<typeof threadTransferSourceSchema>;

export const threadTransferPlanProjectSchema = z.object({
  projectId: z.string().min(1),
  name: z.string(),
  /** One of the project's remotes names the same repository as the source. */
  matched: z.boolean(),
  git: z.boolean(),
});
export type ThreadTransferPlanProject = z.infer<typeof threadTransferPlanProjectSchema>;

const threadTransferExportSummarySchema = z.object({
  itemCount: z.number().int().nonnegative(),
  turnCount: z.number().int().nonnegative(),
  attachmentCount: z.number().int().nonnegative(),
  git: z
    .object({
      branch: z.string().min(1).optional(),
      head: gitCommitShaSchema.optional(),
      changedFiles: z.number().int().nonnegative(),
      /** Target commits the source also has; zero with target commits means unrelated history. */
      basisCount: z.number().int().nonnegative(),
      bundleBytes: z.number().int().nonnegative(),
    })
    .nullable(),
});
export type ThreadTransferExportSummary = z.infer<typeof threadTransferExportSummarySchema>;

export const threadTransferResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("describe"), source: threadTransferSourceSchema }),
  z.object({
    kind: z.literal("plan"),
    projects: z.array(threadTransferPlanProjectSchema).max(THREAD_TRANSFER_PLAN_PROJECTS_MAX),
    selectedProjectId: z.string().min(1).optional(),
    haves: z.array(gitCommitShaSchema).max(THREAD_TRANSFER_HAVES_MAX),
  }),
  z.object({
    kind: z.literal("export"),
    transferId: threadTransferIdSchema,
    byteLength: z.number().int().min(1).max(THREAD_TRANSFER_PACKAGE_MAX_BYTES),
    sha256: sha256HexSchema,
    summary: threadTransferExportSummarySchema,
  }),
  z.object({
    kind: z.literal("read"),
    offset: z.number().int().nonnegative(),
    /** Base64 bytes; shorter than requested only at the end of the package. */
    data: z.string().max(THREAD_TRANSFER_CHUNK_BASE64_MAX),
  }),
  z.object({ kind: z.literal("release"), ok: z.literal(true) }),
  z.object({
    kind: z.literal("commit"),
    thread: threadSchema,
    worktreePath: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    /** The source branch name was taken on this host, so `branch` is a new name. */
    branchRenamed: z.boolean(),
    /** An earlier commit of the same transfer already saved this thread. */
    replayed: z.boolean(),
  }),
  z.object({ kind: z.literal("abort"), ok: z.literal(true) }),
]);
export type ThreadTransferResult = z.infer<typeof threadTransferResultSchema>;
export type ThreadTransferResultOf<Kind extends ThreadTransferCommand["kind"]> = Extract<
  ThreadTransferResult,
  { kind: Kind }
>;

/** Decoded upload query (the route's query codecs own the string conversion). */
export const threadTransferUploadQuerySchema = z.object({
  offset: z.number().int().nonnegative(),
  total: z.number().int().min(1).max(THREAD_TRANSFER_PACKAGE_MAX_BYTES),
  sha256: sha256HexSchema,
});
export type ThreadTransferUploadQuery = z.infer<typeof threadTransferUploadQuerySchema>;
export const threadTransferUploadResultSchema = z.object({
  received: z.number().int().nonnegative(),
});

/** Same eligibility as a fork: a settled chat conversation. */
export function canTransferThread(thread: Pick<Thread, "presentationMode" | "status">): boolean {
  return canForkThread(thread);
}

/**
 * Lowercase `host/owner/repo` naming a remote's repository, used only to
 * suggest the matching project on another host. It is a hint the user
 * confirms, never an authority, so SSH spellings count too; credentials in a
 * URL never reach the result.
 */
export function threadTransferRepoIdentity(url: string): string | null {
  const remote = parseForgeRemote(url.trim(), "origin");
  if (!remote) return null;
  return `${remote.host.replace(/^https?:\/\//u, "")}/${remote.path}`.toLowerCase();
}

/**
 * The conversation that moves: every settled item, with the same exclusions a
 * fork applies (goals, pending requests and running work, with their
 * children). Unlike a fork it keeps items after the last completed turn, so a
 * failed last prompt still moves. Null when nothing settled remains.
 */
export function selectThreadTransferSnapshot(
  items: readonly PersistedRuntimeItem[],
  turns: readonly PersistedCompletedTurn[],
): {
  items: PersistedRuntimeItem[];
  turns: PersistedCompletedTurn[];
  throughItemId: string;
} | null {
  const snapshot = settledSnapshotItems(items);
  const throughItemId = snapshot.findLast((item) => !item.parentItemId)?.id;
  if (!throughItemId) return null;
  const kept = new Set(snapshot.map((item) => item.id));
  return {
    items: snapshot,
    turns: turns.filter((turn) => turn.anchorItemId === null || kept.has(turn.anchorItemId)),
    throughItemId,
  };
}

/**
 * Thread settings that keep their meaning on another host. Bindings to this
 * host's runtime environment, transcript files, crew or recorded selection
 * evidence are dropped; tool switches stay, and an id the target does not
 * know is ignored there like any stale override.
 */
export function transferableThreadConfig(config: ThreadConfig): ThreadConfig {
  const {
    executionEnvironment: _executionEnvironment,
    importedFrom: _importedFrom,
    crew: _crew,
    selectionBinding: _selectionBinding,
    ...portable
  } = config;
  return portable;
}
