import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport, SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  McpProbeEnvironment,
  McpProbeError,
  McpProbeErrorCode,
  McpProbeResult,
  McpServer,
} from "@/shared/contracts";
import { terminateProcessTree } from "@/shared/processTree";

const MAX_TOOL_PAGES = 100;
const MAX_TOOL_COUNT = 10_000;
const CLEANUP_TIMEOUT_MS = 1_000;

type ProbeTransport = StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport;

interface AuthObservation {
  status?: number;
  scheme?: McpProbeError["authScheme"];
}

function safeMetadata(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const sanitized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  })
    .join("")
    .trim()
    .slice(0, 200);
  return sanitized || undefined;
}

function authSchemeFromChallenge(value: string | null): McpProbeError["authScheme"] {
  if (!value) return "unknown";
  const normalized = value.toLowerCase();
  if (normalized.includes("resource_metadata=") || normalized.includes("resource-metadata=")) {
    return "oauth";
  }
  if (normalized.startsWith("bearer") || normalized.includes(", bearer")) return "bearer";
  return "other";
}

function observedFetch(observation: AuthObservation): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    const challenge = response.headers.get("www-authenticate");
    if (response.status === 401 || (response.status === 403 && challenge !== null)) {
      observation.status = response.status;
      observation.scheme = authSchemeFromChallenge(challenge);
    }
    return response;
  };
}

