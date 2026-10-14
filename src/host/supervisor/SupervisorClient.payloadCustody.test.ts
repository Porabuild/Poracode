import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import { SupervisorClient, type SupervisorClientOptions } from "./SupervisorClient";
import { CustodyChild } from "@/backend/runtimePayloadCustody.testFixtures";
import {
  custodyStarted,
  FORMAT_A,
} from "@/supervisor/runtime/threadSession/runtimePayloadCustody.testFixtures";
import {
  admittedRuntimePayloadBatch,
  captureRuntimePayloadOrigin,
  serializeRuntimePayloadOrigins,
  readAdmittedRuntimePayloadOrigin,
} from "@/shared/runtimePayloadOriginProtocol";
const mocks = vi.hoisted(() => ({ fork: vi.fn<(...args: unknown[]) => unknown>() }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  fork: mocks.fork,
}));
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
function fixture() {
  mocks.fork.mockReset();
  const old = new CustodyChild(),
    current = new CustodyChild();
  mocks.fork.mockReturnValueOnce(old).mockReturnValueOnce(current);
  const onEvent = vi.fn<SupervisorClientOptions["onEvent"]>();
  const client = new SupervisorClient({
    baseDir: "/never-executed",
    appVersion: "unit",
    isDev: false,
    supervisorPath: "/never-executed",
    wslHelpersDir: "/never-executed",
    secretStorageKey: "fixture",
    onEvent,
    onReset: () => {},
  });
  void client.start();
  cleanups.push(async () => {
    old.finish();
    current.finish();
    await client.dispose();
  });
  return { old, current, client, onEvent };
}
const advertise = (child: CustodyChild, generation: unknown, versions: unknown = [1]) =>
  child.emit("message", {
    kind: "supervisor-flow-control-capabilities",
    versions: [1],
    canonicalFlowGeneration: generation,
    runtimePayloadOriginVersions: versions,
  });
const wire = (generation: string): SupervisorEvent =>
  JSON.parse(
    JSON.stringify(
      serializeRuntimePayloadOrigins(
        {
          type: "thread-runtime-event",
          threadId: "a",
          event: captureRuntimePayloadOrigin(custodyStarted("a", "item"), FORMAT_A),
        },
        generation,
      ),
    ),
  ) as SupervisorEvent;

describe("SupervisorClient exact owned-boot origin negotiation", () => {
  it("rejects retired child callbacks and stale generation metadata, with private fields stripped in every case", async () => {
    const h = fixture();
    advertise(h.old, "old");
    h.old.emit("message", wire("old"));
    expect(h.old.send.mock.calls[0]![0]).toEqual({
      control: "enable-runtime-payload-origins",
      version: 1,
      generation: "old",
    });
    const admission = h.onEvent.mock.calls[0]![1]!;
    expect(
      readAdmittedRuntimePayloadOrigin(admittedRuntimePayloadBatch(admission, 0).events[0]!),
    ).toEqual({ formatOwnerKey: FORMAT_A, originFormatVersion: 1 });
    h.old.finish();
    await h.client.start();
    advertise(h.current, "current");
    h.onEvent.mockClear();
    h.old.emit("message", wire("old"));
    expect(h.onEvent).not.toHaveBeenCalled();
    h.current.emit("message", wire("old"));
    expect(h.onEvent.mock.calls[0]).toHaveLength(1);
    expect(h.onEvent.mock.calls[0]![0]).not.toHaveProperty("runtimePayloadOrigins");
    h.current.emit("message", wire("current"));
    expect(h.onEvent.mock.calls[1]).toHaveLength(2);
    expect(h.onEvent.mock.calls[1]![0]).not.toHaveProperty("runtimePayloadOrigins");
  });
  it.each([{}, [2], ["1"], null].map((versions) => ({ versions })))(
    "unknown capability $versions cannot authorize metadata",
    ({ versions }) => {
      const h = fixture();
      advertise(h.old, "boot", versions);
      h.old.emit("message", wire("boot"));
      expect(h.old.send).not.toHaveBeenCalled();
      expect(h.onEvent.mock.calls[0]).toHaveLength(1);
      expect(h.onEvent.mock.calls[0]![0]).not.toHaveProperty("runtimePayloadOrigins");
    },
  );
  it("default noncanonical publication also erases malformed private fields", () => {
    const h = fixture();
    advertise(h.old, "boot");
    h.old.emit("message", {
      type: "thread-exited",
      threadId: "a",
      exitCode: 0,
      runtimePayloadOrigins: { entries: ["malformed"] },
    });
    expect(h.onEvent).toHaveBeenCalledExactlyOnceWith({
      type: "thread-exited",
      threadId: "a",
      exitCode: 0,
    });
  });
});
