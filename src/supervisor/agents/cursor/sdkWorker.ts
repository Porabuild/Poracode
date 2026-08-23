#!/usr/bin/env node

/**
 * Isolated runtime for a user-installed `@cursor/sdk`.
 *
 * This entry is built as a self-contained ESM helper and can run either next
 * to the native supervisor or after being staged into WSL. The SDK itself is
 * never bundled: discovery and dynamic import happen in this process, where
 * platform-specific optional packages and the target login-shell environment
 * are valid.
 */
import { createInterface } from "node:readline";
import type {
  CursorSdkInteractionUpdate,
  CursorSdkMessage,
  CursorSdkRunResult,
} from "./sdkProtocol";
import {
  CURSOR_SDK_WORKER_PROTOCOL_VERSION,
  type CursorSdkWorkerAgentMessage,
  type CursorSdkWorkerEvent,
  type CursorSdkWorkerInitializeParams,
  type CursorSdkWorkerInitializeResult,
  type CursorSdkWorkerModelsListParams,
  type CursorSdkWorkerProbeResult,
  type CursorSdkWorkerRequest,
  type CursorSdkWorkerSendOptions,
  type CursorSdkWorkerStartInput,
  type CursorSdkWorkerStartResult,
  type CursorSdkWorkerWireMessage,
} from "./sdkWorkerProtocol";
import {
  asWorkerRecord,
  CursorSdkWorkerDiagnostics,
  WorkerDiagnosticError,
} from "./sdkWorkerDiagnostics";
import {
  CursorSdkWorkerRuntime,
  disposeCursorSdkAgent,
  openCursorSdkAgent,
  type RuntimeAgent,
  type RuntimeRun,
} from "./sdkWorkerRuntime";
import { probeCursorSdkAccountEmail } from "./sdkAccount";

// stdout is a protocol channel, while provider-native console output can carry
// credentials or arbitrary non-JSON text. SDK failures are returned through
// sanitized RPC errors, so suppress console output before importing the
// external package.
for (const method of ["log", "info", "debug", "warn", "error"] as const) {
  console[method] = () => undefined;
}

interface ActiveRun {
  requestId: string;
  run: RuntimeRun;
}

const sdkRuntime = new CursorSdkWorkerRuntime();
const diagnostics = new CursorSdkWorkerDiagnostics();
let agent: RuntimeAgent | undefined;
let agentCwd: string | undefined;
let activeRun: ActiveRun | undefined;
let startInFlight = false;
let disposed = false;
const workerMethods = new Set([
  "initialize",
  "start",
  "cancel",
  "reload",
  "messages.list",
  "models.list",
  "dispose",
]);

const readline = createInterface({
  input: process.stdin,
  crlfDelay: Number.POSITIVE_INFINITY,
});

emit({
  type: "ready",
  protocolVersion: CURSOR_SDK_WORKER_PROTOCOL_VERSION,
});

readline.on("line", (line) => {
  if (!line.trim()) return;
  void handleLine(line);
});

readline.on("close", () => {
  void disposeRuntime();
});

async function handleLine(line: string): Promise<void> {
  let request: CursorSdkWorkerRequest;
  try {
    request = parseRequest(line);
  } catch {
    // A malformed line has no trustworthy request id, so it cannot receive a
    // correlated response. Keep the worker alive for subsequent valid input.
    return;
  }

  try {
    const result = await dispatch(request);
    respondOk(request.id, result);
  } catch (error) {
    respondError(request.id, error);
  }
}

async function dispatch(request: CursorSdkWorkerRequest): Promise<unknown> {
  if (disposed && request.method !== "dispose") {
    throw new WorkerDiagnosticError("worker_disposed", "The Cursor SDK worker is disposed.");
  }

  switch (request.method) {
    case "initialize":
      return initialize(request.params);
    case "start":
      return startRun(request.id, request.params);
    case "cancel":
      return cancelRun(request.params.runId);
    case "reload":
      await requireAgent().reload();
      return {};
    case "messages.list":
      return listMessages(request.params);
    case "models.list":
      return listModels(request.params);
    case "dispose":
      await disposeRuntime();
      return {};
  }
}

