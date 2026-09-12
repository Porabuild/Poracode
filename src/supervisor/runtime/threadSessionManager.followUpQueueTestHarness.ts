import { vi } from "vitest";
import type { AgentAdapter, StructuredSessionHandle } from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";
import type { SupervisorEvent } from "@/shared/ipc";
import { ThreadSessionManager } from "./threadSessionManager";

export function createFollowUpQueueHarness() {
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  const adapter = {
    kind: "test-agent",
    label: "Test agent",
    capabilities: { liveInputMode: "server" },
  } as unknown as AgentAdapter;
  const manager = new ThreadSessionManager({
    emit,
    isDev: false,
    logsDir: "tmp/queue-tests/logs",
    settingsPath: "tmp/queue-tests/settings.json",
    readDisableCliHookPlugin: () => false,
    adapters: new Map([[adapter.kind, adapter]]),
    resolveWindowsShell: () => ({ shell: "powershell.exe", kind: "powershell", args: [] }),
  });
  let finish!: () => void;
  const completion = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(() => {
    session.status = "working";
    return completion;
  });
  const steerTurn = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(async () => {});
  const session = {
    threadId: "queue-config",
    instanceId: "queue-instance",
    agentKind: adapter.kind,
    adapter,
    projectLocation: { kind: "windows", path: "C:\\queue-fixture" },
    config: { model: "initial" },
    status: "idle",
    attention: "none",
    presentationMode: "gui",
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    structuredSession: { startTurn, steerTurn, dispose: async () => {} },
  } as unknown as SessionRuntime;
  manager.sessions.set(session.threadId, session);
  return { manager, session, startTurn, steerTurn, finish, completion };
}
