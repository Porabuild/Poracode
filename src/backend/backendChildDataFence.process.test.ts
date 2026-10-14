import { fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  type BackendHostReply,
  type BackendHostRequest,
} from "@/shared/backendHostProtocol";
import { HostDataFence, HostDataFenceInUseError } from "./ownership/hostDataFence";
import { sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";

/** The real backend child entry is forked in-process-tree so the initialize
 * wire contract is exercised end to end: the desktop payload's dataFencePath
 * must make the CHILD hold `<ns>.host-data.sqlite` for its lifetime, and
 * release it only when its runtime disposes. */
describe("backend child data custody fence (forked entry)", () => {
  let root: string;
  let children: ChildProcess[] = [];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "poracode-backend-fence-"));
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
    "holds the data fence while initialized and releases it on dispose",
    async () => {
      const fencePath = `${root}.host-data.sqlite`;
      const supervisorPath = join(root, "supervisor.cjs");
      await writeFile(
        supervisorPath,
        'process.on("message",request=>process.send({replyTo:request.id,ok:true,data:process.pid}));setInterval(()=>{},1000);',
      );
      const child = launch();
      const initializeReply = await send(child, {
        version: BACKEND_HOST_PROTOCOL_VERSION,
        id: "init-1",
        operation: "initialize",
        payload: {
          baseDir: root,
          dbPath: join(root, "state.sqlite"),
          desktop: {
            channel: "stable",
            settingsPath: join(root, "settings.json"),
            dataFencePath: fencePath,
          },
          supervisor: {
            appVersion: "test",
            isDev: false,
            supervisorPath,
            wslHelpersDir: join(root, "wsl"),
            // The child validates and configures this key at initialize.
            secretStorageKey: randomBytes(32).toString("base64"),
          },
        },
      });
      expect(initializeReply.ok).toBe(true);
      expect(existsSync(fencePath)).toBe(true);

      // The child holds the fence for its lifetime: a second acquirer is refused.
      expect(() => HostDataFence.acquire(fencePath)).toThrow(HostDataFenceInUseError);

      const disposeReply = await send(child, {
        version: BACKEND_HOST_PROTOCOL_VERSION,
        id: "dispose-1",
        operation: "dispose",
        payload: {},
      });
      expect(disposeReply.ok).toBe(true);
      // Only after the runtime disposes does the fence free up.
      const fence = HostDataFence.acquire(fencePath);
      fence.release();
    },
    120_000,
  );
});