async function initialize(
  params: CursorSdkWorkerInitializeParams,
): Promise<CursorSdkWorkerInitializeResult> {
  if (agent) {
    throw new WorkerDiagnosticError(
      "already_initialized",
      "The Cursor SDK worker already owns an agent.",
    );
  }
  diagnostics.rememberSecret(params.apiKey);
  diagnostics.rememberMcpSecrets(params.createOptions.mcpServers);
  const cwd = firstCwd(params.createOptions.local.cwd);
  const loaded = await sdkRuntime.load(params.sdk, cwd, params.apiKey);
  agentCwd = cwd;
  const options = {
    ...params.createOptions,
    ...(params.apiKey ? { apiKey: params.apiKey } : {}),
  };
  const opened = await openCursorSdkAgent(loaded, options, params.resumeAgentId);
  agent = opened.agent;
  if (!agent || typeof agent.agentId !== "string" || !agent.agentId) {
    agent = undefined;
    throw new WorkerDiagnosticError(
      "module_api_incompatible",
      "The installed Cursor SDK returned an invalid agent handle.",
    );
  }
  return {
    agentId: agent.agentId,
    ...(agent.model ? { model: agent.model } : {}),
    ...(opened.recoveredExisting ? { recoveredExisting: true } : {}),
  };
}

async function startRun(
  requestId: string,
  input: CursorSdkWorkerStartInput,
): Promise<CursorSdkWorkerStartResult> {
  if (activeRun || startInFlight) {
    throw new WorkerDiagnosticError(
      "agent_busy",
      "The Cursor SDK agent already has an active run.",
    );
  }
  const currentAgent = requireAgent();
  diagnostics.rememberMcpSecrets(input.options?.mcpServers);
  startInFlight = true;
  const bufferedDeltas: unknown[] = [];
  let runId: string | undefined;
  try {
    const options: CursorSdkWorkerSendOptions & {
      onDelta: (args: { update: unknown }) => void;
    } = {
      ...(input.options ?? {}),
      onDelta: ({ update }) => {
        const transportUpdate = sanitizeInteractionUpdate(update);
        if (runId) {
          emitRunEvent({
            type: "delta",
            requestId,
            runId,
            update: transportUpdate,
          });
        } else {
          bufferedDeltas.push(transportUpdate);
        }
      },
    };
    const run = await currentAgent.send(input.message, options);
    if (!run || typeof run.id !== "string" || !run.id) {
      throw new WorkerDiagnosticError(
        "module_api_incompatible",
        "The installed Cursor SDK returned an invalid run handle.",
      );
    }
    runId = run.id;
    activeRun = { requestId, run };
    for (const update of bufferedDeltas) {
      emitRunEvent({
        type: "delta",
        requestId,
        runId,
        update: update as CursorSdkInteractionUpdate,
      });
    }
    void pumpRun(activeRun);
    return { runId };
  } finally {
    startInFlight = false;
  }
}

/**
 * The SDK redundantly echoes prompt images in `user-message-appended`. The
 * host only consumes the echoed text, and forwarding base64 attachments can
 * needlessly exceed the bounded JSON-lines transport after SDK acceptance.
 */
function sanitizeInteractionUpdate(update: unknown): CursorSdkInteractionUpdate {
  const candidate = update as CursorSdkInteractionUpdate;
  if (candidate?.type !== "user-message-appended") return candidate;
  return {
    type: "user-message-appended",
    userMessage: {
      type: "user_message",
      session_id: candidate.userMessage.session_id,
      text: candidate.userMessage.text,
    },
  };
}

async function pumpRun(active: ActiveRun): Promise<void> {
  const { requestId, run } = active;
  try {
    for await (const message of run.stream()) {
      emitRunEvent({
        type: "message",
        requestId,
        runId: run.id,
        message: message as CursorSdkMessage,
      });
    }
    const result = await run.wait();
    emitRunEvent({
      type: "result",
      requestId,
      runId: run.id,
      result: diagnostics.sanitizeRunResult(result as CursorSdkRunResult),
    });
  } catch (error) {
    emitRunEvent({
      type: "run-error",
      requestId,
      runId: run.id,
      error: diagnostics.serializeError(error),
    });
  } finally {
    if (activeRun?.run === run) activeRun = undefined;
  }
}

