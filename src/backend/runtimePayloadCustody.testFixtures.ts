import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { BackendHostCore } from "./BackendHostCore";
import { getSqlite } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { dbFlushThreadRuntimeWrites } from "@/host/db/runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { readRuntimePayloadOrigin } from "@/host/db/runtimePayloadOrigins";
import { runtimePersistenceController } from "@/host/db/runtimePersistenceRuntime";
import type { RuntimeEvent } from "@/shared/contracts";
import { isSupervisorFlowControl, type SupervisorEvent } from "@/shared/ipc";
import { SupervisorIpcSender } from "@/supervisor/supervisorIpcSender";
import { canonicalCreditGrant } from "@/supervisor/canonicalCreditControl";
import { RuntimeEventRouter } from "@/supervisor/runtime/threadSession/runtimeEventRouter";
import {
  custodyAdapter,
  custodyLifecycle,
  FORMAT_A,
  FORMAT_B,
} from "@/supervisor/runtime/threadSession/runtimePayloadCustody.testFixtures";

export class CustodyChild extends EventEmitter {
  connected = true;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdout = null;
  stderr = null;
  send = vi.fn<(message: unknown, callback?: (error: Error | null) => void) => boolean>(
    (_message, callback) => {
      callback?.(null);
      return true;
    },
  );
  finish(): void {
    this.connected = false;
    this.exitCode = 0;
    this.emit("exit", 0, null);
    this.emit("close", 0, null);
  }
}

export async function makeRuntimePayloadCustodyHarness(
  fork: ReturnType<typeof vi.fn>,
  options: { negotiate?: boolean; envelopeBytes?: number } = {},
) {
  expect(
    sqliteAvailable,
    "The custody gate requires the existing Node SQLite binding; no native build is permitted.",
  ).toBe(true);
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  const dir = mkdtempSync(join(process.cwd(), "tmp", "payload-custody-"));
  const child = new CustodyChild();
  fork.mockReturnValue(child);
  const published: SupervisorEvent[] = [];
  const wire: SupervisorEvent[] = [];
  const core = new BackendHostCore({
    baseDir: dir,
    dbPath: join(dir, "state.sqlite"),
    supervisor: {
      appVersion: "unit",
      isDev: false,
      supervisorPath: "/never-executed",
      wslHelpersDir: "/never-executed",
      secretStorageKey: "fixture",
    },
    onEvent: (event) => published.push(event),
    onReset: () => {},
  });
  dbUpsertProject(
    {
      id: "project-1",
      name: "Fixture",
      location: { kind: "posix", path: "/fixture" },
      createdAt: "2026-01-01",
    },
    0,
  );
  for (const id of ["a", "b", "c", "d", "parent", "legacy"])
    dbUpsertThread({ ...testThread(), id, agentKind: "fixture-current-route" as never }, 0);
  let router: RuntimeEventRouter | undefined;
  const sender = new SupervisorIpcSender({
    send: (message, callback) => {
      // A real serialization boundary: no in-process symbol/brand reaches the receiver.
      const serialized = JSON.parse(JSON.stringify(message)) as SupervisorEvent;
      wire.push(serialized);
      child.emit("message", serialized);
      callback(null);
      return true;
    },
    onError: (error) => {
      throw error;
    },
    onCanonicalCapacityChange: (bytes) => router?.setCanonicalCapacity(bytes),
  });
  router = new RuntimeEventRouter((event, meta) => sender.emit(event, meta), {
    ...(options.envelopeBytes
      ? {
          maxEnvelopeBytesPerThread: options.envelopeBytes,
          maxEnvelopeBytesTotal: options.envelopeBytes * 2,
        }
      : {}),
    canonicalCapacity: () => sender.canonicalCreditRemaining(),
  });
  child.send.mockImplementation((message, callback) => {
    if (isSupervisorFlowControl(message)) {
      if (message.control === "enable-runtime-payload-origins")
        sender.enableRuntimePayloadOrigins(message);
      if (message.control === "set-event-backpressure") {
        const grant = canonicalCreditGrant(message);
        if (grant) sender.setCanonicalCredit(grant);
      }
      if (message.control === "ack-canonical-flow")
        sender.acknowledgeCanonicalFlow(message.ackSeq, message.generation);
    }
    callback?.(null);
    return true;
  });
  await core.startSupervisor(); // fork is intercepted; no child/provider process executes.
  const generation = sender.getCanonicalFlowGeneration();
  child.emit("message", {
    kind: "supervisor-flow-control-capabilities",
    versions: [1],
    supportsCanonicalCredit: true,
    canonicalFlowGeneration: generation,
    maxInFlightBytes: 1024 * 1024,
    maxEnvelopeBytes: 1024 * 1024,
    ...(options.negotiate === false ? {} : { runtimePayloadOriginVersions: [1] }),
  });
  const source = custodyLifecycle(router);
  const adapterA = custodyAdapter("fixture-a", FORMAT_A);
  const adapterB = custodyAdapter("fixture-b", FORMAT_B);
  const a = source.attach("a", adapterA);
  const b = source.attach("b", adapterB);
  const parent = source.attach("parent", adapterA);
  return {
    core,
    child,
    sender,
    router,
    source,
    adapterA,
    adapterB,
    a,
    b,
    parent,
    wire,
    published,
    generation,
    dir,
    emitA(event: RuntimeEvent) {
      a.handle.emit(event);
    },
    emitB(event: RuntimeEvent) {
      b.handle.emit(event);
    },
    async flush() {
      router!.flush();
      await dbFlushThreadRuntimeWrites();
    },
    origin(threadId: string, itemId: string) {
      return readRuntimePayloadOrigin(getSqlite(), threadId, itemId)?.formatOwnerKey;
    },
    row(threadId: string, itemId: string) {
      return getSqlite()
        .prepare(
          "SELECT type, state, payload, streams FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
        )
        .get(threadId, itemId);
    },
    async dispose() {
      router!.flush();
      runtimePersistenceController.stopTimers();
      child.finish();
      await core.dispose();
      rmSync(dir, { recursive: true, force: true });
      delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    },
  };
}

export async function settleCustodyMicrotasks() {
  for (let index = 0; index < 60; index++) await Promise.resolve();
}
