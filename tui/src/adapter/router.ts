import type { OpenCodeEvent, PermissionReply } from "@opencode/client";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { TUI_LAST_MODEL_VERSION } from "@/shared/tuiBootstrap";
import type { TuiBootstrap } from "../bootstrap";
import { EventStreamHub, type ThreadEventContext } from "./events";
import { createRouterState } from "./router/state";
import { createRevert, handleRevertRoutes } from "./router/revert";
import { createInbox, handleInboxRoutes } from "./router/inbox";
import { createGoals } from "./router/goals";
import { createCheckpoints } from "./router/checkpoints";
import { createShells, handleShellRoutes } from "./router/shells";
import { createSubagents } from "./router/subagents";
import { createTitles } from "./router/titles";
import { createCatalog } from "./router/catalog";
import { createThreads } from "./router/threads";
import { createRequests, handleRequestRoutes } from "./router/requests";
import { createPrompt } from "./router/prompt";
import type { RouteArgs, RouterContext } from "./router/context";
import { handleMetaRoutes } from "./router/routes/meta";
import { handleCatalogRoutes } from "./router/routes/catalog";
import { handleFileRoutes } from "./router/routes/files";
import { handleSessionRoutes } from "./router/routes/sessions";
import { handlePromptRoutes } from "./router/routes/prompts";
import { handleFallbackRoutes } from "./router/routes/fallback";
import { createRemoteEvents } from "./router/remoteEvents";
import { createFacade } from "./router/facade";
import { json, record } from "./router/helpers";
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
  Object.assign(ctx, createRemoteEvents(ctx));
  Object.assign(ctx, createFacade(ctx));
  const {
    goalState,
    controlGoal,
    subscribeGoal,
    goalSupported,
    goalLine,
    disposeSubagentSubscriptions,
    sendPrompt,
    handleRemoteEvent,
    sessionOptions,
    setSessionOptions,
    exportSession,
    offeredProviders,
    threadFlags,
    setStarred,
    setDone,
    resumeQueue,
    sessionActions,
    invokeSessionAction,
    archivedThreads,
    providerUsage,
    startSideChat,
    loginCandidates,
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
      const args: RouteArgs = {
        ctx,
        request,
        url,
        method,
        path,
        readBody: readRequestBody,
        inputSummary: () => inputSummary,
      };
      const response =
        (await handleMetaRoutes(args)) ??
        (await handleCatalogRoutes(args)) ??
        (await handleFileRoutes(args)) ??
        (await handleSessionRoutes(args)) ??
        (await handleInboxRoutes(args)) ??
        (await handlePromptRoutes(args)) ??
        (await handleRequestRoutes(args)) ??
        (await handleRevertRoutes(args)) ??
        (await handleShellRoutes(args)) ??
        (await handleFallbackRoutes(args));
      if (response !== undefined) return response;
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
