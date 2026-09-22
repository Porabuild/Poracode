import { fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  isBackendHostOutboundMessage,
  type BackendHostReply,
  type BackendHostRequest,
  type NativeThreadActivityChange,
} from "@/shared/backendHostProtocol";
import { sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";

/**
 * A2 process-level acceptance: the REAL backend child entry is forked, a
 * fixture supervisor emits a hot terminal + canonical runtime burst, and the
 * only thing crossing backend→main is the bounded `native-thread-activity`
 * projection. The removed `supervisor-event` relay vocabulary must never
 * appear, and no message may carry transcript/terminal bytes.
 */
describe("backend child native activity projection (forked entry)", () => {
  let root: string;
  let children: ChildProcess[] = [];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "poracode-backend-activity-"));
  });

  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit");
      }
    }
    await rm(root, { recursive: true, force: true });
  });

  function launch(): ChildProcess {
    const child = fork(resolve("src/backend/index.ts"), [], {
      execArgv: [
        "--disable-warning=ExperimentalWarning",
        "--import",
        resolve("src/backend/backendChildProcessRegister.mjs"),
      ],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    children.push(child);
    child.stderr?.on("data", (chunk) => {
      process.stderr.write(`[backend-child] ${String(chunk)}`);
    });
    return child;
  }

  function send(child: ChildProcess, request: BackendHostRequest): Promise<BackendHostReply> {
    child.send(request);
    return new Promise<BackendHostReply>((resolveReply, rejectReply) => {
      const onMessage = (message: unknown): void => {
        const reply = message as BackendHostReply;
        if (reply?.kind === "reply" && reply.replyTo === request.id) {
          child.off("message", onMessage);
          resolveReply(reply);
        }
      };
      child.on("message", onMessage);
      child.once("exit", (code) => rejectReply(new Error(`backend child exited: ${String(code)}`)));
    });
  }

  it.skipIf(!sqliteAvailable || process.platform === "win32")(
    "carries zero bulk bytes to main and projects only coalesced activity",
    async () => {
      const burstSize = 20;
      const bulkMarker = "terminal-bulk-".repeat(8);
      const supervisorPath = join(root, "supervisor.cjs");
      await writeFile(
        supervisorPath,
        `const reply = (request, data) => process.send({ replyTo: request.id, ok: true, data });
process.on("message", (request) => {
  if (request && request.type === "getCrossagentRouting") {
    for (let i = 0; i < ${burstSize}; i += 1) {
      process.send({ type: "thread-output", threadId: "thread-1", data: "${bulkMarker}", outputLength: 104, terminalInstanceId: "gen-burst" });
    }
    for (let i = 0; i < ${burstSize}; i += 1) {
      process.send({ type: "thread-runtime-events", threadId: "thread-1", events: [{ type: "item.completed", threadId: "thread-1", itemId: "item-" + i }] });
    }
    process.send({ type: "thread-state", threadId: "thread-1", status: "working", attention: "working", canResumeWithConfig: false });
    process.send({ type: "thread-state", threadId: "thread-1", status: "idle", attention: "none", canResumeWithConfig: false });
    process.send({ type: "thread-state", threadId: "thread-2", status: "launching", attention: "none", canResumeWithConfig: false });
    reply(request, null);
    return;
  }
  reply(request, process.pid);
});
setInterval(() => {}, 1000);
`,
      );

      const child = launch();
      const received: unknown[] = [];
      child.on("message", (message: unknown) => received.push(message));

      const initializeReply = await send(child, {
        version: BACKEND_HOST_PROTOCOL_VERSION,
        id: "init-1",
        operation: "initialize",
        payload: {
          baseDir: root,
          dbPath: join(root, "state.sqlite"),
          desktop: { channel: "stable", settingsPath: join(root, "settings.json") },
          supervisor: {
            appVersion: "test",
            isDev: false,
            supervisorPath,
            wslHelpersDir: join(root, "wsl"),
            secretStorageKey: randomBytes(32).toString("base64"),
          },
        },
      });
      expect(initializeReply.ok).toBe(true);

      const burstReply = await send(child, {
        version: BACKEND_HOST_PROTOCOL_VERSION,
        id: "burst-1",
        operation: "call-supervisor",
        payload: { id: "burst-1", type: "getCrossagentRouting", payload: {} },
      });
      expect(burstReply.ok).toBe(true);

      await vi.waitFor(
        () =>
          expect(
            received.some(
              (message) =>
                isBackendHostOutboundMessage(message) && message.kind === "native-thread-activity",
            ),
          ).toBe(true),
        { timeout: 10_000 },
      );

      const activityBatches = received.filter(
        (
          message,
        ): message is {
          kind: "native-thread-activity";
          changes: NativeThreadActivityChange[];
        } => isBackendHostOutboundMessage(message) && message.kind === "native-thread-activity",
      );
      // At most one change per observed transition (no per-event fan-out), and
      // last-writer-wins per thread: a flush boundary may collapse t1's
      // working→idle pair into a single `active:false` change, so the merged
      // delta is bounded by three entries regardless of flush timing.
      const changes = activityBatches.flatMap((batch) => batch.changes);
      const finalState = new Map<string, boolean>();
      for (const change of changes) finalState.set(change.threadId, change.active);
      expect(changes.length).toBeGreaterThanOrEqual(2);
      expect(changes.length).toBeLessThanOrEqual(3);
      expect([...finalState]).toEqual([
        ["thread-1", false],
        ["thread-2", true],
      ]);
      expect(JSON.stringify(activityBatches).length).toBeLessThan(512);

      // Zero bulk bytes: none of the removed relay kinds appear, and no
      // outbound message carries the terminal/runtime payload marker.
      for (const message of received) {
        expect((message as { kind?: string }).kind).not.toBe("supervisor-event");
        expect((message as { kind?: string }).kind).not.toBe("supervisor-event-gap");
        expect(JSON.stringify(message)).not.toContain(bulkMarker);
      }

      const disposeReply = await send(child, {
        version: BACKEND_HOST_PROTOCOL_VERSION,
        id: "dispose-1",
        operation: "dispose",
        payload: {},
      });
      expect(disposeReply.ok).toBe(true);
    },
    120_000,
  );
});
