import * as acp from "@agentclientprotocol/sdk/unstable";
import type { AnyMessage, Stream } from "@agentclientprotocol/sdk/unstable";

/**
 * Poracode's client side of an ACP connection.
 *
 * `@agentclientprotocol/sdk` 2.0 removed the `ClientSideConnection` class this
 * stack was built on. That class was a thin wrapper that gave every agent the
 * same wire behaviour, and that behaviour is worth keeping exactly: it is what
 * agents in the wild, old or current, have been talking to. This module
 * rebuilds it on the 2.x app API:
 *
 * - Known client methods are typed handlers, so params are validated against
 *   the SDK schema before our handlers run and unknown fields are stripped, as
 *   they always were. A known method without an implementation answers `{}` or
 *   an empty result and is never routed to the extension handlers.
 * - Any other request goes to `extMethod`, or is answered "method not found";
 *   any other notification goes to `extNotification`, or is ignored.
 * - Responses come back as sent.
 *
 * Three things differ in 2.x and are handled here so the wire behaviour stays
 * the same; each is documented at its rule:
 * - `DELIVERED_SESSION_UPDATE_KINDS`: six update kinds the 1.x schema dropped.
 * - `relaxLegacyClientRequest`: seven optional params the 1.x schema tolerated.
 * - The legacy file-type `plan_update` is rejected by 2.x. The 1.x SDK
 *   delivered it and the canonical mapper never rendered it, so it is allowed
 *   to disappear.
 *
 * One difference is accepted: `session/close` and `session/delete` that the
 * agent answers with `-32002` (session not found) now resolve instead of
 * rejecting. The 2.x SDK applies this and offers no way to opt out.
 *
 * `clientWireCompat.test.ts` holds this to a recording made against the 1.x SDK.
 */

/** The handler surface Poracode implements for an agent: the SDK 1.x `Client` interface, removed in 2.0. */
export interface AcpClientHandlers {
  requestPermission(
    params: acp.RequestPermissionRequest,
  ): acp.MaybePromise<acp.RequestPermissionResponse>;
  sessionUpdate(params: acp.SessionNotification): acp.MaybePromise<void>;
  writeTextFile?(
    params: acp.WriteTextFileRequest,
  ): acp.MaybePromise<acp.WriteTextFileResponse | void>;
  readTextFile?(params: acp.ReadTextFileRequest): acp.MaybePromise<acp.ReadTextFileResponse>;
  createTerminal?(params: acp.CreateTerminalRequest): acp.MaybePromise<acp.CreateTerminalResponse>;
  terminalOutput?(params: acp.TerminalOutputRequest): acp.MaybePromise<acp.TerminalOutputResponse>;
  releaseTerminal?(
    params: acp.ReleaseTerminalRequest,
  ): acp.MaybePromise<acp.ReleaseTerminalResponse | void>;
  waitForTerminalExit?(
    params: acp.WaitForTerminalExitRequest,
  ): acp.MaybePromise<acp.WaitForTerminalExitResponse>;
  killTerminal?(params: acp.KillTerminalRequest): acp.MaybePromise<acp.KillTerminalResponse | void>;
  createElicitation?(
    params: acp.CreateElicitationRequest,
  ): acp.MaybePromise<acp.CreateElicitationResponse>;
  completeElicitation?(params: acp.CompleteElicitationNotification): acp.MaybePromise<void>;
  extMethod?(
    method: string,
    params: Record<string, unknown>,
  ): acp.MaybePromise<Record<string, unknown>>;
  extNotification?(method: string, params: Record<string, unknown>): acp.MaybePromise<void>;
}

/** The agent-facing side: the calls Poracode makes on a connected agent (the 1.x `ClientSideConnection` surface in use). */
export interface AcpClientConnection {
  initialize(params: acp.InitializeRequest): Promise<acp.InitializeResponse>;
  newSession(params: acp.NewSessionRequest): Promise<acp.NewSessionResponse>;
  loadSession(params: acp.LoadSessionRequest): Promise<acp.LoadSessionResponse>;
  deleteSession(params: acp.DeleteSessionRequest): Promise<acp.DeleteSessionResponse>;
  resumeSession(params: acp.ResumeSessionRequest): Promise<acp.ResumeSessionResponse>;
  closeSession(params: acp.CloseSessionRequest): Promise<acp.CloseSessionResponse>;
  setSessionMode(params: acp.SetSessionModeRequest): Promise<acp.SetSessionModeResponse>;
  setSessionConfigOption(
    params: acp.SetSessionConfigOptionRequest,
  ): Promise<acp.SetSessionConfigOptionResponse>;
  authenticate(params: acp.AuthenticateRequest): Promise<acp.AuthenticateResponse>;
  logout(params: acp.LogoutRequest): Promise<acp.LogoutResponse>;
  prompt(params: acp.PromptRequest): Promise<acp.PromptResponse>;
  cancel(params: acp.CancelNotification): Promise<void>;
  extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  extNotification(method: string, params: Record<string, unknown>): Promise<void>;
  /** 1.x escape hatch: a raw request by wire method name. */
  request<Response = unknown, Params = unknown>(method: string, params?: Params): Promise<Response>;
  readonly signal: AbortSignal;
  readonly closed: Promise<void>;
}

