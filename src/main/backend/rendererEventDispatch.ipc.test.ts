import { type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterSupervisorEventForInterests } from "@/backend/BackendHostCore";
import { RendererStreamOwnership } from "@/backend/RendererStreamOwnership";
import { createSupervisorEventRelay } from "@/backend/supervisorEventRelay";
import { planDesktopRelay } from "@/backend/supervisorEventFallback";
import type {
  BackendHostOutboundMessage,
  RendererWindowDeliveryState,
} from "@/shared/backendHostProtocol";
import { agentStatusSchema, type AgentStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { BackendHostClient } from "./BackendHostClient";
import {
  createRendererEventDispatcher,
  type RendererEventDispatchTarget,
} from "./rendererEventDispatch";
import type { RendererEventSender } from "./rendererEventInterestRegistry";
import { RendererEventInterestsWiring } from "./rendererEventInterestsWiring";

const forkState = vi.hoisted(() => ({ child: null as ChildProcess | null }));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    fork: (modulePath: string, args?: readonly string[], options?: unknown) => {
      const child = actual.fork(
        modulePath,
        args as string[] | undefined,
        options as import("node:child_process").ForkOptions | undefined,
      );
      forkState.child = child;
      return child;
    },
  };
});

/**
 * Stand-in backend host: replies to every request envelope and echoes every
 * non-request envelope back through the real Node IPC channel. Echoing is the
 * production identity-loss boundary — the relay hands the same object to both
 * the targeted copy and the shell remainder, but each `process.send` crosses
 * as its own deserialized object, exactly as in `src/backend/index.ts`.
 */
const ECHO_BACKEND_HOST = `process.on("message", (message) => {
  if (message && typeof message === "object" && typeof message.operation === "string") {
    process.send({ version: message.version, kind: "reply", replyTo: message.id, ok: true, data: null });
    return;
  }
  process.send(message);
});
`;

const MAIN_SHELL = 1;
const QUICK_COMPOSER = 7;

const STATUS_ENTRY: AgentStatus = agentStatusSchema.parse({
  kind: "claude",
  label: "Claude",
  installed: true,
  authState: "authenticated",
  capabilities: {},
});

function statusEvent(statuses: AgentStatus[] = [STATUS_ENTRY]): SupervisorEvent {
  return { type: "windows-agent-statuses", statuses };
}

function fakeSender(id: number): RendererEventSender {
  return {
    id,
    once: (_channel, listener) => listener,
  };
}

interface Harness {
  client: BackendHostClient;
  wiring: RendererEventInterestsWiring;
  ownership: RendererStreamOwnership;
  rawEvents: SupervisorEvent[];
  targeted: Array<{
    windowId: number;
    event: SupervisorEvent;
    rendererSequence: number | undefined;
  }>;
  shell: Array<{ event: SupervisorEvent; rendererSequence: number | undefined }>;
  native: SupervisorEvent[];
  forwarded: SupervisorEvent[];
  errors: unknown[];
  reportError: ReturnType<typeof vi.fn>;
  settledSyncs: { count: number };
  relay(event: SupervisorEvent, rendererSequence?: number): BackendHostOutboundMessage[];
  roundTrip(messages: BackendHostOutboundMessage[]): Promise<void>;
  dispose(): Promise<void>;
}

const cleanups: Array<() => Promise<void>> = [];

