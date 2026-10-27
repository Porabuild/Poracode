import { threadConfigSchema, threadStatusSchema } from "@/shared/contracts";
import { remoteThreadsChangedEventSchema } from "@/shared/remote/protocol/resources";
import { sessionId } from "../ids";
import { logAdapterDebug } from "../diagnostics";
import { openCodeEvent } from "../events";
import { selectPermissionOption } from "../permissions";
import { record } from "./helpers";
import type { RouterContext } from "./context";

/** Host remote events -> translator state, pending requests, refresh fan-out. */
export function createRemoteEvents(ctx: RouterContext) {
  const {
    states,
    pending,
    pendingReverts,
    subagentSubscriptions,
    threadCache,
    threadMentionTools,
    pendingShellExits,
    updateInboxSteer,
    updateInboxQueue,
    recordGoal,
    scheduleCheckpointReconcile,
    applyBackgroundTasks,
    subagentKey,
    unsubscribeSubagent,
    agentStatuses,
    handleAgentStatusEvent,
    directoryOf,
    isGuiThread,
    listThreads,
    pendingRequestKey,
    rememberPendingRequest,
    input,
  } = ctx;
  const handleRemoteEvent = (event: unknown) => {
    const value = record(event);
    if (
      value.type === "windows-agent-statuses" ||
      value.type === "wsl-agent-statuses" ||
      value.type === "agent-status-updated"
    ) {
      handleAgentStatusEvent(value);
      return;
    }
    if (value.type === "thread-reset" && typeof value.threadId === "string") {
      states.delete(value.threadId);
      pendingReverts.delete(sessionId(value.threadId));
      input.resetThread(value.threadId);
      input.events.resync();
      return;
    }
    if (value.type === "thread-pending-steer" && typeof value.threadId === "string") {
      updateInboxSteer(value.threadId, value.pending ?? null);
      return;
    }
    if (value.type === "thread-follow-up-queue" && typeof value.threadId === "string") {
      updateInboxQueue(value.threadId, value.queue ?? null);
      return;
    }
    if (typeof value.threadId === "string") {
      const itemEvent = record(value.event);
      if (
        (itemEvent.type === "item.started" ||
          itemEvent.type === "item.updated" ||
          itemEvent.type === "item.completed") &&
        itemEvent.itemType === "goal"
      )
        recordGoal(value.threadId, itemEvent.payload);
      if (
        itemEvent.type === "item.completed" &&
        typeof itemEvent.itemId === "string" &&
        subagentSubscriptions.has(subagentKey(value.threadId, itemEvent.itemId))
      )
        unsubscribeSubagent(value.threadId, itemEvent.itemId);
      // A checkpoint revert truncates the transcript on the host — drop the
      // per-session runtime state and resync like a thread-reset.
      if (itemEvent.type === "runtime.truncated") {
        pendingReverts.delete(sessionId(value.threadId));
        input.resetThread(value.threadId);
        input.events.resync();
      }
      // background_tasks.changed replaces the thread's task list — diff for
      // shell.created/deleted emissions.
      // A completed turn finalizes the file checkpoint captured for the
      // prompt that opened it — required for checkpointRevert's files phase.
      if (itemEvent.type === "turn.completed") scheduleCheckpointReconcile(value.threadId);
      if (itemEvent.type === "background_tasks.changed") {
        const tasks = Array.isArray(itemEvent.tasks) ? itemEvent.tasks.map(record) : [];
        applyBackgroundTasks(value.threadId, tasks, input.bootstrap.directory);
      }
    }
    const changed = remoteThreadsChangedEventSchema.safeParse(event);
    if (changed.success) {
      void refreshChangedThreads(changed.data.threadIds).catch(() => input.events.resync());
      return;
    }
    const status = threadStatusSchema.safeParse(value.status);
    if (value.type === "thread-state" && typeof value.threadId === "string" && status.success) {
      if (ctx.debug && states.get(value.threadId) !== status.data)
        void logAdapterDebug(input.bootstrap.home, {
          source: "thread-state",
          threadId: value.threadId,
          from: String(states.get(value.threadId) ?? "unknown"),
          to: String(status.data),
        });
      states.set(value.threadId, status.data);
      if (typeof value.threadMentionToolsAvailable === "boolean")
        threadMentionTools.set(value.threadId, value.threadMentionToolsAvailable);
    }
    const config = threadConfigSchema.safeParse(value.config);
    if (
      value.type === "thread-state" &&
      typeof value.threadId === "string" &&
      typeof value.agentKind === "string" &&
      config.success
    ) {
      input.registerThreadContext(value.threadId, {
        agent: config.data.mode === "plan" ? "plan" : "build",
        providerID: value.agentKind,
        model: config.data.model,
        location: { directory: input.bootstrap.directory },
      });
    }
    const rememberRequest = (thread: unknown, runtime: unknown) => {
      const request = record(runtime);
      if (request.type === "request.opened" && typeof request.requestId === "string") {
        if (typeof thread !== "string") return;
        const saved = rememberPendingRequest(
          thread,
          request.requestId,
          request.requestType,
          request.payload,
        );
        if (!saved || saved.requestType === "tool_user_input" || !input.bootstrap.args.auto) return;
        const optionId = selectPermissionOption(saved.options, "once");
        if (!optionId) return;
        input.recordPermissionReply(thread, request.requestId, "once");
        void input.client
          .resolveRequest({
            threadId: thread,
            requestId: request.requestId,
            method: "requestPermission",
            response: { optionId },
          })
          .catch(() => input.events.resync());
      }
      if (request.type === "request.resolved" && typeof request.requestId === "string") {
        if (typeof thread === "string")
          pending.delete(pendingRequestKey(thread, request.requestId));
      }
    };
    if (value.type === "thread-runtime-event") {
      rememberRequest(value.threadId, value.event);
    }
    // A watched dev shell exiting unblocks the session.shell waiter.
    if (value.type === "thread-exited" && typeof value.threadId === "string")
      pendingShellExits.get(value.threadId)?.();
    if (value.type === "thread-runtime-events" && Array.isArray(value.events)) {
      for (const runtime of value.events) {
        rememberRequest(value.threadId, runtime);
        if (record(runtime).type === "turn.completed" && typeof value.threadId === "string")
          scheduleCheckpointReconcile(value.threadId);
      }
    }
    if (value.type === "thread-runtime-events-multi" && Array.isArray(value.batches)) {
      for (const batch of value.batches) {
        const entries = record(batch);
        if (Array.isArray(entries.events)) {
          for (const runtime of entries.events) {
            rememberRequest(entries.threadId, runtime);
            if (record(runtime).type === "turn.completed" && typeof entries.threadId === "string")
              scheduleCheckpointReconcile(entries.threadId);
          }
        }
      }
    }
    for (const translated of input.translate(event)) input.events.emit(translated);
  };

  async function refreshChangedThreads(threadIds: readonly string[]) {
    const previous = new Map(threadIds.map((id) => [id, threadCache.get(id)]));
    const [threads, projectsPage] = await Promise.all([
      listThreads(),
      input.client.boundedProjectListPage({ mode: "inventory", projectLimit: 100 }),
    ]);
    const statusList =
      typeof input.client.agentStatuses === "function" ? await agentStatuses() : [];
    const projects = new Map(projectsPage.projects.map((value) => [value.id, value]));
    for (const id of threadIds) {
      const before = previous.get(id);
      const after = threads.find((value) => value.id === id);
      const beforeVisible = before !== undefined && isGuiThread(before, statusList);
      const afterVisible = after !== undefined && isGuiThread(after, statusList);
      const sessionID = sessionId(id);
      const changedProject = after ? projects.get(after.projectId) : undefined;
      const eventLocation = {
        location: {
          directory: changedProject
            ? directoryOf(changedProject.location)
            : input.bootstrap.directory,
        },
      };
      if (!before && after) {
        if (!afterVisible) continue;
        input.events.emit(
          openCodeEvent(
            "session.created",
            {
              sessionID,
              projectID: after.projectId,
              location: eventLocation.location,
              slug: after.id,
              title: after.title,
              version: input.bootstrap.appVersion,
            },
            {
              durable: {
                aggregateID: sessionID,
                seq: input.events.nextDurableSequence(sessionID),
                version: 1,
              },
              ...eventLocation,
            },
          ),
        );
        continue;
      }
      if (before && !after) {
        if (!beforeVisible) continue;
        input.events.emit(
          openCodeEvent(
            "session.deleted",
            { sessionID },
            {
              durable: {
                aggregateID: sessionID,
                seq: input.events.nextDurableSequence(sessionID),
                version: 2,
              },
              ...eventLocation,
            },
          ),
        );
        continue;
      }
      if (!before || !after || !afterVisible) continue;
      if (before.title !== after.title) {
        input.events.emit(
          openCodeEvent(
            "session.renamed",
            { sessionID, title: after.title },
            {
              durable: {
                aggregateID: sessionID,
                seq: input.events.nextDurableSequence(sessionID),
                version: 1,
              },
              ...eventLocation,
            },
          ),
        );
      }
      if (before.archived !== after.archived) {
        input.events.emit(
          after.archived
            ? openCodeEvent(
                "session.archived",
                { sessionID },
                {
                  durable: {
                    aggregateID: sessionID,
                    seq: input.events.nextDurableSequence(sessionID),
                    version: 1,
                  },
                  ...eventLocation,
                },
              )
            : openCodeEvent(
                "session.unarchived",
                { sessionID },
                {
                  durable: {
                    aggregateID: sessionID,
                    seq: input.events.nextDurableSequence(sessionID),
                    version: 1,
                  },
                  ...eventLocation,
                },
              ),
        );
      }
    }
  }

  // Poracode facade: the bundled plugin calls these in-process instead of
  // over HTTP. sessionOptions returns the provider's advertised choices;
  // setSessionOptions validates them, updates the session, and persists via
  // the last-model file.
  return { handleRemoteEvent, refreshChangedThreads };
}
