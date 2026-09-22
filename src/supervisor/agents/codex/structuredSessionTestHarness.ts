import type { RuntimeEvent } from "@/shared/contracts";
import { CodexStructuredSession } from "./acp";
import type { CodexAppServerRpc } from "./appServerRpc";
import { CodexLiveVoice } from "./liveVoice";

export interface CodexStructuredSessionHarness {
  session: CodexStructuredSession;
  requests: Array<{ method: string; params: unknown }>;
  events: RuntimeEvent[];
  updates: Array<{ status: string }>;
  notify(method: string, params: Record<string, unknown>): void;
}

/**
 * `CodexStructuredSession` shell around a scripted app-server (as in
 * codex.test.ts): no provider process, no model tokens. `respond` may return a
 * result or an `Error` to reject with; `undefined` falls back to defaults.
 */
export function setupCodexStructuredSession(
  respond?: (method: string, params: unknown) => unknown,
): CodexStructuredSessionHarness {
  const requests: CodexStructuredSessionHarness["requests"] = [];
  const events: RuntimeEvent[] = [];
  const updates: CodexStructuredSessionHarness["updates"] = [];
  const shell = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
  const rpc = {
    claimThread: () => {},
    ownsThread: (threadId: string) => threadId === "provider-thread",
    request: async (method: string, params: unknown) => {
      requests.push({ method, params });
      const result = respond?.(method, params);
      if (result instanceof Error) throw result;
      if (method === "turn/start") return { turn: { id: "turn-user", status: "inProgress" } };
      if (method === "turn/steer") return { turnId: "turn-user" };
      return result ?? {};
    },
  };
  Object.assign(shell, {
    rpc,
    liveVoice: new CodexLiveVoice(
      rpc as unknown as Pick<CodexAppServerRpc, "request">,
      "local-thread",
      () => {},
      () => {},
    ),
    threadId: "local-thread",
    remoteThreadId: "provider-thread",
    launchOptions: {},
    bufferedRuntimeEvents: [],
    isDisposed: false,
    currentThreadStatus: { type: "idle" },
    seenErrorMessages: new Set<string>(),
    activeTurnIds: new Set<string>(),
    resumeActiveStatusSuppressionUntil: new Map(),
    listener: {
      onRuntimeEvent: (event: RuntimeEvent) => events.push(event),
      onUpdate: (update: { status: string }) => updates.push(update),
      onClose: () => {},
      onError: () => {},
    },
  });
  const session = shell as unknown as CodexStructuredSession;
  const notify = (method: string, params: Record<string, unknown>) =>
    (
      session as unknown as {
        handleNotification(method: string, params: Record<string, unknown>): void;
      }
    ).handleNotification(method, params);
  return { session, requests, events, updates, notify };
}