function createTransport(server: McpServer, observation: AuthObservation): ProbeTransport {
  const transport = server.transport;
  if (transport.type === "stdio") {
    return new StdioClientTransport({
      command: transport.command,
      args: transport.args,
      env: transport.env,
      ...(transport.cwd ? { cwd: transport.cwd } : {}),
      // Probe output must not copy an MCP server's stderr into Poracode logs.
      stderr: "ignore",
    });
  }

  const fetchWithAuthObservation = observedFetch(observation);
  if (transport.type === "http") {
    return new StreamableHTTPClientTransport(new URL(transport.url), {
      requestInit: { headers: transport.headers },
      fetch: fetchWithAuthObservation,
      reconnectionOptions: {
        initialReconnectionDelay: 100,
        maxReconnectionDelay: 500,
        reconnectionDelayGrowFactor: 1.5,
        maxRetries: 0,
      },
    });
  }

  return new SSEClientTransport(new URL(transport.url), {
    requestInit: { headers: transport.headers },
    fetch: fetchWithAuthObservation,
  });
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function closeWithTimeout(client: Client): Promise<void> {
  await settleWithin(
    client.close().catch(() => undefined),
    CLEANUP_TIMEOUT_MS,
  );
}

async function settleWithin(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errorCode(error: unknown): unknown {
  return error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
}

function classifyFailure(
  error: unknown,
  observation: AuthObservation,
  timedOut: boolean,
): McpProbeError {
  if (timedOut || (error instanceof McpError && error.code === ErrorCode.RequestTimeout)) {
    return { code: "timeout", message: "Connection timed out." };
  }

  if (
    error instanceof UnauthorizedError ||
    (error instanceof McpError &&
      /unauthori[sz]ed|authentication required/iu.test(error.message)) ||
    observation.status === 401 ||
    observation.status === 403 ||
    (error instanceof StreamableHTTPError && error.code === 401) ||
    (error instanceof SseError && error.code === 401)
  ) {
    return {
      code: "auth-required",
      message: "Authentication is required.",
      authScheme: observation.scheme ?? "unknown",
    };
  }

  const code = errorCode(error);
  if (code === "ENOENT" || code === "EACCES" || code === "EPERM") {
    return { code: "command-not-found", message: "The server command could not be started." };
  }

  if (
    error instanceof SyntaxError ||
    error instanceof McpError ||
    (error instanceof Error &&
      /invalid|protocol version|does not support tools/iu.test(error.message))
  ) {
    return { code: "protocol-error", message: "The server returned an invalid MCP response." };
  }

  return { code: "connection-failed", message: "Could not connect to the MCP server." };
}

export function unavailableMcpProbeResult(
  code: Exclude<McpProbeErrorCode, "auth-required">,
  environment: McpProbeEnvironment,
  message = "The MCP server probe is unavailable.",
): McpProbeResult {
  return {
    status: "unavailable",
    toolCount: 0,
    latencyMs: 0,
    environment,
    error: { code, message },
  };
}

async function listToolCount(
  client: Client,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<number> {
  if (!client.getServerCapabilities()?.tools) return 0;

  let cursor: string | undefined;
  let count = 0;
  const seenCursors = new Set<string>();
  for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
    const result = await raceWithAbort(
      client.listTools(cursor ? { cursor } : undefined, {
        signal,
        timeout: timeoutMs,
        maxTotalTimeout: timeoutMs,
      }),
      signal,
    );
    count += result.tools.length;
    if (count > MAX_TOOL_COUNT) {
      throw new Error("Invalid tools/list result: too many tools");
    }
    const nextCursor = result.nextCursor;
    if (!nextCursor) return count;
    if (seenCursors.has(nextCursor)) {
      throw new Error("Invalid tools/list result: repeated cursor");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  throw new Error("Invalid tools/list result: too many pages");
}

/**
 * Perform a complete, read-only MCP handshake and tool discovery. The result
 * deliberately contains no command, URL, header, environment, stderr, or raw
 * transport error data, because all of those can contain credentials.
 */
export async function probeMcpServer(
  server: McpServer,
  environment: McpProbeEnvironment,
  externalSignal?: AbortSignal,
): Promise<McpProbeResult> {
  const startedAt = Date.now();
  const observation: AuthObservation = {};
  const client = new Client({ name: "poracode-mcp-probe", version: "1.0.0" });
  let transport: ProbeTransport | undefined;
  let stdioPid: number | null = null;
  let timedOut = false;
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("The operation timed out", "TimeoutError"));
  }, server.timeoutMs);
  timer.unref?.();

  try {
    transport = createTransport(server, observation);
    // The SDK's concrete HTTP class exposes `sessionId: string | undefined`
    // while its Transport interface declares `sessionId?: string`; with
    // exactOptionalPropertyTypes those are structurally different.
    const connect = client.connect(transport as Transport, {
      signal: controller.signal,
      timeout: server.timeoutMs,
      maxTotalTimeout: server.timeoutMs,
    });
    await raceWithAbort(connect, controller.signal);
    if (transport instanceof StdioClientTransport) stdioPid = transport.pid;

    const toolCount = await listToolCount(client, controller.signal, server.timeoutMs);
    const implementation = client.getServerVersion();
    const name = safeMetadata(implementation?.name);
    const version = safeMetadata(implementation?.version);
    return {
      status: "available",
      toolCount,
      latencyMs: Math.max(0, Date.now() - startedAt),
      environment,
      ...(name || version
        ? { serverInfo: { ...(name ? { name } : {}), ...(version ? { version } : {}) } }
        : {}),
    };
  } catch (error) {
    const classified = classifyFailure(error, observation, timedOut);
    return classified.code === "auth-required"
      ? {
          status: "auth-required",
          toolCount: 0,
          latencyMs: Math.max(0, Date.now() - startedAt),
          environment,
          error: { ...classified, code: "auth-required" },
        }
      : {
          status: "unavailable",
          toolCount: 0,
          latencyMs: Math.max(0, Date.now() - startedAt),
          environment,
          error: classified,
        };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
    if (
      transport instanceof StreamableHTTPClientTransport &&
      transport.sessionId &&
      !controller.signal.aborted
    ) {
      await settleWithin(
        transport.terminateSession().catch(() => undefined),
        250,
      );
    }
    if (transport instanceof StdioClientTransport) {
      stdioPid ??= transport.pid;
      if (stdioPid) terminateProcessTree(stdioPid);
    }
    await closeWithTimeout(client);
    if (stdioPid) terminateProcessTree(stdioPid);
  }
}
