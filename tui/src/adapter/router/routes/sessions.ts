import { logAdapterDebug, logAdapterError } from "../../diagnostics";
import { openCodeEvent } from "../../events";
import { historyMessagePage, historyMessages } from "../../history";
import { itemId, parseSubSessionId, sessionId, threadId } from "../../ids";
import { json, record } from "../helpers";
import { isThreadTurnActive } from "@/shared/contracts";
import { hostSupportsCatalogMutations } from "@/shared/remote/protocol/catalogMutations";
import { canForkThread } from "@/shared/threadFork";
import type {
  ExperimentalPersistentPtyListOutput,
  SessionActiveOutput,
  SessionCreateOutput,
  SessionGetOutput,
  SessionInfo,
  SessionListOutput,
} from "@opencode/client";
import type { RouteArgs } from "../context";

/** Session lifecycle routes: list, create, selection, messages, wait, move. */
export async function handleSessionRoutes({
  ctx,
  url,
  method,
  path,
  readBody,
  inputSummary,
}: RouteArgs): Promise<Response | undefined> {
  const {
    input,
    sessions,
    states,
    threadCache,
    createdWorktrees,
    seedInbox,
    seedBackgroundTasks,
    seedGoal,
    reconcileCheckpoints,
    subscribeSubagent,
    generateTitle,
    firstPromptText,
    renameThreadTo,
    resolveProject,
    directoryOf,
    toSession,
    sessionOptions,
    setSessionOptions,
    exportSession,
    listThreadItems,
    isSubAgentItem,
    presentationOf,
    isGuiThread,
    guiThreads,
    statusListNow,
    isHiddenThread,
    visibleThread,
    isLiveSubSession,
    toSubSession,
    threadListPage,
    listThreads,
    encodeThreadCursor,
    decodeThreadCursor,
  } = ctx;

  if (path === "/api/session" && method === "GET") {
    const current = await resolveProject();
    const continuation = decodeThreadCursor(url.searchParams.get("cursor"));
    const page = await threadListPage(continuation);
    const statusList = await statusListNow();
    const data = page.threads
      .filter(
        (value) =>
          isGuiThread(value, statusList) && value.projectId === current.id && !value.archived,
      )
      .map((value) => toSession(value, current));
    if (ctx.debug)
      void logAdapterDebug(input.bootstrap.home, {
        source: "session.list",
        projectIdLength: current.id.length,
        sessionCount: data.length,
      });
    const output: SessionListOutput = {
      data,
      cursor: {
        previous: null,
        next: page.next ? encodeThreadCursor(page.next) : null,
      },
    };
    return json(output);
  }
  if (path === "/api/session" && method === "POST") {
    const body = await readBody();
    const current = await resolveProject();
    const id = String(body.id ?? sessionId(crypto.randomUUID()));
    const model = record(body.model);
    const agentID = typeof body.agent === "string" ? body.agent : "build";
    const providerID = String(model.providerID ?? "");
    const modelID = String(model.id ?? "");
    const effort = typeof model.variant === "string" ? model.variant : undefined;
    const approvalPolicy =
      typeof body.approvalPolicy === "string" ? body.approvalPolicy : undefined;
    const sandboxMode = typeof body.sandboxMode === "string" ? body.sandboxMode : undefined;
    const remoteThreadID = threadId(id);
    if (providerID) ctx.activeProviderID = providerID;
    // A session created inside a listed worktree starts its thread there —
    // the host runs prepare-worktree setup via the worktree fields.
    const requestedDirectory = String(record(body.location).directory ?? "");
    let worktreePath: string | undefined;
    let worktreeBranch: string | undefined;
    if (requestedDirectory && requestedDirectory !== directoryOf(current.location)) {
      const listed = record(
        await input.client.callRemoteProcedure("gitListWorktrees", {
          projectLocation: current.location,
        }),
      );
      const match = (Array.isArray(listed.worktrees) ? listed.worktrees : [])
        .map((entry) => record(entry))
        .find((entry) => String(entry.path ?? "") === requestedDirectory);
      if (match) {
        worktreePath = requestedDirectory;
        worktreeBranch = String(match.branch ?? "") || undefined;
      }
    }
    const createdAt = Date.now();
    sessions.set(id, {
      threadId: remoteThreadID,
      projectId: current.id,
      agentID,
      ...(providerID ? { providerID } : {}),
      ...(modelID ? { model: modelID } : {}),
      ...(effort ? { effort } : {}),
      ...(approvalPolicy ? { approvalPolicy } : {}),
      ...(sandboxMode ? { sandboxMode } : {}),
      ...(worktreePath ? { worktreePath } : {}),
      ...(worktreeBranch ? { worktreeBranch } : {}),
      createdAt,
      remoteStarted: false,
    });
    if (providerID && modelID) {
      input.registerThreadContext(remoteThreadID, {
        agent: agentID,
        providerID,
        model: modelID,
        location: { directory: worktreePath ?? directoryOf(current.location) },
      });
    }
    const output = {
      id,
      projectID: current.id,
      agent: agentID,
      ...(providerID && modelID
        ? { model: { id: modelID, providerID, ...(effort ? { variant: effort } : {}) } }
        : {}),
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: createdAt, updated: createdAt },
      location: { directory: worktreePath ?? input.bootstrap.directory },
    } satisfies SessionCreateOutput;
    return json({ data: output });
  }
  if (path === "/api/session/active" && method === "GET") {
    const output: SessionActiveOutput = {};
    return json(output);
  }
  const exportMatch = path.match(/^\/api\/experimental\/session\/([^/]+)\/export$/u);
  if (exportMatch && method === "GET") {
    const id = decodeURIComponent(exportMatch[1]!);
    const remoteThread = (await guiThreads()).find((value) => value.id === threadId(id));
    if (!remoteThread) return json({ error: "Unknown session" }, 404);
    return json({ data: await exportSession(id, remoteThread) });
  }
  const sessionOptionsMatch = path.match(/^\/api\/session\/([^/]+)\/options$/u);
  if (sessionOptionsMatch) {
    const id = decodeURIComponent(sessionOptionsMatch[1]!);
    if (method === "GET") return json({ data: await sessionOptions(id) });
    if (method === "POST") {
      const body = await readBody();
      const result = await setSessionOptions(id, {
        approvalPolicy: typeof body.approvalPolicy === "string" ? body.approvalPolicy : undefined,
        sandboxMode: typeof body.sandboxMode === "string" ? body.sandboxMode : undefined,
        ...(typeof body.fast === "boolean" ? { fast: body.fast } : {}),
        ...(typeof body.thinking === "boolean" ? { thinking: body.thinking } : {}),
        contextSize: typeof body.contextSize === "string" ? body.contextSize : undefined,
      });
      if ("error" in result) return json({ error: result.error }, result.status);
      return json({ data: true });
    }
  }
  const sessionUpdateMatch = path.match(/^\/api\/session\/([^/]+)$/u);
  if (sessionUpdateMatch && method === "DELETE") {
    const deleteSession = decodeURIComponent(sessionUpdateMatch[1]!);
    if (await isLiveSubSession(deleteSession)) {
      return json(
        {
          error: {
            code: "read_only",
            message: "Subagent transcripts are read-only.",
          },
        },
        400,
      );
    }
    const remoteThread = await visibleThread(threadId(deleteSession));
    if (!remoteThread)
      return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    await input.client.sendThreadCommand({ kind: "delete", threadId: remoteThread.id });
    return new Response(null, { status: 204 });
  }
  const viewMatch = path.match(/^\/api\/session\/([^/]+)\/view$/u);
  if (viewMatch && (method === "POST" || method === "PUT")) {
    ctx.currentSession = decodeURIComponent(viewMatch[1]!);
    // session.view: the host only clears a finished marker. Fall back to
    // the cached status so a thread that finished before this TUI
    // connected still clears.
    const viewSession = decodeURIComponent(viewMatch[1]!);
    if (!(await isLiveSubSession(viewSession))) {
      const remoteThread = await visibleThread(threadId(viewSession));
      if (remoteThread && (states.get(remoteThread.id) ?? remoteThread.status) === "finished") {
        await input.client.sendThreadCommand({
          kind: "acknowledge",
          threadId: remoteThread.id,
        });
      }
    }
    return new Response(null, { status: 204 });
  }
  const forkMatch = path.match(/^\/api\/session\/([^/]+)\/fork$/u);
  if (forkMatch && method === "POST") {
    const forkSession = decodeURIComponent(forkMatch[1]!);
    if (await isLiveSubSession(forkSession)) {
      return json(
        {
          error: {
            code: "read_only",
            message: "Subagent transcripts are read-only; fork the parent session instead.",
          },
        },
        400,
      );
    }
    const source = await visibleThread(threadId(forkSession));
    if (!source) return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    // `fork` is a catalog command: the host must have advertised
    // capabilities.catalogMutations v1, otherwise it cannot persist the
    // intent truthfully.
    const descriptor =
      typeof input.client.environment === "function" ? await input.client.environment() : undefined;
    if (!hostSupportsCatalogMutations(descriptor?.capabilities?.catalogMutations))
      return json(
        {
          error: {
            code: "unsupported",
            message: "This Poracode host is too old to fork threads.",
          },
        },
        501,
      );
    const liveStatus = states.get(source.id) ?? source.status;
    const sourcePresentation = presentationOf(source, await statusListNow());
    if (!canForkThread({ presentationMode: sourcePresentation, status: liveStatus }))
      return json(
        {
          error: {
            code: "busy",
            message: "Wait for the current turn to finish before forking.",
          },
        },
        409,
      );
    const body = await readBody();
    let throughItemId: string | undefined;
    if (typeof body.before === "string" && body.before.length > 0) {
      // The host only accepts completed-turn anchors; map the OpenCode
      // message id to its user_message item and pick the last turn that
      // ended before it in the thread's item order.
      const userItemId = itemId(body.before);
      const [items, turns] = await Promise.all([
        listThreadItems(source.id),
        input.client.threadCompletedTurns(source.id),
      ]);
      const positions = new Map(items.map((item, index) => [item.id, index] as const));
      const userIndex = positions.get(userItemId) ?? -1;
      const anchor = turns.findLast((turn) => {
        if (turn.anchorItemId === null) return false;
        const position = positions.get(turn.anchorItemId);
        return position !== undefined && position < userIndex;
      })?.anchorItemId;
      if (!anchor)
        return json(
          {
            error: {
              code: "invalid_request",
              message: "Nothing to fork before the first message.",
            },
          },
          400,
        );
      throughItemId = anchor;
    }
    const forkedId = crypto.randomUUID();
    try {
      await input.client.sendThreadCommand(
        {
          kind: "fork",
          threadId: forkedId,
          sourceThreadId: source.id,
          ...(throughItemId ? { throughItemId } : {}),
          title: `${source.title} (fork)`,
        },
        { commandId: crypto.randomUUID() },
      );
    } catch (error) {
      return json(
        {
          error: {
            code: "invalid_request",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        400,
      );
    }
    const forked = (await listThreads()).find((value) => value.id === forkedId);
    if (!forked)
      return json({ error: { code: "not_found", message: "Forked session not found" } }, 404);
    return json({ data: toSession(forked, await resolveProject()) });
  }
  const sessionNoopMatch = path.match(/^\/api\/session\/([^/]+)\/(background|environment)$/u);
  if (sessionNoopMatch && (method === "POST" || method === "PUT")) {
    // Threads keep running on the host; there is no per-session
    // environment to set.
    return new Response(null, { status: 204 });
  }
  if (sessionUpdateMatch && (method === "PATCH" || method === "PUT")) {
    const body = await readBody();
    const remoteThreadID = threadId(decodeURIComponent(sessionUpdateMatch[1]!));
    if (await isHiddenThread(remoteThreadID))
      return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    // Rename and archive/unarchive map to catalog thread-metadata commands.
    if (typeof body.title === "string" && body.title.trim().length > 0)
      await input.client.sendThreadCommand({
        kind: "rename",
        threadId: remoteThreadID,
        title: body.title.trim(),
      });
    if (body.title === "") {
      // Vendored /rename with no input asks for a generated title.
      const remoteThread = await visibleThread(remoteThreadID);
      const currentProject = await resolveProject();
      if (remoteThread) {
        try {
          const generated = await generateTitle(
            remoteThread,
            await firstPromptText(remoteThreadID),
            currentProject,
          );
          await renameThreadTo(remoteThreadID, generated);
        } catch (error) {
          return json(
            {
              error: {
                code: "invalid_request",
                message: error instanceof Error ? error.message : String(error),
              },
            },
            400,
          );
        }
      }
    }
    if (typeof body.archived === "boolean")
      await input.client.sendThreadCommand({
        kind: body.archived ? "archive" : "unarchive",
        threadId: remoteThreadID,
      });
    // session.update declares 204 + empty (SessionUpdateOutput is void).
    return new Response(null, { status: 204 });
  }
  const terminalMatch = path.match(/^\/api\/experimental\/session\/([^/]+)\/terminal$/u);
  if (terminalMatch && method === "GET") {
    const output: ExperimentalPersistentPtyListOutput = [];
    return json({ data: output });
  }
  const messageGetMatch = path.match(/^\/api\/session\/([^/]+)\/message\/([^/]+)$/u);
  if (messageGetMatch && method === "GET") {
    const id = decodeURIComponent(messageGetMatch[1]!);
    const remoteThread = (await guiThreads()).find((value) => value.id === threadId(id));
    if (!remoteThread)
      return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    const items = await listThreadItems(remoteThread.id);
    const message = historyMessages(remoteThread, items).find(
      (value) => value.id === decodeURIComponent(messageGetMatch[2]!),
    );
    return message
      ? json({ data: message })
      : json({ error: { code: "not_found", message: "Message not found" } }, 404);
  }
  const messageMatch = path.match(/^\/api\/session\/([^/]+)\/message$/u);
  if (messageMatch && method === "GET") {
    const id = decodeURIComponent(messageMatch[1]!);
    const remoteThreads = await guiThreads();
    const remoteThread = remoteThreads.find((value) => value.id === threadId(id));
    if (!remoteThread) {
      // A real thread wins; the virtual parse only applies when no thread
      // matches the decoded id.
      const subSession = parseSubSessionId(id);
      const parent = subSession
        ? remoteThreads.find((value) => value.id === subSession.threadId)
        : undefined;
      if (!parent) return json({ data: [], cursor: { previous: null, next: null } });
      await input.setThreadInterests([parent.id]);
      const parentItems = await listThreadItems(parent.id);
      // A still-running subagent buffers its child events on the host
      // unless a client subscribes — subscribe once while this virtual
      // session is loaded.
      const task = parentItems.find((value) => value.id === subSession?.itemId);
      if (task && task.state !== "completed") subscribeSubagent(parent.id, subSession!.itemId);
      const items = parentItems.filter((value) => value.parentItemId === subSession?.itemId);
      return json({
        data: historyMessages(parent, items),
        cursor: { previous: null, next: null },
      });
    }
    await input.setThreadInterests([threadId(id)]);
    await Promise.all([
      seedInbox(remoteThread.id),
      seedGoal(remoteThread.id),
      seedBackgroundTasks(remoteThread.id),
    ]);
    // Turns completed while the TUI was closed still need their anchors
    // finalized before checkpointRevert can restore them.
    void reconcileCheckpoints(remoteThread.id);
    // The bounded history page carries the persisted context-window
    // occupancy — emit it once on session load so the dock has a value
    // before the next live context.updated.
    const contextUsage = await input.client
      .threadContextUsage?.(remoteThread.id)
      ?.catch(() => null);
    if (contextUsage?.usedTokens) {
      input.events.emit(
        openCodeEvent(
          "session.usage.updated",
          {
            sessionID: id,
            cost: 0,
            tokens: {
              input: contextUsage.usedTokens,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
          { location: { directory: input.bootstrap.directory } },
        ),
      );
    }
    ctx.activeProviderID = remoteThread.agentKind;
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 20));
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const output = await historyMessagePage(
      remoteThread,
      limit,
      cursor,
      async (beforePosition, pageSize) => {
        const page = await input.client.threadRuntimeItemsPage({
          threadId: remoteThread.id,
          ...(beforePosition !== undefined ? { beforePosition } : {}),
          limit: pageSize,
          targetTimelineEntryCount: Math.max(1, Math.min(100, limit)),
        });
        if (ctx.debug)
          await logAdapterDebug(input.bootstrap.home, {
            source: "message.list.page",
            cursor: beforePosition !== undefined,
            beforePosition: beforePosition ?? null,
            itemCount: page.items.length,
            nextCursor: page.nextCursor,
          });
        return page;
      },
    );
    if (ctx.debug)
      await logAdapterDebug(input.bootstrap.home, {
        source: "message.list",
        cursor: cursor !== undefined,
        limit,
        messageCount: output.data.length,
        hasNext: output.cursor.next !== null,
      });
    return json(output);
  }
  const sessionMatch = path.match(/^\/api\/session\/([^/]+)$/u);
  if (sessionMatch && method === "GET") {
    const sessionID = decodeURIComponent(sessionMatch[1]!);
    ctx.currentSession = sessionID;
    const localSession = sessions.get(sessionID);
    if (localSession?.remoteStarted === false) {
      const createdAt = localSession.createdAt ?? Date.now();
      const output = {
        id: sessionID,
        projectID: localSession.projectId,
        agent: localSession.agentID ?? "build",
        ...(localSession.providerID && localSession.model
          ? {
              model: {
                id: localSession.model,
                providerID: localSession.providerID,
                ...(localSession.effort ? { variant: localSession.effort } : {}),
              },
            }
          : {}),
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: createdAt, updated: createdAt },
        location: { directory: input.bootstrap.directory },
      } satisfies SessionInfo;
      if (ctx.debug)
        void logAdapterDebug(input.bootstrap.home, {
          source: "session.get-local",
          sessionIDLength: sessionID.length,
        });
      return json({ data: output });
    }
    const id = threadId(sessionID);
    const currentProject = await resolveProject();
    const remoteThreads = await guiThreads();
    const remoteThread = remoteThreads.find((value) => value.id === id);
    if (ctx.debug)
      void logAdapterDebug(input.bootstrap.home, {
        source: "session.get",
        threadIDLength: id.length,
        remoteThreadCount: remoteThreads.length,
        found: Boolean(remoteThread),
      });
    if (!remoteThread) {
      // A real thread wins over the virtual-id parse — only fall through to
      // a subsession when no thread matches the decoded id.
      const subSession = parseSubSessionId(sessionID);
      const parent = subSession
        ? remoteThreads.find((value) => value.id === subSession.threadId)
        : undefined;
      const item = parent
        ? (await listThreadItems(parent.id)).find(
            (value) => value.id === subSession?.itemId && isSubAgentItem(value),
          )
        : undefined;
      if (parent && item) {
        return json({ data: toSubSession(parent, item, currentProject) });
      }
      await logAdapterError({
        home: input.bootstrap.home,
        method,
        route: path,
        responseStatus: 404,
        input: inputSummary(),
        error: new Error("Session not found"),
      });
      return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    }
    ctx.activeProviderID = remoteThread.agentKind;
    const output: SessionGetOutput = toSession(remoteThread, currentProject);
    return json({ data: output });
  }
  const waitMatch = path.match(/^\/api\/(?:experimental\/)?session\/([^/]+)\/wait$/u);
  if (waitMatch && method === "POST") {
    const waitSession = decodeURIComponent(waitMatch[1]!);
    const waitThreadId = threadId(waitSession);
    if (await isHiddenThread(waitThreadId))
      return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    const deadline = Date.now() + 30_000;
    for (;;) {
      const remoteThread = await visibleThread(waitThreadId);
      if (!remoteThread)
        return json({ error: { code: "not_found", message: "Session not found" } }, 404);
      // thread-state can stay stale-active after turn.completed — trust
      // the translator's run state over it.
      if (
        !isThreadTurnActive(states.get(waitThreadId) ?? remoteThread.status) ||
        !input.hasActiveRun(waitSession)
      )
        break;
      if (Date.now() >= deadline)
        return json({ error: { code: "busy", message: "The thread is still working." } }, 409);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return new Response(null, { status: 204 });
  }
  const sessionMoveMatch = path.match(/^\/api\/session\/([^/]+)\/move$/u);
  if (sessionMoveMatch && method === "POST") {
    const moveSession = decodeURIComponent(sessionMoveMatch[1]!);
    const rawId = threadId(moveSession);
    const body = record(await readBody());
    const directory = String(body.directory ?? "");
    const remoteThread = await visibleThread(rawId);
    if (!remoteThread || (await isHiddenThread(rawId)))
      return json({ error: { code: "not_found", message: "Session not found" } }, 404);
    const moveStatus = states.get(rawId) ?? remoteThread.status;
    if (moveStatus === "launching" || moveStatus === "working")
      return json(
        {
          error: {
            code: "busy",
            message: "Wait for the current turn to finish before moving the thread.",
          },
        },
        409,
      );
    const currentProject = await resolveProject();
    const projectDir = directoryOf(currentProject.location);
    if (directory === projectDir)
      return json(
        {
          error: {
            code: "invalid_request",
            message: "Moving a thread back to the main checkout isn't supported.",
          },
        },
        400,
      );
    const worktreesResult = record(
      await input.client.callRemoteProcedure("gitListWorktrees", {
        projectLocation: currentProject.location,
      }),
    );
    const listed = (Array.isArray(worktreesResult.worktrees) ? worktreesResult.worktrees : []).map(
      (entry) => record(entry),
    );
    const match = listed.find((entry) => String(entry.path ?? "") === directory);
    if (!match)
      return json(
        {
          error: {
            code: "invalid_request",
            message: "Not a worktree of this project.",
          },
        },
        400,
      );
    if (moveStatus !== "inactive") await input.client.closeThread(rawId);
    const moveIsNew = createdWorktrees.delete(directory);
    await input.client.sendThreadCommand({
      kind: "set-worktree",
      threadId: rawId,
      worktreePath: directory,
      worktreeBranch: String(match.branch ?? ""),
      ...(moveIsNew ? { isNewWorktree: true } : {}),
    });
    const cached = threadCache.get(rawId);
    if (cached)
      threadCache.set(rawId, {
        ...cached,
        worktreePath: directory,
        worktreeBranch: String(match.branch ?? ""),
      });
    return new Response(null, { status: 204 });
  }
  return undefined;
}
