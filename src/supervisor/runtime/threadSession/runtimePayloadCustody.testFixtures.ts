import type {
  AgentAdapter,
  StructuredSessionHandle,
  StructuredSessionListener,
} from "../../agents/base";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SessionRuntime } from "../sessionTypes";
import { SessionRuntimeLifecycle } from "./sessionRuntimeLifecycle";
import type { RuntimeEventRouter } from "./runtimeEventRouter";

/** Only provider transport is simulated; production source guards/router/custody run unchanged. */
export class CustodyHandle implements StructuredSessionHandle {
  launchOptions = {};
  listener: StructuredSessionListener | undefined;
  replay: RuntimeEvent | undefined;
  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;
    if (this.replay) listener.onRuntimeEvent?.(this.replay);
  }
  async startTurn(): Promise<void> {}
  async activate(): Promise<void> {}
  async interruptTurn(): Promise<void> {}
  async dispose(): Promise<void> {}
  emit(event: RuntimeEvent): void {
    this.listener?.onRuntimeEvent?.(event);
  }
}

export function custodyAdapter(
  kind: string,
  key: string | undefined,
  create?: () => Promise<StructuredSessionHandle>,
): AgentAdapter {
  return {
    kind,
    label: kind,
    ...(key !== undefined ? { runtimePayloadFormatOwnerKey: key } : {}),
    capabilities: {
      models: [{ id: "fixture-model", label: "Fixture" }],
      efforts: [],
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      settingDefs: [],
    },
    createStructuredSession: create ?? (async () => new CustodyHandle()),
  } as unknown as AgentAdapter;
}

export function custodyLifecycle(router: RuntimeEventRouter) {
  const sessions = new Map<string, SessionRuntime>();
  const lifecycle = new SessionRuntimeLifecycle({
    sessions,
    sessionsBySessionId: new Map(),
    ptyLifecycle: { track: () => {}, resolveExit: () => {}, kill: () => {} },
    outputPipeline: {
      emitState: () => {},
      updateState: () => {},
      handlePtyData: () => {},
      clearSessionTimers: () => {},
    },
    runtimeEventRouter: router,
    steerCoordinator: { maybeDrainPendingSteer: () => {} },
    structuredInterruptWatchdog: { clearStructuredInterruptWatchdog: () => {} },
    emit: () => {},
    isCurrentSession: (session) => sessions.get(session.threadId) === session,
    failStructuredSession: () => {},
    indexSessionRef: () => {},
    pollSessionRefDiscovery: () => {},
  });
  return {
    sessions,
    lifecycle,
    attach(threadId: string, adapter: AgentAdapter, handle = new CustodyHandle()) {
      const session = {
        threadId,
        instanceId: `${threadId}-${sessions.size}`,
        adapter,
        agentKind: adapter.kind,
        structuredSession: handle,
        config: { model: "fixture-model" },
        status: "working",
        attention: "working",
        projectLocation: { kind: "posix", path: "/fixture" },
        presentationMode: "gui",
      } as unknown as SessionRuntime;
      lifecycle.attach(session);
      return { session, handle };
    },
  };
}

export const FORMAT_A = "fixture.normalized-a/v1";
export const FORMAT_B = "fixture.normalized-b/v1";
export function custodyStarted(
  threadId: string,
  itemId: string,
  payload: unknown = { evidence: itemId },
): RuntimeEvent {
  return { type: "item.started", threadId, itemId, itemType: "tool_call", payload };
}
