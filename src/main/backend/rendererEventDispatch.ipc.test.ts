import { type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupervisorEventRelay } from "@/backend/supervisorEventRelay";
import type { BackendHostOutboundMessage } from "@/shared/backendHostProtocol";
import { agentStatusSchema, type AgentStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { BackendHostClient } from "./BackendHostClient";
import { createRendererEventDispatcher } from "./rendererEventDispatch";
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
 * production identity-loss boundary — each `process.send` crosses as its own
 * deserialized object, exactly as in `src/backend/index.ts`.
 */
const ECHO_BACKEND_HOST = `process.on("message", (message) => {
  if (message && typeof message === "object" && typeof message.operation === "string") {
    process.send({ version: message.version, kind: "reply", replyTo: message.id, ok: true, data: null });
    return;
  }
  process.send(message);
});
`;

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
  rawEvents: SupervisorEvent[];
  rawSequences: Array<number | undefined>;
  shell: Array<{ event: SupervisorEvent; rendererSequence: number | undefined }>;
  native: SupervisorEvent[];
  forwarded: SupervisorEvent[];
  errors: unknown[];
  reportError: ReturnType<typeof vi.fn>;
  relay(event: SupervisorEvent): BackendHostOutboundMessage[];
  roundTrip(messages: BackendHostOutboundMessage[]): Promise<void>;
  dispose(): Promise<void>;
}

const cleanups: Array<() => Promise<void>> = [];

/**
 * Collapsed single-path harness (V5 plan 2.5): the real relay produces ONE
 * sequenced envelope per event; the envelope crosses a real forked backend
 * child and is dispatched by the slim dispatcher in main.
 */
async function startHarness(): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), "poracode-dispatch-ipc-"));
  const backendHostPath = join(root, "echoBackendHost.mjs");
  await writeFile(backendHostPath, ECHO_BACKEND_HOST);
  cleanups.push(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const rawEvents: SupervisorEvent[] = [];
  const rawSequences: Array<number | undefined> = [];
  const shell: Harness["shell"] = [];
  const native: SupervisorEvent[] = [];
  const forwarded: SupervisorEvent[] = [];
  const errors: unknown[] = [];
  const reportError = vi.fn<(error: unknown, tags?: unknown) => void>();

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
    onEvent: (event, rendererSequence) => {
      rawEvents.push(event);
      rawSequences.push(rendererSequence);
      dispatch(event, rendererSequence);
    },
    onReset: () => {},
  });

  const wiring = new RendererEventInterestsWiring({
    pushUnionInterests: async () => {},
    onError: (error) => {
      errors.push(error);
    },
  });

  dispatch = createRendererEventDispatcher({
    sendToShell: (event, rendererSequence) => shell.push({ event, rendererSequence }),
    applyNativeState: (event) => native.push(event),
    forwardAgentStatus: (event) => forwarded.push(event),
  });

  let relaySequence = 0;
  const relay = (event: SupervisorEvent): BackendHostOutboundMessage[] => {
    const messages: BackendHostOutboundMessage[] = [];
    const relayEvent = createSupervisorEventRelay({
      nextSequence: () => ++relaySequence,
      observeEvent: () => false,
      filterEventForRelay: (filtered) => filtered,
      sendToMain: (message) => messages.push(message),
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
    rawEvents,
    rawSequences,
    shell,
    native,
    forwarded,
    errors,
    reportError,
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

  // One registered window publishes its interests over the same wiring main
  // uses; the union push is the only backend consumer now.
  const main = fakeSender(1);
  wiring.setInterests(main, {
    terminalThreadIds: [],
    runtimeThreadIds: [],
    allRuntimeEvents: false,
  });

  return harness;
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

describe("renderer event dispatch across a real backend IPC round trip (collapsed single path)", () => {
  it("delivers one sequenced envelope, one native application, one overlay forward", async () => {
    const harness = await startHarness();
    const event = statusEvent();
    const messages = harness.relay(event);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: "supervisor-event", rendererSequence: 1 });
    expect(messages[0]).not.toHaveProperty("target");

    await harness.roundTrip(messages);

    // Serialization proof: the envelope main receives is its own object.
    expect(harness.rawEvents).toEqual([event]);
    expect(harness.rawSequences).toEqual([1]);
    // Exactly one overlay delivery: the shell forward.
    expect(harness.forwarded).toEqual([event]);
    expect(harness.native).toEqual([event]);
    expect(harness.shell).toEqual([{ event, rendererSequence: 1 }]);
    expect(harness.errors).toEqual([]);
    expect(harness.reportError).not.toHaveBeenCalled();
  });

  it("delivers consecutive identical statuses independently and sequences them monotonically", async () => {
    const harness = await startHarness();
    const first = statusEvent();
    const second = statusEvent();
    const messages = [...harness.relay(first), ...harness.relay(second)];
    expect(messages).toHaveLength(2);

    await harness.roundTrip(messages);

    expect(harness.rawEvents).toEqual([first, second]);
    expect(harness.rawSequences).toEqual([1, 2]);
    expect(harness.forwarded).toEqual([first, second]);
    expect(harness.native).toHaveLength(2);
  });

  it("crosses mixed bulk content untargeted so the window reducer gates it by sequence", async () => {
    const harness = await startHarness();
    const mixed: SupervisorEvent = {
      type: "thread-runtime-events",
      threadId: "t-1",
      events: [
        { type: "item.started", threadId: "t-1", itemId: "i-1", itemType: "assistant_message" },
      ],
    };
    const messages = harness.relay(mixed);
    expect(messages).toHaveLength(1);

    await harness.roundTrip(messages);

    expect(harness.rawEvents).toEqual([mixed]);
    expect(harness.shell).toEqual([{ event: mixed, rendererSequence: 1 }]);
    // No control-only remainder, no targeted copies: one envelope, one send.
    expect(harness.native).toEqual([mixed]);
  });
});