/** Client methods the 1.x wrapper owned. Never routed to the extension handlers. */
const KNOWN_CLIENT_REQUEST_METHODS = new Set<string>([
  acp.methods.client.session.requestPermission,
  acp.methods.client.fs.writeTextFile,
  acp.methods.client.fs.readTextFile,
  acp.methods.client.terminal.create,
  acp.methods.client.terminal.output,
  acp.methods.client.terminal.release,
  acp.methods.client.terminal.waitForExit,
  acp.methods.client.terminal.kill,
  acp.methods.client.elicitation.create,
]);
const KNOWN_CLIENT_NOTIFICATION_METHODS = new Set<string>([
  acp.methods.client.session.update,
  acp.methods.client.elicitation.complete,
]);

/**
 * The `session/update` kinds the 1.x schema delivered. The 2.x schema also
 * accepts `notice`, `cursor_update`, `prompt_suggestions_update`,
 * `session_message`, `session_message_chunk` and `subagent_update`; the 1.x SDK
 * dropped those before Poracode ever saw them, and some arrive outside a prompt
 * turn, where an unexpected update can open a stray turn. They are still
 * dropped here. Delivering one is a product decision: add it here together
 * with its mapping.
 */
export const DELIVERED_SESSION_UPDATE_KINDS: ReadonlySet<string> = new Set([
  "agent_message_chunk",
  "agent_thought_chunk",
  "available_commands_update",
  "compaction_summary_chunk",
  "compaction_update",
  "config_option_update",
  "current_mode_update",
  "plan",
  "plan_removed",
  "plan_update",
  "session_info_update",
  "tool_call",
  "tool_call_update",
  "usage_update",
  "user_message_chunk",
]);

const isUint32 = (value: unknown): boolean =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4294967295;
const isNonNegativeInteger = (value: unknown): boolean =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;
const isEnvVariable = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) return false;
  const { name, value: envValue } = value as { name?: unknown; value?: unknown };
  return typeof name === "string" && typeof envValue === "string";
};

/**
 * Restore, for exactly the fields where the 1.x schema had it, the tolerance
 * the protocol later removed ("reject malformed values receivers act on"):
 * a wrong-typed optional field was defaulted and invalid array elements were
 * skipped instead of failing the whole request. Derived field by field from a
 * differential of the two generated schemas; no other inbound field changed.
 * A number 1.x accepted for `outputByteLimit` but 2.x rejects (negative or
 * fractional) is dropped rather than passed on.
 */
export function relaxLegacyClientRequest(params: unknown, method: string): unknown {
  if (typeof params !== "object" || params === null || Array.isArray(params)) return params;
  const next: Record<string, unknown> = { ...(params as Record<string, unknown>) };
  if (method === acp.methods.client.fs.readTextFile) {
    for (const key of ["line", "limit"]) {
      const value = next[key];
      if (value !== undefined && value !== null && !isUint32(value)) delete next[key];
    }
    return next;
  }
  if (method === acp.methods.client.terminal.create) {
    if (next.args !== undefined && !Array.isArray(next.args)) next.args = [];
    if (Array.isArray(next.args)) next.args = next.args.filter((arg) => typeof arg === "string");
    if (next.env !== undefined && !Array.isArray(next.env)) next.env = [];
    if (Array.isArray(next.env)) next.env = next.env.filter(isEnvVariable);
    if (next.cwd !== undefined && next.cwd !== null && typeof next.cwd !== "string")
      delete next.cwd;
    if (
      next.outputByteLimit !== undefined &&
      next.outputByteLimit !== null &&
      !isNonNegativeInteger(next.outputByteLimit)
    ) {
      delete next.outputByteLimit;
    }
    return next;
  }
  return params;
}

function withLegacyParamTolerance(stream: Stream): Stream {
  return {
    writable: stream.writable,
    readable: stream.readable.pipeThrough(
      new TransformStream<AnyMessage, AnyMessage>({
        transform(message, controller) {
          if (
            typeof message === "object" &&
            message !== null &&
            "id" in message &&
            typeof (message as { method?: unknown }).method === "string" &&
            "params" in message
          ) {
            const method = (message as { method: string }).method;
            const relaxed = relaxLegacyClientRequest(
              (message as { params?: unknown }).params,
              method,
            );
            if (relaxed !== (message as { params?: unknown }).params) {
              controller.enqueue({ ...message, params: relaxed });
              return;
            }
          }
          controller.enqueue(message);
        },
      }),
    ),
  };
}

