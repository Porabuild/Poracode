import type {
  AgentInfo,
  SessionInfo,
  AgentListOutput,
  CommandListOutput,
  ConfigGetOutput,
  FileListOutput,
  FormDetail,
  FormInfo,
  FormListOutput,
  ExperimentalPersistentPtyListOutput,
  IntegrationInfo,
  IntegrationListOutput,
  LocationGetOutput,
  McpListOutput,
  MigrationV1StatusOutput,
  ModelDefaultOutput,
  ModelInfo,
  ModelListOutput,
  OpenCodeEvent,
  PermissionListOutput,
  PermissionReply,
  ProviderInfo,
  ProviderListOutput,
  ProjectListOutput,
  SessionCreateOutput,
  SessionActiveOutput,
  SessionGetOutput,
  SessionInboxListOutput,
  SessionListOutput,
  ServerInfoOutput,
  VcsBaseOutput,
  VcsBranchListOutput,
  VcsDiffOutput,
  VcsGetOutput,
  VcsStatusOutput,
} from "@opencode/client";
import {
  isThreadTurnActive,
  listProjectTreeResultSchema,
  threadConfigSchema,
  threadStatusSchema,
  type AgentStatus,
  type Thread,
} from "@/shared/contracts";
import { findCheckpointBeforeUserMessage } from "@/shared/checkpointRevert";
import { stripAnsiPreservingLayout } from "@/shared/ansi";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import { hostSupportsThreadLaunchMetadata } from "@/shared/remote/protocol/threadLaunchMetadata";
import { sideChatLaunchInput } from "@/shared/sideChatLaunchInput";
import { resolveProjectLocation } from "@/shared/worktree";
import {
  gitBranchListResultSchema,
  gitDiffResultSchema,
  gitProjectSnapshotResultSchema,
  gitStatusResultSchema,
} from "@/shared/contracts/gitResults";
import { readProjectFileResultSchema } from "@/shared/contracts/projectTreeResults";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { remoteThreadsChangedEventSchema } from "@/shared/remote/protocol/resources";
import { canForkThread } from "@/shared/threadFork";
import { hostSupportsCatalogMutations } from "@/shared/remote/protocol/catalogMutations";
import { TUI_LAST_MODEL_VERSION } from "@/shared/tuiBootstrap";
import type { TuiBootstrap } from "../bootstrap";
import { historyMessagePage, historyMessages } from "./history";
import {
  itemId,
  parseSubSessionId,
  permissionId,
  permissionRequestId,
  sessionId,
  threadId,
} from "./ids";
import { selectPermissionOption } from "./permissions";
import {
  elicitationReply,
  emptyFormElicitationPayload,
  formAnswerSchema,
  formDismissalForRequest,
  formResponseForRequest,
} from "./forms";
import { EventStreamHub, openCodeEvent, type ThreadEventContext } from "./events";
import { createRouterState } from "./router/state";
import { createRevert } from "./router/revert";
import { createInbox } from "./router/inbox";
import { createGoals } from "./router/goals";
import { createCheckpoints } from "./router/checkpoints";
import { createShells } from "./router/shells";
import { createSubagents } from "./router/subagents";
import { createTitles } from "./router/titles";
import { createCatalog } from "./router/catalog";
import { createThreads } from "./router/threads";
import { createRequests } from "./router/requests";
import { createPrompt } from "./router/prompt";
import {
  gitFileStatus,
  json,
  parseGitDiff,
  record,
  supportsGui,
  supportsMode,
} from "./router/helpers";
import type { RouterContext } from "./router/context";
import { z } from "zod";
import { logAdapterDebug, logAdapterError, summarizeAdapterInput } from "./diagnostics";

// Version 1 stays additive; unknown future versions must not be overwritten.
export const LAST_MODEL_VERSION = TUI_LAST_MODEL_VERSION;

