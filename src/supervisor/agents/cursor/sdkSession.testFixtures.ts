import { vi } from "vitest";
import type {
  ProjectLocation,
  ResolvedMcpServer,
  RuntimeEvent,
  ThreadConfig,
} from "@/shared/contracts";
import type {
  CreateStructuredSessionInput,
  StructuredSessionListener,
  StructuredSessionUpdate,
} from "../base";
import { CursorSdkSession } from "./sdkSession";
import type {
  CursorSdkWorkerAgentMessage,
  CursorSdkWorkerEvent,
  CursorSdkWorkerInitializeInput,
  CursorSdkWorkerInitializeResult,
  CursorSdkWorkerProbeResult,
  CursorSdkWorkerStartInput,
  CursorSdkWorkerStartResult,
  CursorSdkWorkerSteerResult,
} from "./sdkWorkerProtocol";

export const projectLocation: ProjectLocation = { kind: "posix", path: "/repo" };
export const baseConfig: ThreadConfig = {
  model: "composer[test=one]",
  effort: "high",
  mode: "agent",
  approvalPolicy: "default",
  sandboxMode: "workspace-write",
};
const initialMcp: ResolvedMcpServer[] = [
  {
    id: "docs-id",
    name: "docs",
    timeoutMs: 10_000,
    transport: {
      type: "stdio",
      command: "node",
      args: ["docs.js"],
      env: { TOKEN: "opaque" },
    },
  },
];

export function input(
  overrides: Partial<CreateStructuredSessionInput> = {},
): CreateStructuredSessionInput {
  return {
    threadId: "thread-123456789",
    projectLocation,
    config: baseConfig,
    agentSettings: { structuredRuntime: "sdk" },
    env: { PROJECT_VALUE: "yes" },
    mcpServers: initialMcp,
    presentationMode: "gui",
    ...overrides,
  };
}

export class FakeWorker {
  private listeners = new Set<(event: CursorSdkWorkerEvent) => void>();
  private transportErrorListeners = new Set<(error: Error) => void>();

  readonly initialize = vi.fn<
    (input: CursorSdkWorkerInitializeInput) => Promise<CursorSdkWorkerInitializeResult>
  >(async (_input) => ({
    agentId: "agent-1",
    model: { id: "composer" },
  }));
  readonly start = vi.fn<(input: CursorSdkWorkerStartInput) => Promise<CursorSdkWorkerStartResult>>(
    async (_input) => ({ runId: "run-1" }),
  );
  readonly steer = vi.fn<(runId: string, text: string) => Promise<CursorSdkWorkerSteerResult>>(
    async () => "complete_delivered",
  );
  readonly cancel = vi.fn<(runId?: string) => Promise<{ cancelled: boolean }>>(async (_runId) => ({
    cancelled: true,
  }));
  readonly reload = vi.fn<() => Promise<void>>(async () => {});
  readonly listMessages = vi.fn<
    (input?: { limit?: number; offset?: number }) => Promise<CursorSdkWorkerAgentMessage[]>
  >(async (_input) => [
    {
      type: "user",
      uuid: "user-1",
      agent_id: "agent-1",
      message: { role: "user", content: [{ type: "text", text: "hello" }] },
    },
    {
      type: "assistant",
      uuid: "assistant-1",
      agent_id: "agent-1",
      message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
    },
  ]);
  readonly listModels = vi.fn<(apiKey?: string) => Promise<CursorSdkWorkerProbeResult>>(
    async () => ({
      models: [
        {
          id: "composer",
          displayName: "Composer",
          parameters: [
            {
              id: "effort",
              values: [
                { value: "medium", displayName: "Medium" },
                { value: "high", displayName: "High" },
              ],
            },
          ],
        },
      ],
      sdkVersion: "1.0.37",
      source: "configured" as const,
    }),
  );
  readonly dispose = vi.fn<() => Promise<void>>(async () => {});

  onEvent(listener: (event: CursorSdkWorkerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onTransportError(listener: (error: Error) => void): () => void {
    this.transportErrorListeners.add(listener);
    return () => this.transportErrorListeners.delete(listener);
  }

  emit(event: CursorSdkWorkerEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  crash(error: Error): void {
    for (const listener of this.transportErrorListeners) listener(error);
  }

  snapshotListeners(): {
    emit(event: CursorSdkWorkerEvent): void;
    crash(error: Error): void;
  } {
    const eventListeners = [...this.listeners];
    const transportErrorListeners = [...this.transportErrorListeners];
    return {
      emit: (event) => {
        for (const listener of eventListeners) listener(event);
      },
      crash: (error) => {
        for (const listener of transportErrorListeners) listener(error);
      },
    };
  }
}

export function recordingListener() {
  const updates: StructuredSessionUpdate[] = [];
  const events: RuntimeEvent[] = [];
  const errors: string[] = [];
  let closes = 0;
  const listener: StructuredSessionListener = {
    onClose: () => {
      closes += 1;
    },
    onError: (message) => errors.push(message),
    onUpdate: (update) => updates.push(update),
    onRuntimeEvent: (event) => events.push(event),
  };
  return {
    listener,
    updates,
    events,
    errors,
    get closes() {
      return closes;
    },
  };
}

export async function createSession(
  worker = new FakeWorker(),
  inputOverrides: Partial<CreateStructuredSessionInput> = {},
) {
  const spawnWorker = vi.fn<(input: unknown) => Promise<FakeWorker>>(async () => worker);
  let id = 0;
  const session = await CursorSdkSession.create(input(inputOverrides), {
    spawnWorker,
    newId: () => `id-${++id}`,
  });
  return { session, worker, spawnWorker };
}

export async function createSessionWithWorkers(
  workers: readonly FakeWorker[],
  inputOverrides: Partial<CreateStructuredSessionInput> = {},
) {
  let workerIndex = 0;
  const spawnWorker = vi.fn<(input: unknown) => Promise<FakeWorker>>(async () => {
    const worker = workers[workerIndex++];
    if (!worker) throw new Error("No fake Cursor SDK worker remains.");
    return worker;
  });
  let id = 0;
  const session = await CursorSdkSession.create(input(inputOverrides), {
    spawnWorker,
    newId: () => `id-${++id}`,
  });
  return { session, spawnWorker };
}

export function resultEvent(
  status: "finished" | "error" | "cancelled" = "finished",
  runId = "run-1",
): CursorSdkWorkerEvent {
  return {
    type: "result",
    requestId: "request-1",
    runId,
    result: {
      id: runId,
      status,
      ...(status === "error" ? { error: { message: "backend failed", code: "backend" } } : {}),
    },
  };
}

export function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