/**
 * A request that its caller does not await must not surface as an unhandled
 * rejection when the connection closes. Dropping a request was always safe
 * with the 1.x SDK and callers rely on it: the shared process issues a close
 * it may stop waiting for. 2.x guards only its own response promise, hands
 * back a derived promise for `session/close` and `session/delete`, and rejects
 * pending requests on every close, so an abandoned request would otherwise be
 * reported as unhandled. A caller that awaits still sees the rejection.
 */
function observed<T>(promise: Promise<T>): Promise<T> {
  void promise.catch(() => undefined);
  return promise;
}

/** Connect Poracode's client side to an agent over `stream`. */
export function connectAcpClient(stream: Stream, handlers: AcpClientHandlers): AcpClientConnection {
  const app = acp.client({ name: "poracode" });
  const client = acp.methods.client;
  const agent = acp.methods.agent;
  app
    .onRequest(client.session.requestPermission, (ctx) => handlers.requestPermission(ctx.params))
    .onRequest(
      client.fs.writeTextFile,
      async (ctx) => (await handlers.writeTextFile?.(ctx.params)) ?? {},
    )
    .onRequest(
      client.fs.readTextFile,
      async (ctx) => (await handlers.readTextFile?.(ctx.params)) as acp.ReadTextFileResponse,
    )
    .onRequest(
      client.terminal.create,
      async (ctx) => (await handlers.createTerminal?.(ctx.params)) as acp.CreateTerminalResponse,
    )
    .onRequest(
      client.terminal.output,
      async (ctx) => (await handlers.terminalOutput?.(ctx.params)) as acp.TerminalOutputResponse,
    )
    .onRequest(
      client.terminal.release,
      async (ctx) => (await handlers.releaseTerminal?.(ctx.params)) ?? {},
    )
    .onRequest(
      client.terminal.waitForExit,
      async (ctx) =>
        (await handlers.waitForTerminalExit?.(ctx.params)) as acp.WaitForTerminalExitResponse,
    )
    .onRequest(
      client.terminal.kill,
      async (ctx) => (await handlers.killTerminal?.(ctx.params)) ?? {},
    );
  if (handlers.createElicitation) {
    app.onRequest(client.elicitation.create, (ctx) => handlers.createElicitation!(ctx.params));
  }
  app.onNotification(client.session.update, (ctx) =>
    DELIVERED_SESSION_UPDATE_KINDS.has(ctx.params.update.sessionUpdate)
      ? handlers.sessionUpdate(ctx.params)
      : undefined,
  );
  if (handlers.completeElicitation) {
    app.onNotification(client.elicitation.complete, (ctx) =>
      handlers.completeElicitation!(ctx.params),
    );
  }
  app.onRequest("*", ({ method, params }) => {
    if (KNOWN_CLIENT_REQUEST_METHODS.has(method) || !handlers.extMethod) {
      throw acp.RequestError.methodNotFound(method);
    }
    return handlers.extMethod(method, params as Record<string, unknown>);
  });
  app.onNotification("*", ({ method, params }) =>
    KNOWN_CLIENT_NOTIFICATION_METHODS.has(method)
      ? undefined
      : handlers.extNotification?.(method, params as Record<string, unknown>),
  );
  const connection = app.connect(withLegacyParamTolerance(stream));
  const peer = connection.agent;
  return {
    initialize: (params) => observed(peer.request(agent.initialize, params)),
    authenticate: (params) => observed(peer.request(agent.authenticate, params)),
    logout: (params) => observed(peer.request(agent.logout, params)),
    newSession: (params) => observed(peer.request(agent.session.new, params)),
    loadSession: (params) => observed(peer.request(agent.session.load, params)),
    resumeSession: (params) => observed(peer.request(agent.session.resume, params)),
    closeSession: (params) => observed(peer.request(agent.session.close, params)),
    deleteSession: (params) => observed(peer.request(agent.session.delete, params)),
    setSessionMode: (params) => observed(peer.request(agent.session.setMode, params)),
    setSessionConfigOption: (params) =>
      observed(peer.request(agent.session.setConfigOption, params)),
    prompt: (params) => observed(peer.request(agent.session.prompt, params)),
    cancel: (params) => observed(peer.notify(agent.session.cancel, params)),
    extMethod: (method, params) => observed(peer.request<Record<string, unknown>>(method, params)),
    extNotification: (method, params) => observed(peer.notify(method, params)),
    request: <Response, Params>(method: string, params?: Params) =>
      observed(peer.request<Response>(method, params)),
    get closed() {
      return connection.closed;
    },
    get signal() {
      return connection.signal;
    },
  };
}