async function startHarness(registerWindows: boolean): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), "poracode-dispatch-ipc-"));
  const backendHostPath = join(root, "echoBackendHost.mjs");
  await writeFile(backendHostPath, ECHO_BACKEND_HOST);
  cleanups.push(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const rawEvents: SupervisorEvent[] = [];
  const targeted: Harness["targeted"] = [];
  const shell: Harness["shell"] = [];
  const native: SupervisorEvent[] = [];
  const forwarded: SupervisorEvent[] = [];
  const errors: unknown[] = [];
  const reportError = vi.fn<(error: unknown, tags?: unknown) => void>();
  const pushed: RendererWindowDeliveryState[][] = [];
  const settledSyncs = { count: 0 };
  const ownership = new RendererStreamOwnership();

  let dispatch: ReturnType<typeof createRendererEventDispatcher> = () => {};
  const client = new BackendHostClient({
    backendHostPath,
    initialize: {
      baseDir: root,
      dbPath: join(root, "state.sqlite"),
      desktop: { channel: "stable", settingsPath: join(root, "settings.json") },
      supervisor: {
        appVersion: "0.0.0-test",
        isDev: true,
        supervisorPath: join(root, "supervisor.cjs"),
        wslHelpersDir: root,
        secretStorageKey: "fixture",
      },
    },
    resolveExtraEnv: () => ({}),
    reportError,
    onEvent: (event, rendererSequence, target) => {
      rawEvents.push(event);
      dispatch(event, rendererSequence, target);
    },
    onReset: () => {},
  });

  const wiring = new RendererEventInterestsWiring({
    pushUnionInterests: async () => {},
    pushDeliveryTable: async (windows) => {
      ownership.setWindows(windows);
      await client.setRendererStreamOwnership(windows);
      pushed.push([...windows]);
      settledSyncs.count += 1;
    },
    onError: (error) => {
      errors.push(error);
    },
    shellRemainderWindowId: () => MAIN_SHELL,
  });

  dispatch = createRendererEventDispatcher({
    isStaleDeliveryTarget: (target) => wiring.isStaleDeliveryTarget(target),
    resolveTargetWindow: (target): RendererEventDispatchTarget | null => {
      if (target.windowId !== MAIN_SHELL && target.windowId !== QUICK_COMPOSER) return null;
      return {
        windowId: target.windowId,
        send: (event, rendererSequence) =>
          targeted.push({ windowId: target.windowId, event, rendererSequence }),
      };
    },
    sendToShell: (event, rendererSequence) => shell.push({ event, rendererSequence }),
    applyNativeState: (event) => native.push(event),
    forwardAgentStatus: (event) => forwarded.push(event),
    quickComposerWindowId: () => QUICK_COMPOSER,
  });

  const relay = (
    event: SupervisorEvent,
    rendererSequence?: number,
  ): BackendHostOutboundMessage[] => {
    const messages: BackendHostOutboundMessage[] = [];
    const relayEvent = createSupervisorEventRelay({
      publishToRendererStream: () =>
        rendererSequence === undefined
          ? undefined
          : { delivered: true, sequence: rendererSequence },
      observeEvent: () => false,
      sendToMain: (message) => messages.push(message),
      planDesktopRelay: (planned) =>
        planDesktopRelay({
          event: planned,
          ownershipArmed: ownership.isArmed(),
          fallbackWindows: ownership.fallbackWindows(),
          isTerminalBootstrapRetainedFor: () => false,
          filterEventForInterests: (entry, interests) =>
            filterSupervisorEventForInterests(entry, interests),
          filterShellEvent: (entry) => entry,
        }),
    });
    relayEvent(event);
    return messages;
  };

  const roundTrip = async (messages: BackendHostOutboundMessage[]): Promise<void> => {
    const child = forkState.child;
    if (!child) throw new Error("No forked backend host was captured.");
    const before = rawEvents.length;
    for (const message of messages) {
      await new Promise<void>((resolve, reject) => {
        child.send(message, (error) => (error ? reject(error) : resolve()));
      });
    }
    await vi.waitFor(() => expect(rawEvents.length - before).toBe(messages.length));
  };

  const harness: Harness = {
    client,
    wiring,
    ownership,
    rawEvents,
    targeted,
    shell,
    native,
    forwarded,
    errors,
    reportError,
    settledSyncs,
    relay,
    roundTrip,
    dispose: async () => {
      await client.disposeAsync({ timeoutMs: 2_000 });
      const child = forkState.child;
      forkState.child = null;
      if (child && child.exitCode === null) child.kill();
    },
  };
  cleanups.push(() => harness.dispose());

  if (registerWindows) {
    // Kept out of the helper's main flow so the expect below is unconditional
    // (the lint rule forbids conditional expects).
    await registerFallbackWindows(harness);
  }

  return harness;
}

