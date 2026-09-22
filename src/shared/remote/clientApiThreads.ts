import { z } from "zod";
import {
  REMOTE_COMMAND_ID_HEADER,
  REMOTE_PROCEDURE_SPECS,
  REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION,
  isRemoteFollowUpQueueProcedure,
  isRemoteProcedure,
  remoteRuntimeGapAcknowledgeResultSchema,
  remoteRuntimeGapReadResultSchema,
  remoteRuntimeItemsPageSchema,
  remoteThreadSnapshotSchema,
  type RemoteRuntimeGapAcknowledgeResult,
  type RemoteRuntimeGapReadResult,
  type RemoteRuntimeItemsPage,
  type RemoteRuntimeItemsPageRequest,
  type RemoteThreadSnapshot,
} from "@/shared/remote";
import {
  DEFAULT_TERMINAL_SIZE,
  CHECKPOINT_REVERT_COMMAND_ID_PREFIX,
  checkpointRevertPayloadSchema,
  checkpointRevertResultSchema,
  controlThreadGoalPayloadSchema,
  sendThreadInputPayloadSchema,
  type CheckpointRevertResult,
  type ControlThreadGoalPayload,
  type RemoteThreadCommand,
  type ResizeTerminalPayload,
  type SendThreadInputPayload,
  type SetPendingSteerPayload,
  type StartShellPayload,
  type StartThreadResult,
  type ThreadContextUsage,
  type ThreadServerRequestId,
} from "@/shared/contracts";
import { msg } from "@/shared/messages";
import {
  ipcProcedureMap,
  jsonCallEnvelopeSchema,
  omittedCallEnvelopeSchema,
  omittedResultSchema,
} from "@/shared/ipc";
import type { PersistedCompletedTurn, PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { HISTORY_COMPLETED_TURNS_MAX_LIMIT, HISTORY_ITEMS_MAX_LIMIT } from "./historyReadContract";
import {
  isRemoteThreadCatalogCommand,
  type RemoteThreadCatalogCommand,
} from "./protocol/catalogMutations";
import {
  REMOTE_BOUNDED_HISTORY_ITEMS_DEFAULT_LIMIT,
  REMOTE_BOUNDED_MAX_LIMIT,
  REMOTE_BOUNDED_READS_CAPABILITY,
  REMOTE_BOUNDED_THREAD_DEFAULT_LIMIT,
  REMOTE_BOUNDED_TURNS_DEFAULT_LIMIT,
  appendRemoteBoundedReadBudget,
  assertRemoteBoundedCompletedTurnCursor,
  assertRemoteBoundedThreadCursor,
  boundedReadLimit,
  boundedTimelineEntryCount,
  invalidReadsRequest,
  parseBoundedHistoryItemsPage,
  parseBoundedThreadHistoryPage,
  parseBoundedThreadListPage,
  parseBoundedTurnsPage,
  performRemoteBoundedRead,
  type RemoteBoundedHistoryItemsInput,
  type RemoteBoundedHistoryItemsResult,
  type RemoteBoundedThreadHistoryOptions,
  type RemoteBoundedThreadHistoryPage,
  type RemoteBoundedThreadHistoryResult,
  type RemoteBoundedThreadListResult,
  type RemoteBoundedThreadPageOptions,
  type RemoteBoundedTurnsInput,
  type RemoteBoundedTurnsPage,
} from "./clientBoundedReads";
import { RemoteClientHostApi } from "./clientApiHost";
import { RemoteClientError } from "./clientErrors";
import { parseResponse } from "./clientParse";
import {
  LONG_REMOTE_REQUEST_TIMEOUT_MS,
  type StartRemoteNewThreadInput,
  type StartRemoteNewThreadOptions,
  type StartRemoteThreadInput,
  type ThreadHistoryOptions,
} from "./clientTypes";

/** Pre-existing thread-command kinds that keep their historical dispatch. */
type RemoteThreadLegacyCommand = Exclude<
  RemoteThreadCommand,
  Extract<RemoteThreadCommand, { kind: "start" }> | RemoteThreadCatalogCommand
>;

/** R1: bounded completed-turn walk budget. One newest page plus three older
 * `ct1.` pages (2000 turns) — far beyond the newest-500 retention every
 * consumer keeps; a thread with more turns refuses typed instead of serving a
 * partial tail as the full history. */
const COMPLETED_TURNS_WALK_PAGE_LIMIT = HISTORY_COMPLETED_TURNS_MAX_LIMIT;
const COMPLETED_TURNS_WALK_MAX_PAGES = 4;

export abstract class RemoteClientThreadsApi extends RemoteClientHostApi {
  async threadHistory(
    threadId: string,
    options: ThreadHistoryOptions = {},
  ): Promise<RemoteThreadSnapshot> {
    const search = new URLSearchParams({
      runtimePage: "1",
      ...(options.targetTimelineEntryCount !== undefined
        ? { targetTimelineEntryCount: String(options.targetTimelineEntryCount) }
        : {}),
      ...(options.omitScrollback ? { omitScrollback: "1" } : {}),
      // B1: opt-in declaration; never sent unless the client can render the
      // durable notice. An incapable reader on a notice thread is refused 409.
      ...(options.noticesCapable ? { notices: REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION } : {}),
    });
    return remoteThreadSnapshotSchema.parse(
      await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/history?${search}`, {
        ...(options.signal ? { signal: options.signal } : {}),
      }),
    );
  }

  async threadRuntimeItemsPage(
    input: RemoteRuntimeItemsPageRequest,
    options: {
      /** B1: opt-in `notices=v1` declaration (see {@link ThreadHistoryOptions}). */
      readonly noticesCapable?: boolean;
    } = {},
  ): Promise<RemoteRuntimeItemsPage> {
    const search = new URLSearchParams({
      limit: String(input.limit),
      ...(input.beforePosition !== undefined
        ? { beforePosition: String(input.beforePosition) }
        : {}),
      ...(input.targetTimelineEntryCount !== undefined
        ? { targetTimelineEntryCount: String(input.targetTimelineEntryCount) }
        : {}),
      ...(options.noticesCapable ? { notices: REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION } : {}),
    });
    return remoteRuntimeItemsPageSchema.parse(
      await this.requestJson(
        `/api/threads/${encodeURIComponent(input.threadId)}/history/items?${search}`,
      ),
    );
  }

  /**
   * B1 declared-only read: the current unacknowledged durable-gap episode for
   * one thread (the acknowledgement precondition) plus its durable notice when
   * one exists. Only call this when the host advertises
   * `capabilities.runtimeHistoryNotices`; an old host answers 404.
   */
  async runtimeHistoryGap(
    threadId: string,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<RemoteRuntimeGapReadResult> {
    const search = new URLSearchParams({
      notices: REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION,
    });
    return remoteRuntimeGapReadResultSchema.parse(
      await this.requestJson(
        `/api/threads/${encodeURIComponent(threadId)}/runtime/gap?${search}`,
        options.signal !== undefined ? { signal: options.signal } : {},
      ),
    );
  }

  /**
   * B1 declared-only mutation: acknowledge the exact episode token read from
   * {@link runtimeHistoryGap}. `commandId` is the caller's idempotency key —
   * reuse the same id only to retry the same token; a different episode token
   * is a different command. `stale` is a zero-effect terminal outcome carrying
   * the truthful current descriptor; a retry must re-read and re-ack.
   */
  async acknowledgeRuntimeHistoryGap(
    threadId: string,
    input: { readonly episodeToken: string; readonly commandId: string },
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<RemoteRuntimeGapAcknowledgeResult> {
    const search = new URLSearchParams({
      notices: REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION,
    });
    return remoteRuntimeGapAcknowledgeResultSchema.parse(
      await this.requestJson(
        `/api/threads/${encodeURIComponent(threadId)}/runtime/gap/acknowledge?${search}`,
        {
          method: "POST",
          mutation: true,
          headers: { [REMOTE_COMMAND_ID_HEADER]: input.commandId },
          body: { episodeToken: input.episodeToken },
          ...(options.signal !== undefined ? { signal: options.signal } : {}),
        },
      ),
    );
  }

  /**
   * B4 declared read: one bounded thread-list page. `mode=page` continues a
   * paint order (`tp1.`/`tu2.`/`tc2.` cursor); `mode=inventory` walks exact
   * membership (`ti1.` frontier cursor) and ignores `order`. Pass `after` with
   * the bounded page the cursor came from: that asserts this is a continuation,
   * so a response without the `reads` echo is a protocol error rather than a
   * downgrade. The first call of a walk has no cursor/`after` and reports the
   * negotiation verdict.
   */
  async boundedThreadListPage(
    options: RemoteBoundedThreadPageOptions = {},
  ): Promise<RemoteBoundedThreadListResult> {
    const mode = options.mode ?? "page";
    const order = options.order ?? "manual";
    if (options.cursor !== undefined) {
      if (options.after === undefined) {
        throw invalidReadsRequest(
          "A bounded thread-list cursor is a continuation: pass the bounded page it came from as `after`.",
        );
      }
      assertRemoteBoundedThreadCursor(options.cursor, mode, order);
    }
    const search = new URLSearchParams();
    search.set("reads", REMOTE_BOUNDED_READS_CAPABILITY);
    search.set("mode", mode);
    if (mode === "page") {
      search.set("order", order);
      search.set("summaries", options.summaries === true ? "1" : "0");
    }
    search.set(
      "limit",
      String(
        boundedReadLimit(
          options.limit,
          REMOTE_BOUNDED_THREAD_DEFAULT_LIMIT,
          REMOTE_BOUNDED_MAX_LIMIT,
          "limit",
        ),
      ),
    );
    if (options.cursor !== undefined) search.set("cursor", options.cursor);
    appendRemoteBoundedReadBudget(search, options);
    return performRemoteBoundedRead({
      what: "thread list page",
      declaredOnly: false,
      send: () =>
        this.requestJson(
          `/api/threads?${search.toString()}`,
          options.signal !== undefined ? { signal: options.signal } : {},
        ),
      parse: (body) =>
        parseBoundedThreadListPage(body, {
          mode,
          order,
          cursorProvided: options.cursor !== undefined,
          strict: options.after !== undefined,
        }),
    });
  }

  /**
   * B4 declared read: the newest bounded history tail (runtime items + newest
   * `completedTurnsLimit` completed turns) plus `completedTurnsNextCursor` for
   * the `ct1.` older-turn walk. An absent `reads` echo means a genuine older
   * host and is reported as the legacy negotiation result.
   */
  async boundedThreadHistory(
    threadId: string,
    options: RemoteBoundedThreadHistoryOptions = {},
  ): Promise<RemoteBoundedThreadHistoryResult> {
    const search = new URLSearchParams();
    search.set("reads", REMOTE_BOUNDED_READS_CAPABILITY);
    search.set("runtimePage", "1");
    search.set(
      "completedTurnsLimit",
      String(
        boundedReadLimit(
          options.completedTurnsLimit,
          REMOTE_BOUNDED_TURNS_DEFAULT_LIMIT,
          HISTORY_COMPLETED_TURNS_MAX_LIMIT,
          "completedTurnsLimit",
        ),
      ),
    );
    const timelineEntryCount = boundedTimelineEntryCount(options.targetTimelineEntryCount);
    if (timelineEntryCount !== undefined) {
      search.set("targetTimelineEntryCount", String(timelineEntryCount));
    }
    if (options.omitScrollback) search.set("omitScrollback", "1");
    if (options.noticesCapable) {
      search.set("notices", REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION);
    }
    appendRemoteBoundedReadBudget(search, options);
    return performRemoteBoundedRead({
      what: "thread history",
      declaredOnly: false,
      send: () =>
        this.requestJson(
          `/api/threads/${encodeURIComponent(threadId)}/history?${search.toString()}`,
          options.signal !== undefined ? { signal: options.signal } : {},
        ),
      parse: parseBoundedThreadHistoryPage,
    });
  }

  /**
   * B4 declared read: one older runtime-items page. `beforePosition` is a
   * continuation of the bounded history `runtimeNextCursor`, so it requires
   * the bounded page proof; a first page reports the negotiation verdict.
   */
  async boundedThreadHistoryItems(
    input: RemoteBoundedHistoryItemsInput,
  ): Promise<RemoteBoundedHistoryItemsResult> {
    if (input.beforePosition !== undefined && input.after === undefined) {
      throw invalidReadsRequest(
        "A bounded history-items beforePosition is a continuation: pass the bounded page it came from as `after`.",
      );
    }
    const search = new URLSearchParams();
    search.set("reads", REMOTE_BOUNDED_READS_CAPABILITY);
    search.set(
      "limit",
      String(
        boundedReadLimit(
          input.limit,
          REMOTE_BOUNDED_HISTORY_ITEMS_DEFAULT_LIMIT,
          HISTORY_ITEMS_MAX_LIMIT,
          "limit",
        ),
      ),
    );
    if (input.beforePosition !== undefined) {
      search.set("beforePosition", String(input.beforePosition));
    }
    const timelineEntryCount = boundedTimelineEntryCount(input.targetTimelineEntryCount);
    if (timelineEntryCount !== undefined) {
      search.set("targetTimelineEntryCount", String(timelineEntryCount));
    }
    if (input.noticesCapable) {
      search.set("notices", REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION);
    }
    appendRemoteBoundedReadBudget(search, input);
    return performRemoteBoundedRead({
      what: "thread history items page",
      declaredOnly: false,
      send: () =>
        this.requestJson(
          `/api/threads/${encodeURIComponent(input.threadId)}/history/items?${search.toString()}`,
          input.signal !== undefined ? { signal: input.signal } : {},
        ),
      parse: (body) => parseBoundedHistoryItemsPage(body, input.after !== undefined),
    });
  }

  /**
   * B4 declared read: older completed turns (`ct1.` exclusive bound). The route
   * exists only on declared hosts, so a missing route or absent echo is a
   * protocol error, never a downgrade. Without a cursor it returns the newest
   * page; pass `completedTurnsNextCursor` from a bounded page to continue.
   */
  async boundedThreadTurns(input: RemoteBoundedTurnsInput): Promise<RemoteBoundedTurnsPage> {
    if (input.cursor !== undefined) assertRemoteBoundedCompletedTurnCursor(input.cursor);
    const search = new URLSearchParams();
    search.set("reads", REMOTE_BOUNDED_READS_CAPABILITY);
    search.set(
      "limit",
      String(
        boundedReadLimit(
          input.limit,
          REMOTE_BOUNDED_TURNS_DEFAULT_LIMIT,
          HISTORY_COMPLETED_TURNS_MAX_LIMIT,
          "limit",
        ),
      ),
    );
    if (input.cursor !== undefined) search.set("cursor", input.cursor);
    if (input.noticesCapable) {
      search.set("notices", REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION);
    }
    appendRemoteBoundedReadBudget(search, input);
    return performRemoteBoundedRead({
      what: "completed turns page",
      declaredOnly: true,
      send: () =>
        this.requestJson(
          `/api/threads/${encodeURIComponent(input.threadId)}/turns?${search.toString()}`,
          input.signal !== undefined ? { signal: input.signal } : {},
        ),
      parse: parseBoundedTurnsPage,
    });
  }

  /** R1: one bounded thread-history page for the derived goal/usage reads. */
  private async boundedHistoryDerivedPage(
    threadId: string,
  ): Promise<RemoteBoundedThreadHistoryPage | RemoteThreadSnapshot> {
    const result = await this.boundedThreadHistory(threadId, {
      completedTurnsLimit: 1,
      omitScrollback: true,
    });
    return result.page;
  }

  /**
   * R1: the latest goal item, read from the bounded thread-history tail. The
   * host prepends the latest goal even when it sits outside the returned
   * window (bounded and legacy snapshot shapes alike), so a fulfilled read is
   * complete by contract — never a tail that silently omits the goal.
   */
  async latestThreadGoalItem(threadId: string): Promise<PersistedRuntimeItem | null> {
    const page = await this.boundedHistoryDerivedPage(threadId);
    return page.runtimeItems.findLast((item) => item.type === "goal") ?? null;
  }

  /** R1: the thread's context usage from the bounded thread-history page. */
  async threadContextUsage(threadId: string): Promise<ThreadContextUsage | null> {
    const page = await this.boundedHistoryDerivedPage(threadId);
    return page.contextUsage;
  }

  /**
   * R1: completed turns, walked to exhaustion over the bounded `ct1.` cursor
   * in the local read's ascending order. A legacy (pre-bounded) host returns
   * the full array in one page, so its absent cursor means complete. A bounded
   * walk that would exceed the page budget refuses typed — the caller must
   * never receive a partial tail that masquerades as the full history.
   */
  async threadCompletedTurns(threadId: string): Promise<PersistedCompletedTurn[]> {
    const first = await this.boundedThreadHistory(threadId, {
      completedTurnsLimit: COMPLETED_TURNS_WALK_PAGE_LIMIT,
      omitScrollback: true,
    });
    const pages: PersistedCompletedTurn[][] = [[...first.page.completedTurns]];
    let cursor = first.negotiation === "bounded" ? first.page.completedTurnsNextCursor : null;
    while (cursor !== null) {
      if (pages.length >= COMPLETED_TURNS_WALK_MAX_PAGES) {
        throw new RemoteClientError(
          `Thread "${threadId}" has more completed turns than the bounded read budget ` +
            `(${COMPLETED_TURNS_WALK_MAX_PAGES * COMPLETED_TURNS_WALK_PAGE_LIMIT}); ` +
            "refusing to return a partial history as complete.",
          500,
          "completed_turns_budget_exhausted",
        );
      }
      const page = await this.boundedThreadTurns({
        threadId,
        cursor,
        limit: COMPLETED_TURNS_WALK_PAGE_LIMIT,
      });
      pages.push(page.turns);
      cursor = page.completedTurnsNextCursor;
    }
    return pages.reverse().flat();
  }

  async startThread(input: StartRemoteThreadInput): Promise<StartThreadResult> {
    const result = await this.requestJson("/api/threads/start", {
      method: "POST",
      mutation: true,
      headers: {
        // Never reuse a send-path userMessageItemId: receipts reject the same
        // command id across routes, and a failed /send must still be able to
        // fall back to /start for unknown-session resume. Without an optimistic
        // item id the start is a fresh attempt and mints a fresh command id —
        // a per-thread stable id would replay a stale completion (or conflict)
        // when the same thread is resumed or switched again later.
        [REMOTE_COMMAND_ID_HEADER]: input.userMessageItemId
          ? `thread-start-item:${input.userMessageItemId}`
          : crypto.randomUUID(),
      },
      body: {
        ...(input.threadId ? { threadId: input.threadId } : {}),
        projectLocation: input.projectLocation,
        agentKind: input.agentKind,
        ...(input.agentInstanceId ? { agentInstanceId: input.agentInstanceId } : {}),
        config: input.config,
        prompt: input.prompt,
        ...(input.segments && input.segments.length > 0 ? { segments: input.segments } : {}),
        initialSize: input.initialSize ?? DEFAULT_TERMINAL_SIZE,
        ...(input.sessionRef ? { sessionRef: input.sessionRef } : {}),
        ...(input.presentationMode ? { presentationMode: input.presentationMode } : {}),
        ...(input.userMessageItemId ? { userMessageItemId: input.userMessageItemId } : {}),
        ...(input.providerSwitch ? { providerSwitch: input.providerSwitch } : {}),
        ...(input.ensureRunning ? { ensureRunning: true } : {}),
      },
    });
    return parseResponse(z.object({ threadId: z.string() }), result, "thread");
  }

  /**
   * Create and launch a thread on the paired host. The host persists the full
   * semantically applicable creation metadata (title, group, parent lineage,
   * PR, worktree, config, workspace) and launches the supervisor at
   * `initialSize`. `workspaceId`, `initialSize`, `parentThreadId` and
   * `prNumber` are only applied by a host advertising
   * `capabilities.threadLaunchMetadata` v1; gate sending them on that (an
   * older host silently strips the unknown keys).
   *
   * Supplying `options.commandId` (with an explicit `input.threadId`) retains
   * one launch operation across a retry: the same id and body replay the
   * recorded outcome, an interrupted attempt stays uncertain, and a changed
   * body or target conflicts. Omitting the option keeps the historical
   * per-thread identity for unrelated callers.
   */
  async startNewThread(
    input: StartRemoteNewThreadInput,
    options: StartRemoteNewThreadOptions = {},
  ): Promise<StartThreadResult> {
    if (options.commandId !== undefined && input.threadId === undefined) {
      throw new Error(
        "startNewThread cannot retain one launch operation by commandId without an explicit threadId; " +
          "a random per-call thread id would address a different thread on retry.",
      );
    }
    const threadId = input.threadId ?? crypto.randomUUID();
    await this.sendThreadCommand(
      {
        kind: "start",
        threadId,
        projectId: input.projectId,
        agentKind: input.agentKind,
        ...(input.agentInstanceId ? { agentInstanceId: input.agentInstanceId } : {}),
        config: input.config,
        prompt: input.prompt,
        ...(input.segments && input.segments.length > 0 ? { segments: [...input.segments] } : {}),
        ...(input.presentationMode ? { presentationMode: input.presentationMode } : {}),
        ...(input.userMessageItemId ? { userMessageItemId: input.userMessageItemId } : {}),
        ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
        ...(input.worktreeBranch ? { worktreeBranch: input.worktreeBranch } : {}),
        ...(input.isNewWorktree ? { isNewWorktree: true } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.groupId ? { groupId: input.groupId } : {}),
        ...(input.groupName ? { groupName: input.groupName } : {}),
        ...(input.parentThreadId ? { parentThreadId: input.parentThreadId } : {}),
        ...(input.prNumber !== undefined ? { prNumber: input.prNumber } : {}),
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.initialSize ? { initialSize: input.initialSize } : {}),
      },
      options.commandId !== undefined ? { commandId: options.commandId } : undefined,
    );
    return { threadId };
  }

  async sendThreadInput(input: SendThreadInputPayload): Promise<void> {
    const parsed = sendThreadInputPayloadSchema.parse(input);
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/send`, {
      method: "POST",
      mutation: true,
      headers: {
        [REMOTE_COMMAND_ID_HEADER]: parsed.userMessageItemId ?? crypto.randomUUID(),
      },
      body: {
        prompt: parsed.prompt,
        config: parsed.config,
        ...(parsed.segments ? { segments: parsed.segments } : {}),
        ...(parsed.userMessageItemId ? { userMessageItemId: parsed.userMessageItemId } : {}),
      },
    });
  }

  async interruptThread(threadId: string): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/interrupt`, {
      method: "POST",
    });
  }

  async controlThreadGoal(input: ControlThreadGoalPayload): Promise<void> {
    const { threadId, ...body } = controlThreadGoalPayloadSchema.parse(input);
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/goal`, {
      method: "POST",
      body,
    });
  }

  async closeThread(threadId: string): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/close`, {
      method: "POST",
    });
  }

  async truncateThreadRuntimeAfter(input: {
    readonly threadId: string;
    readonly itemId: string;
  }): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/runtime/truncate`, {
      method: "POST",
      body: { itemId: input.itemId },
    });
  }

  /** WS2 stage 4: the backend-owned compound checkpoint revert. */
  async checkpointRevert(input: {
    readonly threadId: string;
    readonly checkpointItemId: string;
    readonly operationKey: string;
  }): Promise<CheckpointRevertResult> {
    const parsed = checkpointRevertPayloadSchema.parse(input);
    return checkpointRevertResultSchema.parse(
      await this.requestJson(
        `/api/threads/${encodeURIComponent(parsed.threadId)}/checkpoint-revert`,
        {
          method: "POST",
          mutation: true,
          headers: {
            [REMOTE_COMMAND_ID_HEADER]: `${CHECKPOINT_REVERT_COMMAND_ID_PREFIX}${parsed.operationKey}`,
          },
          body: {
            checkpointItemId: parsed.checkpointItemId,
            operationKey: parsed.operationKey,
          },
        },
      ),
    );
  }

  async setPendingSteer(input: SetPendingSteerPayload): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/steer/set`, {
      method: "POST",
      body: {
        prompt: input.prompt,
        ...(input.segments ? { segments: input.segments } : {}),
        config: input.config,
      },
    });
  }

  async clearPendingSteer(threadId: string): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/steer/clear`, {
      method: "POST",
    });
  }

  /**
   * Thread-metadata mutation (rename, done, pin, archive, delete) plus the
   * narrow catalog mutations (`reorder`, `set-workspace`). `start` keeps its
   * stable automatic receipt identity; a catalog mutation REQUIRES the
   * caller's explicit per-operation `commandId` (the host refuses one without
   * it before any effect), so a lost response is retried exactly once —
   * identical body and command id replay the recorded result. Mint the id per
   * user action; reuse it only for a retry of that same action.
   */
  async sendThreadCommand(
    command: Extract<RemoteThreadCommand, { kind: "start" }>,
    options?: { readonly commandId?: string },
  ): Promise<void>;
  async sendThreadCommand(
    command: RemoteThreadCatalogCommand,
    options: { readonly commandId: string },
  ): Promise<void>;
  async sendThreadCommand(
    command: RemoteThreadLegacyCommand,
    options?: { readonly commandId?: string },
  ): Promise<void>;
  async sendThreadCommand(
    command: RemoteThreadCommand,
    options: { readonly commandId?: string } = {},
  ): Promise<void> {
    const { threadId, ...body } = command;
    if (isRemoteThreadCatalogCommand(command) && options.commandId === undefined) {
      throw new Error(
        "Catalog thread commands require an explicit per-operation commandId so a retry is replayed instead of re-applied.",
      );
    }
    const commandId =
      options.commandId ?? (command.kind === "start" ? `thread-start:${threadId}` : undefined);
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/command`, {
      method: "POST",
      ...(commandId !== undefined
        ? {
            mutation: true,
            headers: { [REMOTE_COMMAND_ID_HEADER]: commandId },
          }
        : {}),
      body,
    });
  }

  async writeTerminal(input: { readonly threadId: string; readonly data: string }): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/terminal/write`, {
      method: "POST",
      body: { data: input.data },
    });
  }

  async resizeTerminal(input: ResizeTerminalPayload): Promise<void> {
    const { threadId, ...body } = input;
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/terminal/resize`, {
      method: "POST",
      body,
    });
  }

  /** Spawns a dev shell (the id is `shellId`, not scoped to a thread). */
  async startShell(input: StartShellPayload): Promise<void> {
    await this.requestJson(`/api/terminal/start`, { method: "POST", body: input });
  }

  /** Tears down a terminal PTY (CLI thread or dev shell) by id. */
  async closeShell(input: { readonly threadId: string }): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/terminal/close`, {
      method: "POST",
      body: {},
    });
  }

  async resolveRequest(input: {
    readonly threadId: string;
    readonly requestId: ThreadServerRequestId;
    readonly method: string;
    readonly response: unknown;
  }): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/requests/resolve`, {
      method: "POST",
      body: {
        requestId: input.requestId,
        method: input.method,
        response: input.response,
      },
    });
  }

  /**
   * Generic supervisor passthrough to the paired desktop. The reused desktop
   * project controls call bridge methods, which
   * the remote bridge shim forwards here (see bridge.ts). `procedure` is one of
   * the allowlisted names in REMOTE_PROCEDURE_SPECS; the server validates
   * it.
   */
  async callRemoteProcedure(procedure: string, payload: unknown): Promise<unknown> {
    try {
      if (!isRemoteProcedure(procedure)) {
        throw new RemoteClientError(
          `Procedure "${procedure}" is not available to remote clients.`,
          403,
          "git_procedure_not_allowed",
        );
      }
      const spec = REMOTE_PROCEDURE_SPECS[procedure];
      // `startThread` is delivered through the generic passthrough on the
      // managed-loopback and browser legs; the host wraps that one procedure in
      // the same crash-aware receipt as its dedicated route. Carry the same
      // stable command identity so a lost response can be reported as an
      // uncertain outcome instead of a blind repeat.
      const receiptGuardedStart = procedure === "startThread";
      const commandId = receiptGuardedStart ? remoteStartThreadCommandId(payload) : undefined;
      const envelope = await this.requestJson("/api/git/call", {
        method: "POST",
        ...(receiptGuardedStart ? { mutation: true } : {}),
        ...(commandId !== undefined ? { headers: { [REMOTE_COMMAND_ID_HEADER]: commandId } } : {}),
        body: { procedure, payload },
        ...("timeout" in spec && spec.timeout === "long"
          ? { timeoutMs: LONG_REMOTE_REQUEST_TIMEOUT_MS }
          : {}),
      });
      const resultSchema = ipcProcedureMap[procedure].resultSchema;
      if (!resultSchema) {
        throw new RemoteClientError(
          `Procedure "${procedure}" is missing an authoritative result schema.`,
          500,
          "git_procedure_result_schema_missing",
        );
      }
      if (resultSchema === omittedResultSchema) {
        parseResponse(omittedCallEnvelopeSchema, envelope, `procedure ${procedure}`);
        return undefined;
      }
      return parseResponse(jsonCallEnvelopeSchema(resultSchema), envelope, `procedure ${procedure}`)
        .result;
    } catch (error) {
      // A host from before
      // queued follow-ups knows the passthrough endpoint but rejects these new
      // procedure names; turn that capability miss into a stable, actionable
      // error. Never retry through setPendingSteer: queue and steer have
      // intentionally different semantics.
      if (
        isRemoteFollowUpQueueProcedure(procedure) &&
        error instanceof RemoteClientError &&
        ((error.status === 403 && error.code === "git_procedure_not_allowed") ||
          (error.status === 404 && error.code === "not_found"))
      ) {
        throw new RemoteClientError(
          msg("supervisor.followUpQueue.unsupported"),
          501,
          "follow_up_queue_unsupported",
          { cause: error },
        );
      }
      throw error;
    }
  }
}

/**
 * Idempotency identity for a thread start delivered through the generic
 * procedure passthrough (`/api/git/call`). It mirrors
 * {@link RemoteClientThreadsApi.startThread}'s dedicated-route derivation so
 * the host receipt binds the same stable identity on either transport: the
 * optimistic user-message item is unique per prompt attempt, and every other
 * launch is a fresh attempt that mints a fresh id. The host validates the
 * value against its command-id grammar.
 *
 * A per-thread fallback is deliberately NOT used: a repeat reopen or a second
 * provider switch of the same thread carries a different payload, and a stable
 * id would either replay the first attempt's frozen result (silently skipping
 * the new start) or conflict on the changed digest.
 */
export function remoteStartThreadCommandId(payload: unknown): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const input = payload as {
      readonly userMessageItemId?: unknown;
      readonly threadId?: unknown;
    };
    if (typeof input.userMessageItemId === "string" && input.userMessageItemId.length > 0) {
      return `thread-start-item:${input.userMessageItemId}`;
    }
  }
  return crypto.randomUUID();
}
