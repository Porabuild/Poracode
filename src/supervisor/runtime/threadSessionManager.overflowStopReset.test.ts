import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AgentAdapter } from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";

import { ThreadSessionManager } from "./threadSessionManager";

/**
 * B1 canonical overflow-stop state is per session generation. An explicit
 * relaunch publishes a new generation (the single session-creation point is
 * `SessionRuntimeLifecycle.attach`), and that new generation must be stoppable
 * on its own overflow instead of inheriting the retired predecessor's marker.
 *
 * This suite uses the real SpawnPipeline/lifecycle (no spawn mock): the
 * replacement is published exactly like production does.
 */

function makeManager() {
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  const manager = new ThreadSessionManager({
    emit,
    isDev: false,
    logsDir: "",
    settingsPath: "",
    readDisableCliHookPlugin: () => false,
    adapters: new Map(),
    resolveWindowsShell: () => ({ shell: "cmd", kind: "cmd", args: [] }),
  });
  return { manager, emit };
}

function enqueue(manager: ThreadSessionManager, threadId: string, event: RuntimeEvent): void {
  const enq = (
    manager as unknown as { enqueueRuntimeEvent: (threadId: string, event: RuntimeEvent) => void }
  ).enqueueRuntimeEvent;
  enq.call(manager, threadId, event);
}

function delta(threadId: string, text: string): RuntimeEvent {
  return {
    type: "content.delta",
    threadId,
    itemId: `item-${text}`,
    stream: "command_output",
    delta: text,
  } as RuntimeEvent;
}

function makeSession(
  manager: ThreadSessionManager,
  threadId: string,
  dispose: () => Promise<void>,
): SessionRuntime {
  const session = {
    threadId,
    agentKind: "codex",
    adapter: { capabilities: {} } as unknown as AgentAdapter,
    config: {},
    status: "working",
    attention: "working",
    canResumeWithConfig: false,
    presentationMode: "gui",
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    structuredSession: {
      setListener: vi.fn<(listener: unknown) => void>(),
      dispose,
    },
  } as unknown as SessionRuntime;
  manager.sessions.set(threadId, session);
  return session;
}

function errorStates(emit: ReturnType<typeof vi.fn<(event: SupervisorEvent) => void>>) {
  return emit.mock.calls
    .map(([event]) => event)
    .filter(
      (event): event is Extract<SupervisorEvent, { type: "thread-state" }> =>
        event.type === "thread-state" && event.status === "error",
    );
}

describe("ThreadSessionManager overflow-stop generation reset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops a replacement generation after an explicit relaunch", () => {
    const { manager, emit } = makeManager();
    const disposeFirst = vi.fn<() => Promise<void>>(async () => undefined);
    makeSession(manager, "t1", disposeFirst);

    manager.setCanonicalEventBackpressure(true);
    for (let index = 0; index < 2_100; index += 1) {
      enqueue(manager, "t1", delta("t1", `first-${index}`));
    }
    expect(errorStates(emit)).toHaveLength(1);
    expect(disposeFirst).toHaveBeenCalledOnce();

    // Explicit relaunch: the real lifecycle publishes the replacement.
    const lifecycle = (
      manager as unknown as {
        spawnPipeline: {
          ctx: { sessionRuntimeLifecycle: { attach(session: SessionRuntime): void } };
        };
      }
    ).spawnPipeline.ctx.sessionRuntimeLifecycle;
    const disposeSecond = vi.fn<() => Promise<void>>(async () => undefined);
    lifecycle.attach({
      ...manager.sessions.get("t1")!,
      status: "working",
      attention: "working",
      structuredRetired: false,
      pendingStructuredDisposal: undefined,
      ignoreExit: false,
      structuredSession: {
        setListener: vi.fn<(listener: unknown) => void>(),
        dispose: disposeSecond,
      } as unknown as SessionRuntime["structuredSession"],
    });

    // The new generation's own overflow must stop it.
    manager.setCanonicalEventBackpressure(false);
    manager.setCanonicalEventBackpressure(true);
    for (let index = 0; index < 2_100; index += 1) {
      enqueue(manager, "t1", delta("t1", `second-${index}`));
    }
    expect(disposeSecond).toHaveBeenCalledOnce();
    expect(errorStates(emit)).toHaveLength(2);
  });
});