async function cancelRun(requestedRunId?: string): Promise<{ cancelled: boolean }> {
  const active = activeRun;
  if (!active) return { cancelled: false };
  if (requestedRunId && requestedRunId !== active.run.id) {
    throw new WorkerDiagnosticError(
      "run_not_active",
      `Run ${requestedRunId} is not the active Cursor SDK run.`,
    );
  }
  await active.run.cancel();
  return { cancelled: true };
}

async function listMessages(input: {
  limit?: number;
  offset?: number;
}): Promise<CursorSdkWorkerAgentMessage[]> {
  const currentAgent = requireAgent();
  const cwd = currentAgentCwd();
  return sdkRuntime.module!.Agent.messages.list(currentAgent.agentId, {
    runtime: "local",
    cwd,
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.offset !== undefined ? { offset: input.offset } : {}),
  });
}

async function listModels(
  input: CursorSdkWorkerModelsListParams,
): Promise<CursorSdkWorkerProbeResult> {
  diagnostics.rememberSecret(input.apiKey);
  const loaded =
    sdkRuntime.module ?? (await sdkRuntime.load(input.sdk, input.projectCwd, input.apiKey));
  const models = await loaded.Cursor.models.list(
    input.apiKey ? { apiKey: input.apiKey } : undefined,
  );
  const authenticatedAs = await probeCursorSdkAccountEmail(loaded.Cursor, input.apiKey);
  return {
    models,
    ...sdkRuntime.metadata,
    ...(authenticatedAs ? { authenticatedAs } : {}),
  };
}

async function disposeRuntime(): Promise<void> {
  if (disposed) return;
  disposed = true;
  const run = activeRun?.run;
  activeRun = undefined;
  if (run) {
    try {
      await run.cancel();
    } catch {
      // Best effort: close the agent even if the already-terminal run rejects.
    }
  }
  const currentAgent = agent;
  agent = undefined;
  agentCwd = undefined;
  if (currentAgent) {
    await disposeCursorSdkAgent(currentAgent);
  }
}

function requireAgent(): RuntimeAgent {
  if (!agent) {
    throw new WorkerDiagnosticError(
      "not_initialized",
      "Initialize the Cursor SDK worker before using an agent operation.",
    );
  }
  return agent;
}

function currentAgentCwd(): string {
  return agentCwd ?? process.cwd();
}

function firstCwd(cwd: string | string[]): string {
  return Array.isArray(cwd) ? (cwd[0] ?? process.cwd()) : cwd;
}

function parseRequest(line: string): CursorSdkWorkerRequest {
  const parsed: unknown = JSON.parse(line);
  const record = asWorkerRecord(parsed);
  if (
    record?.type !== "request" ||
    typeof record.id !== "string" ||
    typeof record.method !== "string" ||
    !workerMethods.has(record.method) ||
    !asWorkerRecord(record.params)
  ) {
    throw new WorkerDiagnosticError("protocol_error", "Invalid Cursor SDK worker request.");
  }
  return parsed as CursorSdkWorkerRequest;
}

function respondOk(id: string, result: unknown): void {
  emit({ type: "response", id, ok: true, result: diagnostics.sanitizePayload(result) });
}

function respondError(id: string, error: unknown): void {
  emit({ type: "response", id, ok: false, error: diagnostics.serializeError(error) });
}

function emitRunEvent(event: CursorSdkWorkerEvent): void {
  emit({ type: "event", event: diagnostics.sanitizePayload(event) });
}

function emit(message: CursorSdkWorkerWireMessage): void {
  process.stdout.write(`${safeStringify(message)}\n`);
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, candidate: unknown) => {
    if (typeof candidate === "bigint") return candidate.toString();
    if (candidate && typeof candidate === "object") {
      if (seen.has(candidate)) return "[Circular]";
      seen.add(candidate);
    }
    return candidate;
  });
}