export function createRouter(input: {
  bootstrap: TuiBootstrap;
  client: RemoteDesktopClient;
  events: EventStreamHub;
  setThreadInterests: (ids: readonly string[]) => void | Promise<void>;
  watchTerminal?: (id: string, onOutput: (data: string) => void) => void;
  unwatchTerminal?: (id: string) => void;
  translate: (event: unknown) => OpenCodeEvent[];
  recordPermissionReply: (threadId: string, requestId: string, reply: PermissionReply) => void;
  recordFormRequest: (threadId: string, requestId: string) => string;
  forgetFormRequest: (threadId: string, requestId: string) => void;
  resetThread: (threadId: string) => void;
  hasActiveRun: (sessionID: string) => boolean;
  registerThreadContext: (threadId: string, context: ThreadEventContext) => void;
}) {
  const ctx = createRouterState(input) as RouterContext;
  // Sequential assigns: prompt.ts destructures ctx at factory-eval time, so
  // every earlier factory's members must already be on ctx when it runs.
  Object.assign(ctx, createRevert(ctx));
  Object.assign(ctx, createInbox(ctx));
  Object.assign(ctx, createGoals(ctx));
  Object.assign(ctx, createCheckpoints(ctx));
  Object.assign(ctx, createShells(ctx));
  Object.assign(ctx, createSubagents(ctx));
  Object.assign(ctx, createTitles(ctx));
  Object.assign(ctx, createCatalog(ctx));
  Object.assign(ctx, createThreads(ctx));
  Object.assign(ctx, createRequests(ctx));
  Object.assign(ctx, createPrompt(ctx));
  const {
    sessions,
    states,
    pendingReverts,
    pending,
    cancelledInboxIds,
    createdWorktrees,
    pendingSwitches,
    threadMentionTools,
    pendingShellExits,
    pendingShellTimeouts,
    shellStash,
    sessionMcpPending,
    backgroundTasks,
    subagentSubscriptions,
    threadCache,
    emitRevertEvent,
    commitPendingRevert,
    inboxKey,
    inboxEntry,
    inboxUserItem,
    emitInboxEvent,
    updateInboxSteer,
    updateInboxQueue,
    seedInbox,
    recordGoal,
    seedBackgroundTasks,
    seedGoal,
    goalState,
    controlGoal,
    subscribeGoal,
    goalSupported,
    goalLine,
    reconcileCheckpoints,
    scheduleCheckpointReconcile,
    taskFor,
    shellInfoFor,
    applyBackgroundTasks,
    subagentKey,
    subscribeSubagent,
    unsubscribeSubagent,
    disposeSubagentSubscriptions,
    remoteSettings,
    generateTitle,
    firstPromptText,
    renameThreadTo,
    resolveDefaultModel,
    resolveProject,
    requestLocation,
    persistLastModel,
    agentStatuses,
    hasGuiAuthentication,
    handleAgentStatusEvent,
    projectLocation,
    directoryOf,
    toSession,
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
    cachedThreadById,
    threadListPage,
    listThreads,
    encodeThreadCursor,
    decodeThreadCursor,
    pendingRequestKey,
    rememberPendingRequest,
    permissionItemFor,
    pendingRequestsForSession,
    pendingFormRequest,
    formFromPending,
    sendPrompt,
  } = ctx;

  const handleRequest = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    let inputSummary: unknown = {
      queryKeys: [...url.searchParams.keys()],
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
      hasBody: request.body !== null,
    };
    const readRequestBody = async () => {
      const body = record(await request.json());
      inputSummary = summarizeAdapterInput(body);
      return body;
    };
    try {
      if (method === "GET" && path === "/api/event") return input.events.subscribe();
      if ((path === "/api/info" || path === "/api/global/health") && method === "GET") {
        const output: ServerInfoOutput = {
          version: input.bootstrap.appVersion,
          pid: process.pid,
          urls: [],
          paths: { tmp: input.bootstrap.home },
        };
        return json(output);
      }
      if (path === "/api/location" && method === "GET") {
        const current = await resolveProject();
        const projectDirectory = directoryOf(projectLocation(current));
        const directory = requestLocation(url).directory;
        const output: LocationGetOutput = {
          directory,
          project: { id: current.id, directory: projectDirectory, canonical: projectDirectory },
        };
        return json(output);
      }
      if (path === "/api/location/reload" && method === "POST") {
        // A location reload refreshes location data only; resyncing the event
        // stream here reconnects the vendored UI mid-session and drops input.
        await resolveProject();
        return new Response(null, { status: 204 });
      }
      if (path === "/api/agent" && method === "GET") {
        await resolveProject();
        const guiStatuses = (await agentStatuses()).filter(supportsGui);
        const buildAgent: AgentInfo = {
          id: "build",
          name: "Build",
          request: { settings: {}, headers: {}, body: {} },
          mode: "primary",
          hidden: false,
          permissions: [],
        };
        const planAgent: AgentInfo = {
          id: "plan",
          name: "Plan",
          request: { settings: {}, headers: {}, body: {} },
          mode: "primary",
          hidden: false,
          permissions: [],
        };
        const data = [
          buildAgent,
          ...(guiStatuses.some((status) => supportsMode(status, "plan")) ? [planAgent] : []),
        ];
        const output: AgentListOutput = {
          location: requestLocation(url),
          data,
        };
        return json(output);
      }
      if (path === "/api/project" && method === "GET") {
        const current = await resolveProject();
        const time = Date.parse(current.createdAt);
        const output: ProjectListOutput = [
          {
            id: current.id,
            canonical: directoryOf(current.location),
            ...(current.name ? { name: current.name } : {}),
            time: { created: time, updated: time, active: time },
            sandboxes: [],
          },
        ];
        return json(output);
      }
      if (path === "/api/provider" && method === "GET") {
        const data: ProviderInfo[] = (await agentStatuses())
          .filter(supportsGui)
          .map((status: AgentStatus) => ({
            id: status.kind,
            ...(hasGuiAuthentication(status) ? { integrationID: status.kind } : {}),
            name: status.label,
            activation: hasGuiAuthentication(status) ? "enabled" : "disabled",
            package: "poracode",
          }));
        const output: ProviderListOutput = {
          location: requestLocation(url),
          data,
        };
        return json(output);
      }
      if (path === "/api/integration" && method === "GET") {
        const data: IntegrationInfo[] = (await agentStatuses())
          .filter(supportsGui)
          .filter(hasGuiAuthentication)
          .map((status) => ({
            id: status.kind,
            name: status.label,
            methods: [],
            connections: [{ type: "env", name: status.kind }],
          }));
        const output: IntegrationListOutput = {
          location: requestLocation(url),
          data,
        };
        return json(output);
      }
      if (path === "/api/model" && method === "GET") {
        const data: ModelInfo[] = (await agentStatuses()).filter(supportsGui).flatMap((status) => {
          const capabilities =
            status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
          const models = capabilities.models ?? status.capabilities.models;
          return models.map((option) => {
            const model: ModelInfo = {
              id: option.id,
              modelID: option.id,
              providerID: status.kind,
              ...(capabilities.modelSubProvider?.[option.id]
                ? { canonical: capabilities.modelSubProvider[option.id] }
                : {}),
              name: option.label,
              capabilities: { tools: true, input: ["text"], output: ["text"] },
              variants: (
                capabilities.modelEfforts?.[option.id] ??
                status.capabilities.modelEfforts[option.id] ??
                capabilities.efforts ??
                status.capabilities.efforts
              ).map((id) => ({ id })),
              time: { released: 0 },
              cost: [],
              status: "active",
              enabled: true,
              limit: { context: 128_000, output: 8_192 },
            };
            return model;
          });
        });
        const output: ModelListOutput = {
          location: requestLocation(url),
          data,
        };
        return json(output);
      }
      if (path === "/api/model/default" && method === "GET") {
        // Provider discovery is asynchronous on a fresh profile — the vendored
        // client fetches this once at mount, so wait briefly for the first
        // GUI-capable provider to appear instead of locking in `data: null`.
        const deadline = Date.now() + 15_000;
        while (!ctx.defaultModel && Date.now() < deadline) {
          ctx.statuses = await input.client.agentStatuses({ omitSlashCommands: true });
          ctx.defaultModel = await resolveDefaultModel();
          if (!ctx.defaultModel) await new Promise((resolve) => setTimeout(resolve, 500));
        }
        const agents = (await agentStatuses()).filter(supportsGui);
        const defaultStatus = agents.find((status) => status.kind === ctx.defaultModel?.providerID);
        const defaultCapabilities =
          defaultStatus?.capabilities.presentationCapabilities?.gui ?? defaultStatus?.capabilities;
        const data: ModelInfo | null = ctx.defaultModel
          ? ({
              id: ctx.defaultModel.model,
              modelID: ctx.defaultModel.model,
              providerID: ctx.defaultModel.providerID,
              name: ctx.defaultModel.model,
              capabilities: { tools: true, input: ["text"], output: ["text"] },
              variants: (
                defaultCapabilities?.modelEfforts?.[ctx.defaultModel.model] ??
                defaultCapabilities?.efforts ??
                []
              ).map((id) => ({ id })),
              time: { released: 0 },
              cost: [],
              status: "active",
              enabled: true,
              limit: { context: 128_000, output: 8_192 },
            } satisfies ModelInfo)
          : null;
        const output: ModelDefaultOutput = {
          location: requestLocation(url),
          data,
        };
        return json(output);
      }
      if (path === "/api/fs/find" && method === "GET") {
        const current = await resolveProject();
        const limitValue = Number(url.searchParams.get("limit"));
        const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(200, limitValue)) : 50;
        const result = z
          .object({
            entries: z.array(
              z.object({
                path: z.string(),
                name: z.string(),
                type: z.enum(["file", "directory"]),
              }),
            ),
            totalIndexed: z.number().int().nonnegative(),
          })
          .parse(
            await input.client.callRemoteProcedure("searchProjectFiles", {
              projectLocation: current.location,
              query: url.searchParams.get("query") ?? "",
              limit,
            }),
          );
        const requestedType = url.searchParams.get("type");
        const data = result.entries
          .filter((entry) => requestedType === null || entry.type === requestedType)
          .map((entry) => ({ path: entry.path, type: entry.type }));
        return json({ location: requestLocation(url), data });
      }
      const fileReadMatch = path.match(/^\/api\/fs\/read\/(.+)$/u);
      if (fileReadMatch && method === "GET") {
        const current = await resolveProject();
        const filePath = decodeURIComponent(fileReadMatch[1]!);
        const result = readProjectFileResultSchema.parse(
          await input.client.callRemoteProcedure("readProjectFile", {
            projectLocation: current.location,
            path: filePath,
          }),
        );
        if (result.status === "ready" && result.content !== undefined)
          return new Response(new TextEncoder().encode(result.content), {
            headers: { "content-type": "application/octet-stream" },
          });
        if (result.status === "binary" && result.contentBase64 !== undefined)
          return new Response(Buffer.from(result.contentBase64, "base64"), {
            headers: { "content-type": "application/octet-stream" },
          });
        return json(
          { error: { code: result.status, message: `File content is ${result.status}.` } },
          result.status === "too_large" ? 413 : 415,
        );
      }
      if ((path === "/api/file" || path === "/api/fs/list") && method === "GET") {
        const current = await resolveProject();
        const directoryPath = url.searchParams.get("path") ?? "";
        const result = listProjectTreeResultSchema.parse(
          await input.client.callRemoteProcedure("listProjectTree", {
            projectLocation: current.location,
            directoryPath,
          }),
        );
        const output: FileListOutput = {
          location: requestLocation(url),
          data: result.entries.map((entry) => ({ path: entry.path, type: entry.type })),
        };
        return json(output);
      }
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
      const inboxMatch = path.match(/^\/api\/session\/([^/]+)\/inbox$/u);
      if (inboxMatch && method === "GET") {
        const rawThreadId = threadId(decodeURIComponent(inboxMatch[1]!));
        await seedInbox(rawThreadId);
        const entry = inboxEntry(rawThreadId);
        const data: SessionInboxListOutput = [
          ...(entry.steer ? [inboxUserItem(rawThreadId, entry.steer, "steer")] : []),
          ...entry.queue.map((item) => inboxUserItem(rawThreadId, item, "queue")),
        ];
        return json({ data });
      }
      const inboxItemMatch = path.match(/^\/api\/session\/([^/]+)\/inbox\/([^/]+)$/u);
      if (inboxItemMatch && method === "DELETE") {
        const rawThreadId = threadId(decodeURIComponent(inboxItemMatch[1]!));
        const inboxID = decodeURIComponent(inboxItemMatch[2]!);
        const entry = inboxEntry(rawThreadId);
        if (entry.steer?.id === inboxID) {
          const dropped = entry.steer;
          const key = inboxKey(rawThreadId, inboxID);
          cancelledInboxIds.add(key);
          try {
            await input.client.clearPendingSteer(rawThreadId);
          } finally {
            if (entry.steer === dropped) entry.steer = null;
            if (cancelledInboxIds.delete(key))
              emitInboxEvent(rawThreadId, "session.inbox.cancelled", dropped, "steer");
          }
        } else {
          const index = entry.queue.findIndex((item) => item.id === inboxID);
          if (index >= 0) {
            const key = inboxKey(rawThreadId, inboxID);
            const dropped = entry.queue[index]!;
            cancelledInboxIds.add(key);
            try {
              await input.client.callRemoteProcedure("removeQueuedThreadFollowUp", {
                threadId: rawThreadId,
                id: inboxID,
              });
            } finally {
              if (entry.queue[index] === dropped) entry.queue.splice(index, 1);
              if (cancelledInboxIds.delete(key))
                emitInboxEvent(rawThreadId, "session.inbox.cancelled", dropped, "queue");
            }
          } else {
            // Neither the current steer nor a queued item — a delivered
            // prompt's inbox id looks exactly like this. 204 as a no-op;
            // never clearPendingSteer blindly or an unrelated steer dies.
            if (ctx.debug)
              void logAdapterDebug(input.bootstrap.home, {
                source: "inbox.delete",
                threadId: rawThreadId,
                inboxID,
                resolution: "noop",
              });
          }
        }
        if (ctx.debug)
          void logAdapterDebug(input.bootstrap.home, {
            source: "inbox.delete",
            threadId: rawThreadId,
            inboxID,
            resolution:
              entry.steer?.id === inboxID
                ? "steer"
                : entry.queue.some((item) => item.id === inboxID)
                  ? "queue"
                  : "noop",
          });
        return new Response(null, { status: 204 });
      }
      if (inboxItemMatch && method === "PATCH") {
        // session.inbox.update: change a pending item's delivery mode.
        const rawThreadId = threadId(decodeURIComponent(inboxItemMatch[1]!));
        const inboxID = decodeURIComponent(inboxItemMatch[2]!);
        const body = await readRequestBody();
        const delivery =
          body.delivery === "steer" || body.delivery === "queue" ? body.delivery : undefined;
        if (!delivery)
          return json(
            { error: { code: "invalid_request", message: "delivery must be steer or queue" } },
            400,
          );
        const entry = inboxEntry(rawThreadId);
        const sessionID = sessionId(rawThreadId);
        if (delivery === "steer" && entry.queue.some((item) => item.id === inboxID)) {
          await input.client.callRemoteProcedure("steerQueuedThreadFollowUp", {
            threadId: rawThreadId,
            id: inboxID,
          });
          input.events.emit(
            openCodeEvent(
              "session.inbox.delivery.changed",
              { sessionID, inboxID, delivery: "steer" },
              {
                durable: {
                  aggregateID: sessionID,
                  seq: input.events.nextDurableSequence(sessionID),
                  version: 1 as const,
                },
                location: { directory: input.bootstrap.directory },
              },
            ),
          );
        } else if (delivery === "queue" && entry.steer?.id === inboxID) {
          const item = entry.steer;
          const remoteThread = await cachedThreadById(rawThreadId);
          await input.client.clearPendingSteer(rawThreadId);
          await input.client.callRemoteProcedure("queueThreadFollowUp", {
            threadId: rawThreadId,
            prompt: item.prompt,
            ...(item.segments ? { segments: item.segments } : {}),
            config: remoteThread?.config ?? {
              model: sessions.get(sessionID)?.model ?? "",
              mode: "agent" as const,
            },
          });
          entry.steer = null;
          input.events.emit(
            openCodeEvent(
              "session.inbox.delivery.changed",
              { sessionID, inboxID, delivery: "queue" },
              {
                durable: {
                  aggregateID: sessionID,
                  seq: input.events.nextDurableSequence(sessionID),
                  version: 1 as const,
                },
                location: { directory: input.bootstrap.directory },
              },
            ),
          );
        }
        // Same delivery or unknown item: no-op per openapi.
        return new Response(null, { status: 204 });
      }
      if (path === "/api/session" && method === "POST") {
        const body = await readRequestBody();
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
          const body = await readRequestBody();
          const result = await setSessionOptions(id, {
            approvalPolicy:
              typeof body.approvalPolicy === "string" ? body.approvalPolicy : undefined,
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
        if (!source)
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        // `fork` is a catalog command: the host must have advertised
        // capabilities.catalogMutations v1, otherwise it cannot persist the
        // intent truthfully.
        const descriptor =
          typeof input.client.environment === "function"
            ? await input.client.environment()
            : undefined;
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
        const body = await readRequestBody();
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
        const body = await readRequestBody();
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
      const promptMatch = path.match(/^\/api\/session\/([^/]+)\/prompt$/u);
      if (promptMatch && method === "POST") {
        const promptSession = decodeURIComponent(promptMatch[1]!);
        if (await isHiddenThread(threadId(promptSession)))
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        if (await isLiveSubSession(promptSession)) {
          return json(
            {
              error: {
                code: "read_only",
                message: "Subagent transcripts are read-only; prompt the parent session instead.",
              },
            },
            400,
          );
        }
        const promptResult = await sendPrompt(promptSession, await readRequestBody());
        if ("error" in promptResult)
          return json(
            { error: promptResult.error },
            "status" in promptResult && typeof promptResult.status === "number"
              ? promptResult.status
              : 400,
          );
        return json(promptResult);
      }
      const compactMatch = path.match(/^\/api\/session\/([^/]+)\/compact$/u);
      if (compactMatch && method === "POST") {
        const compactSession = decodeURIComponent(compactMatch[1]!);
        if (await isLiveSubSession(compactSession))
          return json(
            {
              error: {
                code: "read_only",
                message: "Subagent transcripts are read-only; compact the parent session instead.",
              },
            },
            400,
          );
        const compactThread = await visibleThread(threadId(compactSession));
        if (!compactThread)
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        const providerID = compactThread.agentKind;
        let compactAvailable = false;
        try {
          const commands = await input.client.agentSlashCommands(providerID);
          compactAvailable = commands.commands.some((command) => command.id === "compact");
        } catch {
          compactAvailable = false;
        }
        if (!compactAvailable)
          return json(
            {
              error: {
                code: "unsupported",
                message: "This provider has no compact command.",
              },
            },
            400,
          );
        const compactResult = await sendPrompt(compactSession, { text: "/compact" });
        if ("error" in compactResult)
          return json({ error: compactResult.error }, compactResult.status ?? 400);
        // session.compact declares 200 + SessionInboxCompaction.
        return json({
          data: {
            id: `msg_${crypto.randomUUID()}`,
            sessionID: compactSession,
            time: { created: Date.now() },
            type: "compaction",
            payload: {},
            delivery: "steer",
          },
        });
      }
      const commandMatch = path.match(/^\/api\/session\/([^/]+)\/command$/u);
      if (commandMatch && method === "POST") {
        const session = decodeURIComponent(commandMatch[1]!);
        if (await isHiddenThread(threadId(session)))
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        const body = record(await readRequestBody());
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) throw new Error("A slash command name is required.");
        const args = typeof body.text === "string" ? body.text : "";
        const commandResult = await sendPrompt(session, {
          text: `/${name}${args ? ` ${args}` : ""}`,
        });
        if ("error" in commandResult)
          return json({ error: commandResult.error }, commandResult.status ?? 400);
        return new Response(null, { status: 204 });
      }
      const interruptMatch = path.match(/^\/api\/session\/([^/]+)\/interrupt$/u);
      if (interruptMatch && method === "POST") {
        const interruptSession = decodeURIComponent(interruptMatch[1]!);
        if (await isHiddenThread(threadId(interruptSession)))
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        if (await isLiveSubSession(interruptSession)) {
          return json(
            {
              error: {
                code: "read_only",
                message:
                  "Subagent transcripts are read-only; interrupt the parent session instead.",
              },
            },
            400,
          );
        }
        const id = threadId(interruptSession);
        // No-op on an idle thread: interrupting an idle host thread can emit a
        // transient thread-state that never settles, and the vendored undo
        // always interrupts before wait/revert.stage.
        const remoteThread = await cachedThreadById(id);
        const liveStatus = states.get(id) ?? remoteThread?.status;
        const turnActive = liveStatus !== undefined && isThreadTurnActive(liveStatus);
        const runActive = input.hasActiveRun(interruptSession);
        if (ctx.debug)
          await logAdapterDebug(input.bootstrap.home, {
            source: "session.interrupt",
            threadID: id,
            status: String(states.get(id) ?? remoteThread?.status ?? "unknown"),
            turnActive,
            runActive,
            sent: turnActive || runActive,
          });
        // The generated client declares 200 + SessionInterruptResponse — a
        // bare 204 makes the call throw and aborts the vendored undo flow.
        const sent = turnActive || runActive;
        if (sent) await input.client.interruptThread(id);
        return json({ interrupted: sent });
      }
      const selectionMatch = path.match(/^\/api\/session\/([^/]+)\/(agent|model)$/u);
      if (selectionMatch && method === "POST") {
        const id = decodeURIComponent(selectionMatch[1]!);
        const rawThreadID = threadId(id);
        const body = await readRequestBody();
        const currentProject = await resolveProject();
        const current = sessions.get(id) ?? { threadId: rawThreadID, projectId: currentProject.id };
        if (selectionMatch[2] === "agent") {
          const agentID = String(body.agent ?? "build");
          if (agentID === "plan") {
            const status = (await agentStatuses()).find(
              (value) => value.kind === (current.providerID ?? ctx.activeProviderID),
            );
            if (!status || !supportsMode(status, "plan")) {
              return json(
                {
                  error: {
                    code: "unsupported",
                    message: "This provider does not support plan mode.",
                  },
                },
                400,
              );
            }
          }
          sessions.set(id, { ...current, agentID });
          if (current.providerID && current.model) {
            input.registerThreadContext(rawThreadID, {
              agent: agentID,
              providerID: current.providerID,
              model: current.model,
              location: { directory: directoryOf(currentProject.location) },
            });
          }
          return new Response(null, { status: 204 });
        }
        const model = record(body.model);
        const providerID = String(model.providerID ?? current.providerID ?? "");
        const modelID = String(model.id ?? current.model ?? "");
        const effort = typeof model.variant === "string" ? model.variant : undefined;
        if (!providerID || !modelID) throw new Error("Choose an installed provider and model");
        // A model from another provider on an existing thread stages an
        // in-place provider switch; the next prompt carries it.
        const remoteThread = threadCache.get(rawThreadID) ?? (await visibleThread(rawThreadID));
        if (remoteThread && remoteThread.agentKind !== providerID) {
          const switchStatus = states.get(rawThreadID) ?? remoteThread.status;
          if (switchStatus === "launching" || switchStatus === "working")
            return json(
              {
                error: {
                  code: "busy",
                  message: "Wait for the current turn to finish before switching providers.",
                },
              },
              409,
            );
          pendingSwitches.set(id, { providerID, modelID });
          const targetStatus = (await agentStatuses()).find((value) => value.kind === providerID);
          input.events.emit(
            openCodeEvent(
              "tui.toast.show",
              {
                message: `Your next message continues this conversation in ${String(record(targetStatus).label ?? record(targetStatus).name ?? providerID)}.`,
                variant: "info",
              },
              {},
            ),
          );
        } else {
          pendingSwitches.delete(id);
        }
        const updated = {
          ...current,
          providerID,
          model: modelID,
          ...(effort ? { effort } : {}),
        };
        if (current.providerID !== providerID) {
          delete updated.approvalPolicy;
          delete updated.sandboxMode;
        }
        sessions.set(id, updated);
        ctx.activeProviderID = providerID;
        input.registerThreadContext(rawThreadID, {
          agent: current.agentID ?? "build",
          providerID,
          model: modelID,
          location: { directory: directoryOf(currentProject.location) },
        });
        return new Response(null, { status: 204 });
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
            input: inputSummary,
            error: new Error("Session not found"),
          });
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        }
        ctx.activeProviderID = remoteThread.agentKind;
        const output: SessionGetOutput = toSession(remoteThread, currentProject);
        return json({ data: output });
      }
      const formReplyMatch = path.match(/^\/api\/session\/([^/]+)\/form\/([^/]+)\/reply$/u);
      if (formReplyMatch && method === "POST") {
        const session = decodeURIComponent(formReplyMatch[1]!);
        const formID = decodeURIComponent(formReplyMatch[2]!);
        const pendingRequest = await pendingFormRequest(session, formID);
        if (!pendingRequest)
          return json({ error: { code: "not_found", message: "Form not found" } }, 404);
        const body = record(await readRequestBody());
        const answer = formAnswerSchema.parse(body.answer);
        const runtimeRequest = {
          type: "request.opened" as const,
          threadId: pendingRequest.threadId,
          requestId: pendingRequest.requestId,
          requestType: pendingRequest.requestType,
          payload: pendingRequest.payload,
        };
        const resolution = formResponseForRequest(runtimeRequest, answer);
        input.forgetFormRequest(pendingRequest.threadId, pendingRequest.requestId);
        try {
          await input.client.resolveRequest({
            threadId: pendingRequest.threadId,
            requestId: pendingRequest.requestId,
            method: "requestPermission",
            response: resolution.response,
          });
        } catch (error) {
          input.recordFormRequest(pendingRequest.threadId, pendingRequest.requestId);
          input.events.resync();
          throw error;
        }
        pending.delete(pendingRequestKey(pendingRequest.threadId, pendingRequest.requestId));
        input.events.emit(
          openCodeEvent(
            "form.replied",
            { id: formID as FormInfo["id"], sessionID: session, answer },
            { location: { directory: input.bootstrap.directory } },
          ),
        );
        return new Response(null, { status: 204 });
      }
      const sessionFormMatch = path.match(/^\/api\/session\/([^/]+)\/form$/u);
      if (sessionFormMatch && method === "GET") {
        const session = decodeURIComponent(sessionFormMatch[1]!);
        const requests = await pendingRequestsForSession(session);
        const data = requests.flatMap((pendingRequest) => {
          if (pendingRequest.requestType !== "tool_user_input") return [];
          const form = formFromPending(pendingRequest);
          return form ? [form] : [];
        });
        return json({ data });
      }
      const formMatch = path.match(/^\/api\/session\/([^/]+)\/form\/([^/]+)$/u);
      if (formMatch) {
        const session = decodeURIComponent(formMatch[1]!);
        const formID = decodeURIComponent(formMatch[2]!);
        const pendingRequest = await pendingFormRequest(session, formID);
        if (!pendingRequest)
          return json({ error: { code: "not_found", message: "Form not found" } }, 404);
        if (method === "GET") {
          const form = formFromPending(pendingRequest);
          return form
            ? json({ data: { ...form, state: { status: "pending" } } satisfies FormDetail })
            : json({ error: { code: "not_found", message: "Form not found" } }, 404);
        }
        if (method === "DELETE") {
          const runtimeRequest = {
            type: "request.opened" as const,
            threadId: pendingRequest.threadId,
            requestId: pendingRequest.requestId,
            requestType: pendingRequest.requestType,
            payload: pendingRequest.payload,
          };
          const resolution = formDismissalForRequest(runtimeRequest);
          input.forgetFormRequest(pendingRequest.threadId, pendingRequest.requestId);
          try {
            await input.client.resolveRequest({
              threadId: pendingRequest.threadId,
              requestId: pendingRequest.requestId,
              method: "requestPermission",
              response: resolution.response,
            });
          } catch (error) {
            input.recordFormRequest(pendingRequest.threadId, pendingRequest.requestId);
            input.events.resync();
            throw error;
          }
          pending.delete(pendingRequestKey(pendingRequest.threadId, pendingRequest.requestId));
          input.events.emit(
            openCodeEvent(
              "form.cancelled",
              { id: formID as FormInfo["id"], sessionID: session },
              { location: { directory: input.bootstrap.directory } },
            ),
          );
          return new Response(null, { status: 204 });
        }
      }
      const permissionMatch = path.match(/^\/api\/session\/([^/]+)\/permission\/([^/]+)\/reply$/u);
      if (permissionMatch && method === "POST") {
        const body = await readRequestBody();
        const session = decodeURIComponent(permissionMatch[1]!);
        const rawThreadId = threadId(session);
        const openCodeRequestID = decodeURIComponent(permissionMatch[2]!);
        const resolvedRequestID = permissionRequestId(openCodeRequestID);
        const key = pendingRequestKey(rawThreadId, resolvedRequestID);
        const pendingRequest = pending.get(key);
        if (!pendingRequest) throw new Error("Permission request is no longer available");
        const decisionResult = z.enum(["once", "always", "reject"]).safeParse(body.decision);
        const decision = decisionResult.success ? decisionResult.data : "once";
        if (pendingRequest.elicitation) {
          // Binary accept/decline: "always" collapses to accept because there
          // is no persistent grant to record.
          const structured = emptyFormElicitationPayload(pendingRequest.payload);
          input.recordPermissionReply(
            pendingRequest.threadId,
            resolvedRequestID,
            decision === "reject" ? "reject" : "once",
          );
          await input.client.resolveRequest({
            threadId: pendingRequest.threadId,
            requestId: resolvedRequestID,
            method: "requestPermission",
            response: structured
              ? elicitationReply(structured, decision === "reject")
              : { action: decision === "reject" ? "decline" : "accept" },
          });
          pending.delete(key);
          return new Response(null, { status: 204 });
        }
        const optionId = selectPermissionOption(pendingRequest.options, decision);
        if (!optionId) throw new Error(`The permission does not offer ${decision}`);
        input.recordPermissionReply(pendingRequest.threadId, resolvedRequestID, decision);
        await input.client.resolveRequest({
          threadId: pendingRequest.threadId,
          requestId: resolvedRequestID,
          method: "requestPermission",
          response: { optionId },
        });
        pending.delete(key);
        return new Response(null, { status: 204 });
      }
      const permissionListMatch = path.match(/^\/api\/session\/([^/]+)\/permission$/u);
      if (permissionListMatch && method === "GET") {
        const session = decodeURIComponent(permissionListMatch[1]!);
        const requests = await pendingRequestsForSession(session);
        const output: PermissionListOutput = requests
          .filter(
            (pendingRequest) =>
              pendingRequest.requestType !== "tool_user_input" ||
              pendingRequest.elicitation === true,
          )
          .map((pendingRequest) => permissionItemFor(session, pendingRequest));
        return json(output);
      }
      const permissionGetMatch = path.match(/^\/api\/session\/([^/]+)\/permission\/([^/]+)$/u);
      if (permissionGetMatch && method === "GET") {
        const session = decodeURIComponent(permissionGetMatch[1]!);
        const requests = await pendingRequestsForSession(session);
        const pendingRequest = requests.find(
          (value) => permissionId(value.requestId) === decodeURIComponent(permissionGetMatch[2]!),
        );
        if (!pendingRequest)
          return json(
            { error: { code: "not_found", message: "Permission request not found" } },
            404,
          );
        return json({ data: permissionItemFor(session, pendingRequest) });
      }
      if (path === "/api/vcs" && method === "GET") {
        try {
          const current = await resolveProject();
          const snapshot = gitProjectSnapshotResultSchema.parse(
            await input.client.callRemoteProcedure("gitProjectSnapshot", {
              projectLocation: current.location,
            }),
          );
          const output: VcsGetOutput = {
            location: { directory: input.bootstrap.directory },
            data: {
              ...(snapshot.status?.remoteInfo
                ? { provider: snapshot.status.remoteInfo.platform }
                : {}),
              branch: {
                ...(snapshot.branches?.current ? { current: snapshot.branches.current } : {}),
              },
            },
          };
          return json(output);
        } catch {
          return json({
            location: { directory: input.bootstrap.directory },
            data: { branch: {} },
          } satisfies VcsGetOutput);
        }
      }
      if (path === "/api/vcs/base" && method === "GET")
        return json({
          location: { directory: input.bootstrap.directory },
          data: null,
        } satisfies VcsBaseOutput);
      if (path === "/api/vcs/status" && method === "GET") {
        try {
          const current = await resolveProject();
          const status = gitStatusResultSchema.parse(
            await input.client.callRemoteProcedure("getGitStatus", {
              projectLocation: current.location,
            }),
          );
          const data: VcsStatusOutput["data"] = [...status.staged, ...status.unstaged].map(
            (change) => ({
              file: change.path,
              additions: change.insertions,
              deletions: change.deletions,
              status: gitFileStatus(change.status),
            }),
          );
          return json({ location: { directory: input.bootstrap.directory }, data });
        } catch {
          return json({
            location: { directory: input.bootstrap.directory },
            data: [],
          } satisfies VcsStatusOutput);
        }
      }
      if (path === "/api/vcs/branch" && method === "GET") {
        try {
          const current = await resolveProject();
          const branches = gitBranchListResultSchema.parse(
            await input.client.callRemoteProcedure("gitListBranches", {
              projectLocation: current.location,
              includeRemote: true,
            }),
          );
          const search = url.searchParams.get("search")?.toLowerCase();
          const limitValue = Number(url.searchParams.get("limit"));
          const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(500, limitValue)) : 100;
          const data = branches.branches
            .map((branch) => branch.name)
            .filter((name) => !search || name.toLowerCase().includes(search))
            .slice(0, limit);
          return json({
            location: { directory: input.bootstrap.directory },
            data,
          } satisfies VcsBranchListOutput);
        } catch {
          return json({
            location: { directory: input.bootstrap.directory },
            data: [],
          } satisfies VcsBranchListOutput);
        }
      }
      if (path === "/api/vcs/diff" && method === "GET") {
        try {
          const current = await resolveProject();
          const mode = url.searchParams.get("mode");
          const result = gitDiffResultSchema.parse(
            await input.client.callRemoteProcedure("getGitDiff", {
              projectLocation: current.location,
              staged: mode === "committed",
            }),
          );
          return json({
            location: { directory: input.bootstrap.directory },
            data: parseGitDiff(result.diff),
          } satisfies VcsDiffOutput);
        } catch {
          return json({
            location: { directory: input.bootstrap.directory },
            data: [],
          } satisfies VcsDiffOutput);
        }
      }
      if (path === "/api/vcs/init" && method === "POST")
        return json(
          {
            error: {
              code: "unsupported",
              message: "VCS initialization is unavailable in this TUI.",
            },
          },
          501,
        );
      if (path === "/api/worktree" && method === "GET") {
        // An old host without gitListWorktrees answers an empty list.
        const output: { directory: string }[] = [];
        try {
          const currentProject = await resolveProject();
          const result = record(
            await input.client.callRemoteProcedure("gitListWorktrees", {
              projectLocation: currentProject.location,
            }),
          );
          for (const entry of Array.isArray(result.worktrees)
            ? (result.worktrees as unknown[])
            : [])
            output.push({ directory: String(record(entry).path ?? "") });
        } catch {
          // Unsupported or unreachable host — the workspace dialog sees none.
        }
        return json(output);
      }
      if (path === "/api/worktree" && method === "POST") {
        const body = record(await readRequestBody());
        const currentProject = await resolveProject();
        const branch =
          String(body.name ?? body.branch ?? "").trim() ||
          `poracode/${currentProject.name.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}-${crypto.randomUUID().slice(0, 4)}`;
        const result = record(
          await input.client.callRemoteProcedure("gitAddWorktree", {
            projectLocation: currentProject.location,
            branch,
            createBranch: true,
          }),
        );
        const directory = String(result.path ?? result.worktree ?? result.directory ?? "");
        if (!directory)
          return json(
            { error: { code: "invalid_request", message: "Worktree creation returned no path" } },
            400,
          );
        createdWorktrees.set(directory, branch);
        return json({ data: { directory } });
      }
      if (path === "/api/worktree/refresh" && method === "POST") {
        try {
          const currentProject = await resolveProject();
          await input.client.callRemoteProcedure("gitListWorktrees", {
            projectLocation: currentProject.location,
          });
        } catch {
          // Refresh is best-effort; unsupported hosts still get 204.
        }
        return new Response(null, { status: 204 });
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
      const revertStageMatch = path.match(/^\/api\/session\/([^/]+)\/revert\/stage$/u);
      if (revertStageMatch && method === "POST") {
        const revertSession = decodeURIComponent(revertStageMatch[1]!);
        const rawId = threadId(revertSession);
        if (parseSubSessionId(revertSession))
          return json({ error: { code: "read_only", message: "This session is read-only" } }, 400);
        if (await isHiddenThread(rawId))
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        const body = record(await readRequestBody());
        const userItemId = itemId(String(body.messageID ?? ""));
        const items = await listThreadItems(rawId);
        const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
        const checkpointItemId = findCheckpointBeforeUserMessage(
          items.map((item) => item.id),
          itemsById,
          userItemId,
        );
        if (!checkpointItemId)
          return json(
            {
              error: {
                code: "invalid_request",
                message: "Nothing to undo before the first message.",
              },
            },
            400,
          );
        // Stage only marks the boundary — the irreversible checkpointRevert
        // runs on commit, which the vendored prompt sends before the next
        // message. Until then /redo (clear) restores the view.
        pendingReverts.set(revertSession, {
          messageID: String(body.messageID ?? ""),
          checkpointItemId,
        });
        emitRevertEvent("session.revert.staged", revertSession, {
          revert: { messageID: String(body.messageID ?? "") },
        });
        if (ctx.debug)
          void logAdapterDebug(input.bootstrap.home, {
            source: "revert.stage",
            threadId: rawId,
            messageID: String(body.messageID ?? ""),
            checkpointItemId,
          });
        // session.revert.stage declares 200 + SessionRevert — the vendored
        // undo prefills the prompt from the staged message.
        return json({ data: { messageID: String(body.messageID ?? "") } });
      }
      const revertEndMatch = path.match(/^\/api\/session\/([^/]+)\/revert\/(commit|clear)$/u);
      if (revertEndMatch && method === "POST") {
        const revertSession = decodeURIComponent(revertEndMatch[1]!);
        if (revertEndMatch[2] === "commit" && pendingReverts.has(revertSession)) {
          const failure = await commitPendingRevert(revertSession);
          if (failure) return json({ error: failure.error }, failure.status);
          return new Response(null, { status: 204 });
        }
        pendingReverts.delete(revertSession);
        emitRevertEvent("session.revert.cleared", revertSession, {});
        return new Response(null, { status: 204 });
      }
      // The generated client sends revert.clear as DELETE /session/{id}/revert.
      const revertDeleteMatch = path.match(/^\/api\/session\/([^/]+)\/revert$/u);
      if (revertDeleteMatch && method === "DELETE") {
        const revertSession = decodeURIComponent(revertDeleteMatch[1]!);
        pendingReverts.delete(revertSession);
        emitRevertEvent("session.revert.cleared", revertSession, {});
        return new Response(null, { status: 204 });
      }
      // Background tasks surface as vendored shells. Only the last progress
      // snapshot is available — output pages read it as a byte range.
      if (path === "/api/shell" && method === "GET") {
        const currentProject = await resolveProject();
        const cwd = directoryOf(currentProject.location);
        const output: unknown[] = [];
        for (const thread of await guiThreads())
          for (const task of backgroundTasks.get(thread.id) ?? [])
            output.push(shellInfoFor(thread.id, task, cwd));
        return json({ location: requestLocation(url), data: output });
      }
      // Vendored MCP surface: the three built-in toggles only — custom MCP
      // definitions and installed plugins are not remote-readable (the host
      // settings the client can't see own them), so they aren't listed.
      if (path === "/api/mcp" && method === "GET") {
        const settings = await remoteSettings();
        const disabled = new Set(
          Array.isArray(settings.disabledBuiltInMcpServers)
            ? (settings.disabledBuiltInMcpServers as unknown[]).map(String)
            : [],
        );
        const builtIns = [
          ["crossagents", "crossagentMcp"],
          ["browser", "browserMcp"],
          ["chrome", "chromeMcp"],
        ] as const;
        const sessionID = ctx.currentSession ?? "";
        const pendingList = sessionMcpPending.get(sessionID) ?? sessionMcpPending.get("");
        const data: McpListOutput["data"] = [];
        for (const [id] of builtIns) {
          if (disabled.has(id)) continue;
          const enabled = pendingList?.get(id) ?? true;
          data.push({ name: id, status: { status: enabled ? "connected" : "disabled" } });
        }
        const output: McpListOutput = { location: requestLocation(url), data };
        return json(output);
      }
      const mcpToggleMatch = path.match(
        /^\/api\/experimental\/mcp\/([^/]+)\/(connect|disconnect)$/u,
      );
      if (mcpToggleMatch && method === "POST") {
        const server = decodeURIComponent(mcpToggleMatch[1]!);
        const enabled = mcpToggleMatch[2] === "connect";
        // The vendored dialog sends no session — apply to the last-viewed
        // session; "" = location default for the next new thread.
        const sessionID = ctx.currentSession ?? "";
        let pendingToggle = sessionMcpPending.get(sessionID);
        if (!pendingToggle) {
          pendingToggle = new Map();
          sessionMcpPending.set(sessionID, pendingToggle);
        }
        pendingToggle.set(server, enabled);
        const remoteThread = sessionID ? await visibleThread(threadId(sessionID)) : undefined;
        const status = remoteThread
          ? (states.get(remoteThread.id) ?? remoteThread.status)
          : undefined;
        if (status !== undefined && isThreadTurnActive(status))
          input.events.emit(
            openCodeEvent(
              "tui.toast.show",
              { message: "Applies the next time this thread starts.", variant: "info" },
              { location: { directory: input.bootstrap.directory } },
            ),
          );
        return new Response(null, { status: 204 });
      }
      // Vendored skill palette — host-scanned skills for this project.
      if (path === "/api/skill" && method === "GET") {
        const skillProject = await resolveProject();
        const scanned = await input.client
          .callRemoteProcedure("scanSkills", { projectLocation: skillProject.location })
          .catch(() => null);
        const plugins = record(scanned).plugins;
        const data = (Array.isArray(plugins) ? plugins : []).map((value) => {
          const entry = record(value);
          const name = String(entry.name ?? "");
          const scope = String(entry.scope ?? "project");
          return {
            id: `${scope}:${name}`,
            name,
            description: String(entry.description ?? entry.name ?? ""),
            ...(typeof entry.path === "string" ? { path: entry.path } : {}),
            scope,
          };
        });
        return json({ location: requestLocation(url), data });
      }
      // `!command` — a one-off host dev shell, never a local spawn. PTY bytes
      // stream over the watched-terminal socket seam; the vendored UI reads
      // the rendered bash part, the next prompt carries the output as context.
      const sessionShellMatch = path.match(/^\/api\/session\/([^/]+)\/shell$/u);
      if (sessionShellMatch && method === "POST") {
        const shellSession = decodeURIComponent(sessionShellMatch[1]!);
        const body = record(await request.json().catch(() => ({})));
        const command = String(body.command ?? "").trim();
        if (!command)
          return json(
            { error: { code: "invalid_request", message: "A command is required." } },
            400,
          );
        if (await isLiveSubSession(shellSession))
          return json(
            { error: { code: "read_only", message: "Subagent transcripts are read-only." } },
            400,
          );
        const remoteThread = await visibleThread(threadId(shellSession));
        if (!remoteThread)
          return json({ error: { code: "not_found", message: "Session not found" } }, 404);
        const liveStatus = states.get(remoteThread.id) ?? remoteThread.status;
        if (liveStatus === "launching")
          return json({ error: { code: "conflict", message: "Thread is launching." } }, 409);
        const shellId = crypto.randomUUID();
        const currentProject = await resolveProject();
        const shellLocation = resolveProjectLocation(
          currentProject.location,
          remoteThread.worktreePath,
        );
        let output = "";
        try {
          await input.client.startShell({ shellId, projectLocation: shellLocation });
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
        const done = new Promise<void>((resolve) => {
          pendingShellExits.set(shellId, resolve);
        });
        const timer = setTimeout(() => {
          pendingShellTimeouts.add(shellId);
          pendingShellExits.get(shellId)?.();
        }, 120_000);
        try {
          input.watchTerminal?.(shellId, (data) => {
            output += data;
          });
          await input.client.writeTerminal({ threadId: shellId, data: `${command}\r` });
          await input.client.writeTerminal({ threadId: shellId, data: "exit\r" });
          await done;
        } finally {
          clearTimeout(timer);
          pendingShellExits.delete(shellId);
          input.unwatchTerminal?.(shellId);
          input.client.closeShell({ threadId: shellId }).catch(() => {});
        }
        const timedOut = pendingShellTimeouts.has(shellId);
        pendingShellTimeouts.delete(shellId);
        let text = stripAnsiPreservingLayout(output);
        const cap = 64 * 1024;
        if (text.length > cap) text = text.slice(-cap);
        if (timedOut) text += "\n[timed out]";
        // A synthetic completed bash part — TUI-local, the host transcript
        // doesn't get it.
        const messageID = `msg_shell-${crypto.randomUUID()}`;
        input.events.emit(
          openCodeEvent(
            "session.tool.success",
            {
              sessionID: shellSession,
              assistantMessageID: messageID,
              id: `part_${crypto.randomUUID()}`,
              content: [{ type: "text", text }],
              executed: true,
            },
            {
              location: { directory: input.bootstrap.directory },
              durable: { aggregateID: messageID, seq: 1, version: 2 },
            },
          ),
        );
        // One-shot context hand-off: the next real prompt carries the output.
        const stash = shellStash.get(shellSession) ?? [];
        stash.push({ command, output: text });
        shellStash.set(shellSession, stash.slice(-3));
        return new Response(null, { status: 204 });
      }
      if (path === "/api/shell" && method === "POST") {
        return json(
          {
            error: {
              code: "unsupported",
              message: "Start shells from a prompt with !command.",
            },
          },
          501,
        );
      }
      const shellGetMatch = path.match(/^\/api\/shell\/([^/]+)$/u);
      if (shellGetMatch && method === "GET") {
        const hit = taskFor(decodeURIComponent(shellGetMatch[1]!));
        if (!hit) return json({ error: { code: "not_found", message: "Shell not found" } }, 404);
        const currentProject = await resolveProject();
        return json({
          location: requestLocation(url),
          data: shellInfoFor(hit.rawThreadId, hit.task, directoryOf(currentProject.location)),
        });
      }
      const shellOutputMatch = path.match(/^\/api\/shell\/([^/]+)\/output$/u);
      if (shellOutputMatch && method === "GET") {
        const hit = taskFor(decodeURIComponent(shellOutputMatch[1]!));
        if (!hit) return json({ error: { code: "not_found", message: "Shell not found" } }, 404);
        const bytes = new TextEncoder().encode(String(hit.task.progress ?? ""));
        const cursor = Math.max(0, Number(url.searchParams.get("cursor") ?? 0) || 0);
        const limit = Math.max(1, Number(url.searchParams.get("limit") ?? 64 * 1024) || 0);
        const output = bytes.slice(cursor, cursor + limit);
        const end = cursor + output.length;
        return json({
          location: requestLocation(url),
          data: {
            output: new TextDecoder().decode(output),
            cursor: end,
            size: bytes.length,
            truncated: end < bytes.length,
          },
        });
      }
      const shellRemoveMatch = path.match(/^\/api\/shell\/([^/]+)$/u);
      if (shellRemoveMatch && method === "DELETE") {
        const hit = taskFor(decodeURIComponent(shellRemoveMatch[1]!));
        if (!hit) return json({ error: { code: "not_found", message: "Shell not found" } }, 404);
        const stopAction = record(hit.task.stopAction);
        if (typeof stopAction.id !== "string")
          return json(
            {
              error: {
                code: "conflict",
                message: "This background task can't be stopped from the TUI.",
              },
            },
            409,
          );
        await input.client.callRemoteProcedure("invokeThreadSessionAction", {
          threadId: hit.rawThreadId,
          actionId: stopAction.id,
          payload: stopAction.payload,
        });
        return new Response(null, { status: 204 });
      }
      const sessionMoveMatch = path.match(/^\/api\/session\/([^/]+)\/move$/u);
      if (sessionMoveMatch && method === "POST") {
        const moveSession = decodeURIComponent(sessionMoveMatch[1]!);
        const rawId = threadId(moveSession);
        const body = record(await readRequestBody());
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
        const listed = (
          Array.isArray(worktreesResult.worktrees) ? worktreesResult.worktrees : []
        ).map((entry) => record(entry));
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
      if (path === "/api/command" && method === "GET") {
        const providerID =
          ctx.activeProviderID ??
          [...sessions.values()].reverse().find((session) => session.providerID)?.providerID ??
          ctx.defaultModel?.providerID;
        if (!providerID)
          return json({
            location: requestLocation(url),
            data: [],
          } satisfies CommandListOutput);
        try {
          const commands = await input.client.agentSlashCommands(providerID);
          const data: CommandListOutput["data"] = commands.commands.map((command) => ({
            name: command.id,
            ...(command.description ? { description: command.description } : {}),
          }));
          return json({ location: requestLocation(url), data });
        } catch {
          return json({
            location: requestLocation(url),
            data: [],
          } satisfies CommandListOutput);
        }
      }
      if (/\/api\/(file\/find|vcs|worktree|command|skill|mcp|reference|shell)/u.test(path)) {
        return json({ location: requestLocation(url), data: [] });
      }
      if (path === "/api/config" && method === "GET") {
        const output: ConfigGetOutput = [];
        return json(output);
      }
      if (path === "/api/form" && method === "GET") {
        const output: FormListOutput = {
          location: requestLocation(url),
          data: [],
        };
        return json(output);
      }
      if (path === "/api/experimental/migration/v1" && method === "GET") {
        const output: MigrationV1StatusOutput = { status: "completed" };
        return json(output);
      }
    } catch (error) {
      await logAdapterError({
        home: input.bootstrap.home,
        method,
        route: path,
        responseStatus: 500,
        input: inputSummary,
        error,
      }).catch(() => undefined);
      return json(
        {
          error: {
            code: "adapter_error",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        500,
      );
    }
    await logAdapterError({
      home: input.bootstrap.home,
      method,
      route: path,
      responseStatus: 404,
      input: inputSummary,
      error: new Error("Route not found"),
    });
    return json({ error: { code: "not_found", message: "Route not found" } }, 404);
  };

  // PORACODE_TUI_DEBUG=1: one debug line per adapter request (method, route
  // with ids elided, status, duration).
  const handle = async (request: Request): Promise<Response> => {
    const started = Date.now();
    const response = await handleRequest(request);
    if (ctx.debug)
      void logAdapterDebug(input.bootstrap.home, {
        source: "request",
        method: request.method,
        // Route shape, not masked segments — literal words stay, id-like
        // segments become ":id" (/api/session/:id/prompt).
        path: new URL(request.url).pathname.replace(/[^/]+/gu, (segment) =>
          /^[a-z-]+$/u.test(segment) ? segment : ":id",
        ),
        status: response.status,
        ms: Date.now() - started,
      });
    return response;
  };

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
  const sessionOptions = async (session: string) => {
    const current = sessions.get(session);
    const remote = (await listThreads()).find((value) => value.id === threadId(session));
    const status = (await agentStatuses()).find(
      (value) => value.kind === (current?.providerID ?? remote?.agentKind ?? ctx.activeProviderID),
    );
    const caps = status?.capabilities.presentationCapabilities?.gui ?? status?.capabilities;
    const model = current?.model ?? remote?.config.model;
    const fastModels = caps?.fastModels ?? status?.capabilities.fastModels ?? [];
    const thinkingModels = caps?.thinkingModels ?? status?.capabilities.thinkingModels ?? [];
    return {
      approvalPolicies: (caps?.approvalPolicies ??
        status?.capabilities.approvalPolicies ??
        []) as readonly { id: string; label: string }[],
      sandboxModes: (caps?.sandboxModes ?? status?.capabilities.sandboxModes ?? []) as readonly {
        id: string;
        label: string;
      }[],
      fast: {
        offered: model !== undefined && fastModels.includes(model),
        disabledReason: caps?.fastDisabledReason ?? status?.capabilities.fastDisabledReason,
      },
      thinking: { offered: model !== undefined && thinkingModels.includes(model) },
      contextSizes: (caps?.contextSizes ?? status?.capabilities.contextSizes ?? []) as readonly {
        id: string;
        label: string;
      }[],
      defaults: {
        approvalPolicy: caps?.defaultApprovalPolicy ?? status?.capabilities.defaultApprovalPolicy,
        sandboxMode: caps?.defaultSandboxMode ?? status?.capabilities.defaultSandboxMode,
      },
    };
  };

  const setSessionOptions = async (
    session: string,
    choice: {
      approvalPolicy?: string;
      sandboxMode?: string;
      fast?: boolean;
      thinking?: boolean;
      contextSize?: string;
    },
  ) => {
    const current = sessions.get(session);
    const offered = await sessionOptions(session);
    if (
      choice.approvalPolicy &&
      offered.approvalPolicies.length > 0 &&
      !offered.approvalPolicies.some((option) => option.id === choice.approvalPolicy)
    )
      return { error: `Unknown approval policy: ${choice.approvalPolicy}`, status: 400 };
    if (
      choice.sandboxMode &&
      offered.sandboxModes.length > 0 &&
      !offered.sandboxModes.some((option) => option.id === choice.sandboxMode)
    )
      return { error: `Unknown sandbox mode: ${choice.sandboxMode}`, status: 400 };
    if (choice.fast !== undefined && !offered.fast.offered)
      return { error: "Fast mode is not offered for this session's model", status: 400 };
    if (choice.thinking !== undefined && !offered.thinking.offered)
      return {
        error: "Thinking mode is not offered for this session's model",
        status: 400,
      };
    if (
      choice.contextSize &&
      offered.contextSizes.length > 0 &&
      !offered.contextSizes.some((option) => option.id === choice.contextSize)
    )
      return { error: `Unknown context size: ${choice.contextSize}`, status: 400 };
    if (!current) return { error: "Unknown session", status: 404 };
    const updated = {
      ...current,
      ...(choice.approvalPolicy ? { approvalPolicy: choice.approvalPolicy } : {}),
      ...(choice.sandboxMode ? { sandboxMode: choice.sandboxMode } : {}),
      ...(choice.fast !== undefined ? { fast: choice.fast } : {}),
      ...(choice.thinking !== undefined ? { thinking: choice.thinking } : {}),
      ...(choice.contextSize ? { contextSize: choice.contextSize } : {}),
    };
    sessions.set(session, updated);
    await persistLastModel({
      ...(updated.providerID ? { provider: updated.providerID } : {}),
      ...(updated.model ? { model: updated.model } : {}),
      ...(updated.effort ? { effort: updated.effort } : {}),
      ...(updated.fast !== undefined ? { fast: updated.fast } : {}),
      ...(updated.thinking !== undefined ? { thinking: updated.thinking } : {}),
      ...(updated.contextSize ? { contextSize: updated.contextSize } : {}),
      ...(choice.approvalPolicy ? { approvalPolicy: choice.approvalPolicy } : {}),
      ...(choice.sandboxMode ? { sandboxMode: choice.sandboxMode } : {}),
    });
    return { ok: true as const };
  };

  // exportSession assembles a full transcript through the existing history
  // projection — every bounded page — in the SessionTransferData shape the
  // generated client expects.
  const exportSession = async (session: string, remoteThread?: Thread) => {
    const thread =
      remoteThread ?? (await guiThreads()).find((value) => value.id === threadId(session));
    if (!thread) throw new Error(`Unknown session: ${session}`);
    await input.setThreadInterests([thread.id]);
    const messages = [];
    let cursor: string | undefined;
    while (true) {
      const page = await historyMessagePage(thread, 100, cursor, async (beforePosition, pageSize) =>
        input.client.threadRuntimeItemsPage({
          threadId: thread.id,
          ...(beforePosition !== undefined ? { beforePosition } : {}),
          limit: pageSize,
          targetTimelineEntryCount: 100,
        }),
      );
      messages.push(...page.data);
      if (page.cursor.next === null) break;
      cursor = page.cursor.next;
    }
    const currentProject = await resolveProject();
    return { info: toSession(thread, currentProject), messages };
  };

  // offeredProviders lists installed GUI providers with their first enabled
  // model so the plugin's switch command can create a bound session.
  const offeredProviders = async () =>
    (await agentStatuses())
      .filter(supportsGui)
      .filter(
        (status) => (status.presentationAuthStates?.gui ?? status.authState) === "authenticated",
      )
      .map((status) => {
        const caps = status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
        return {
          id: status.kind,
          label: status.label,
          model: caps.models?.[0]?.id ?? status.capabilities.models?.[0]?.id,
        };
      });

  // threadFlags reads the cached thread metadata (star/done) for the plugin's
  // toggle commands; a cache miss refreshes through the thread list once.
  const threadFlags = async (session: string) => {
    const rawId = threadId(session);
    let thread = threadCache.get(rawId);
    if (!thread) thread = (await listThreads()).find((value) => value.id === rawId);
    if (!thread) return undefined;
    return { starred: Boolean(thread.starred), done: Boolean(thread.done) };
  };
  const setStarred = async (session: string, starred: boolean) => {
    await input.client.sendThreadCommand({
      kind: "set-starred",
      threadId: threadId(session),
      starred,
    });
    await listThreads();
    return threadFlags(session);
  };
  const setDone = async (session: string, done: boolean) => {
    await input.client.sendThreadCommand({
      kind: "set-done",
      threadId: threadId(session),
      done,
    });
    await listThreads();
    return threadFlags(session);
  };

  // A paused follow-up queue means a desktop user is editing an item;
  // resumeThreadFollowUps unpauses it. Report whether anything resumed.
  const resumeQueue = async (session: string) => {
    const rawId = threadId(session);
    await seedInbox(rawId);
    const entry = inboxEntry(rawId);
    if (!entry.paused) return { resumed: false as const };
    await input.client.callRemoteProcedure("resumeThreadFollowUps", { threadId: rawId });
    entry.paused = false;
    return { resumed: true as const };
  };

  // Side chat — a hidden GUI child thread that inherits the source thread's
  // project/provider/config, painted with the question only; the transcript
  // rides privately in clientContext.conversationSnapshot.
  const startSideChat = async (sessionID: string, question: string) => {
    const remoteThread = await visibleThread(threadId(sessionID));
    if (!remoteThread) throw new Error("Session not found");
    const currentProject = await resolveProject();
    const tail = (text: string) => {
      const plain = stripAnsiPreservingLayout(text);
      return plain.length > 6000 ? `[output truncated]\n${plain.slice(-6000)}` : plain;
    };
    const rows: string[] = [];
    for (const item of await listThreadItems(remoteThread.id)) {
      if (item.parentItemId) continue; // top-level only
      if (item.type === "user_message") {
        const text = String(record(item.payload).text ?? record(item.payload).prompt ?? "");
        if (text.trim()) rows.push(`User: ${tail(text)}`);
      } else if (item.type === "assistant_message") {
        const text = assistantDisplayText(item) ?? String(record(item.payload).text ?? "");
        if (text.trim()) rows.push(`Assistant: ${tail(text)}`);
      }
    }
    const transcript = rows.join("\n\n");
    const launched = sideChatLaunchInput(
      question,
      [{ kind: "text", content: question }],
      transcript || undefined,
    );
    const host =
      typeof input.client.describeHost === "function"
        ? await input.client.describeHost().catch(() => ({}))
        : {};
    const supportsMetadata = hostSupportsThreadLaunchMetadata(
      record(record(host).capabilities).threadLaunchMetadata as
        | { readonly versions: readonly number[] }
        | undefined,
    );
    const childId = crypto.randomUUID();
    await input.client.startNewThread({
      threadId: childId,
      projectId: currentProject.id,
      agentKind: remoteThread.agentKind,
      config: remoteThread.config,
      prompt: launched.prompt,
      segments: launched.segments,
      presentationMode: "gui",
      title: `Side chat · ${question.slice(0, 40)}`,
      ...(remoteThread.worktreePath ? { worktreePath: remoteThread.worktreePath } : {}),
      ...(remoteThread.worktreeBranch ? { worktreeBranch: remoteThread.worktreeBranch } : {}),
      ...(launched.clientContext ? { clientContext: launched.clientContext } : {}),
      ...(supportsMetadata ? { parentThreadId: remoteThread.id } : {}),
    });
    return sessionId(childId);
  };
  // Installed GUI providers that aren't authenticated — the login hint's
  // candidates. agentStatuses already honors the Windows/WSL selection.
  const loginCandidates = async () =>
    (await agentStatuses())
      .filter((status) => supportsGui(status) && !hasGuiAuthentication(status))
      .map((status) => ({
        kind: status.kind,
        label: record(status).label ?? status.kind,
        ...(typeof record(status).wslDistro === "string"
          ? { wslDistro: String(record(status).wslDistro) }
          : {}),
      }));
  // Provider usage & limits — the host polls providers on their own cadence;
  // an unsupported host or a failed collect surfaces as undefined.
  const providerUsage = async () => {
    try {
      return await input.client.providerUsage?.();
    } catch {
      return undefined;
    }
  };
  // this project's archived GUI threads — pages through the host list the
  // same way the session list does (archived threads age off the first page).
  const archivedThreads = async () => {
    const currentProject = await resolveProject();
    const statusList = await statusListNow();
    const output: Thread[] = [];
    let continuation: { cursor: string; after: unknown } | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await threadListPage(continuation);
      for (const thread of result.threads)
        if (
          isGuiThread(thread, statusList) &&
          thread.projectId === currentProject.id &&
          thread.archived
        )
          output.push(thread);
      continuation = result.next;
      if (!continuation) break;
    }
    return output;
  };
  // Provider session actions — the host exposes per-thread actions a client
  // can invoke (listThreadSessionActions / invokeThreadSessionAction). An
  // unsupported host or error surfaces as an empty list / thrown error.
  const sessionActions = async (sessionID: string) => {
    if (parseSubSessionId(sessionID)) return [];
    const result = await input.client
      .callRemoteProcedure("listThreadSessionActions", { threadId: threadId(sessionID) })
      .catch(() => null);
    const actions = record(result).actions;
    if (!Array.isArray(actions)) return [];
    return actions
      .map((value) => record(value))
      .filter((entry) => typeof entry.id === "string")
      .map((entry) => ({ id: String(entry.id) }));
  };
  const invokeSessionAction = async (sessionID: string, actionId: string) => {
    if (parseSubSessionId(sessionID)) throw new Error("Subagent transcripts are read-only.");
    return input.client.callRemoteProcedure("invokeThreadSessionAction", {
      threadId: threadId(sessionID),
      actionId,
      payload: {},
    });
  };
  return {
    handle,
    handleRemoteEvent,
    sessionOptions,
    setSessionOptions,
    exportSession,
    offeredProviders,
    threadFlags,
    setStarred,
    setDone,
    resumeQueue,
    goalState,
    controlGoal,
    subscribeGoal,
    goalLine,
    goalSupported,
    sendPrompt,
    sessionActions,
    invokeSessionAction,
    archivedThreads,
    providerUsage,
    startSideChat,
    loginCandidates,
    disposeSubagentSubscriptions,
  };
}