async function registerFallbackWindows(harness: Harness): Promise<void> {
  const main = fakeSender(MAIN_SHELL);
  const overlay = fakeSender(QUICK_COMPOSER);
  harness.wiring.setInterests(main, {
    terminalThreadIds: [],
    runtimeThreadIds: [],
    allRuntimeEvents: false,
  });
  harness.wiring.setInterests(overlay, {
    terminalThreadIds: [],
    runtimeThreadIds: [],
    allRuntimeEvents: false,
  });
  await vi.waitFor(() => expect(harness.settledSyncs.count).toBeGreaterThanOrEqual(2));
}

beforeEach(() => {
  forkState.child = null;
});

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) await cleanup();
  }
});

describe("renderer event dispatch across a real backend IPC round trip", () => {
  it("delivers one quick-composer agent status exactly once through the shell forward", async () => {
    const harness = await startHarness(true);
    const messages = harness.relay(statusEvent(), 4);
    expect(messages).toHaveLength(2);

    await harness.roundTrip(messages);

    // Serialization proof: the copy and the shell remainder are distinct
    // objects in main even though the backend relay handed out one object.
    expect(harness.rawEvents).toHaveLength(2);
    expect(harness.rawEvents[0]).not.toBe(harness.rawEvents[1]);

    // Exactly one overlay delivery: the shell forward. The planned fallback
    // copy is structurally redundant for the overlay.
    expect(harness.targeted.filter((entry) => entry.windowId === QUICK_COMPOSER)).toEqual([]);
    expect(harness.forwarded).toHaveLength(1);
    expect(harness.targeted.length + harness.forwarded.length).toBe(1);
    // Native/control state and the shell envelope apply exactly once.
    expect(harness.native).toHaveLength(1);
    expect(harness.shell).toHaveLength(1);
    expect(harness.errors).toEqual([]);
    expect(harness.reportError).not.toHaveBeenCalled();
  });

  it("delivers consecutive identical statuses independently across IPC", async () => {
    const harness = await startHarness(true);
    const first = statusEvent();
    const second = statusEvent();
    const messages = [...harness.relay(first, 4), ...harness.relay(second, 5)];
    expect(messages).toHaveLength(4);

    await harness.roundTrip(messages);

    expect(harness.rawEvents).toHaveLength(4);
    expect(new Set(harness.rawEvents).size).toBe(4);
    expect(harness.forwarded).toEqual([first, second]);
    expect(harness.targeted.filter((entry) => entry.windowId === QUICK_COMPOSER)).toEqual([]);
    expect(harness.native).toHaveLength(2);
  });

  it("delivers the forward when a window reload made the copy stale", async () => {
    const harness = await startHarness(true);
    const messages = harness.relay(statusEvent(), 3);
    expect(messages).toHaveLength(2);

    // Reload the overlay: release drops its grant, re-registration mints a
    // newer generation, so the planned g1 copy is provably stale.
    harness.wiring.release(QUICK_COMPOSER);
    const reloaded = fakeSender(QUICK_COMPOSER);
    harness.wiring.setInterests(reloaded, {
      terminalThreadIds: [],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
    await vi.waitFor(() => expect(harness.settledSyncs.count).toBeGreaterThanOrEqual(3));

    await harness.roundTrip(messages);

    expect(harness.targeted).toEqual([]);
    expect(harness.forwarded).toHaveLength(1);
    expect(harness.native).toHaveLength(1);
  });

  it("preserves the legacy pre-table relay across the same IPC path", async () => {
    const harness = await startHarness(false);
    const messages = harness.relay(statusEvent(), 9);
    expect(messages).toHaveLength(1);
    const [message] = messages;
    expect(message?.kind).toBe("supervisor-event");

    await harness.roundTrip(messages);

    expect(harness.rawEvents).toHaveLength(1);
    expect(harness.targeted).toEqual([]);
    expect(harness.shell).toEqual([{ event: harness.rawEvents[0], rendererSequence: 9 }]);
    expect(harness.native).toHaveLength(1);
    expect(harness.forwarded).toHaveLength(1);
  });
});
