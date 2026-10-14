import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import { LATEST_SCHEMA_VERSION } from "@/host/db/migrations";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  type BackendHostReply,
  type BackendHostRequest,
} from "@/shared/backendHostProtocol";
import type {
  AdmissionOperation,
  AdmissionReply,
  AdmissionRequest,
} from "./headlessDataFenceAdmission.processFixture";

// Real backend entry, kernel lease, data fence, headless composition and SQLite.
// The backend is deliberately launched without a main owner to reproduce the
// custody state of an orphan, not a complete previous-release artifact.
describe.skipIf(!sqliteAvailable || process.platform === "win32")(
  "headless data-fence admission across owned processes",
  () => {
    let root: string;
    let baseDir: string;
    const children: ChildProcess[] = [];

    beforeEach(async () => {
      mkdirSync(resolve("tmp/devin"), { recursive: true });
      root = await mkdtemp(resolve("tmp/devin/headless-data-fence-"));
      baseDir = join(root, "profile");
      mkdirSync(join(root, "home"));
    });

    async function stop(child: ChildProcess): Promise<void> {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }

    afterEach(async () => {
      for (const child of children.splice(0)) await stop(child);
      await rm(root, { recursive: true, force: true });
    });

    function launch(entry = "src/server/headlessDataFenceAdmission.processFixture.ts") {
      const child = fork(resolve(entry), [], {
        execArgv: [
          "--disable-warning=ExperimentalWarning",
          "--import",
          resolve("src/backend/backendChildProcessRegister.mjs"),
        ],
        env: {
          ...process.env,
          HOME: join(root, "home"),
          USERPROFILE: join(root, "home"),
          XDG_CONFIG_HOME: join(root, "home", ".config"),
          PORACODE_BASE_DIR: baseDir,
          ...(nativeBindingEnv ? { PORACODE_BETTER_SQLITE3_NATIVE_BINDING: nativeBindingEnv } : {}),
        },
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      });
      children.push(child);
      child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
      return child;
    }

    function exchange<T>(
      child: ChildProcess,
      request: AdmissionRequest | BackendHostRequest,
      matches: (reply: T) => boolean,
    ) {
      return new Promise<T>((resolveReply, rejectReply) => {
        const cleanup = () => {
          clearTimeout(timeout);
          child.off("message", onMessage);
          child.off("exit", onExit);
        };
        const onMessage = (message: unknown) => {
          const reply = message as T;
          if (!matches(reply)) return;
          cleanup();
          resolveReply(reply);
        };
        const onExit = () => {
          cleanup();
          rejectReply(new Error("Owned fixture exited before replying"));
        };
        const timeout = setTimeout(() => {
          cleanup();
          rejectReply(new Error("Owned fixture reply timed out"));
        }, 30_000);
        child.on("message", onMessage);
        child.once("exit", onExit);
        child.send(request, (error) => {
          if (!error) return;
          cleanup();
          rejectReply(error);
        });
      });
    }

    function admission(child: ChildProcess, operation: AdmissionOperation) {
      return exchange<AdmissionReply>(child, { operation, baseDir }, (reply) => "ok" in reply);
    }

    function snapshot(directory: string): Record<string, string> {
      const files: Record<string, string> = {};
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) Object.assign(files, snapshot(path));
        else files[path] = createHash("sha256").update(readFileSync(path)).digest("hex");
      }
      return files;
    }

    it("refuses before preparation while an orphan holds the fence, then admits after its confirmed exit", async () => {
      const candidate = launch();
      const observer = launch();
      const paths = resolveHostRootPaths(baseDir);
      expect(await admission(candidate, "prepare")).toMatchObject({ ok: true });
      const backend = launch("src/backend/index.ts");
      const request: BackendHostRequest = {
        version: BACKEND_HOST_PROTOCOL_VERSION,
        id: "headless-fence-init",
        operation: "initialize",
        payload: {
          baseDir: paths.dataRoot,
          dbPath: join(paths.dataRoot, "state.sqlite"),
          desktop: {
            channel: "stable",
            settingsPath: join(paths.dataRoot, "settings.json"),
            dataFencePath: paths.dataFencePath,
          },
          supervisor: {
            appVersion: "9.9.9-test",
            isDev: false,
            supervisorPath: "/fixture/unused-supervisor.cjs",
            wslHelpersDir: "/fixture/unused-wsl",
            secretStorageKey: readFileSync(
              join(paths.dataRoot, "secret-key.headless"),
              "utf8",
            ).trim(),
          },
        },
      };
      expect(
        await exchange<BackendHostReply>(backend, request, (reply) => reply.replyTo === request.id),
      ).toMatchObject({ ok: true });
      // Preserve an independently stored settings document as well as every
      // root/key/SQLite byte; never read the backend's locked fence inode here.
      await writeFile(join(paths.dataRoot, "settings.json"), "{}\n");
      const before = snapshot(paths.dataRoot);
      expect(await admission(observer, "lease")).toMatchObject({ ok: true });
      expect(await admission(observer, "fence")).toMatchObject({
        ok: false,
        error: expect.stringContaining("data custody"),
      });

      const rejected = await admission(candidate, "headless");
      expect(rejected).toMatchObject({
        ok: false,
        initializeCalls: 0,
        error: expect.stringContaining("data custody"),
      });
      expect(snapshot(paths.dataRoot)).toEqual(before);
      expect(backend.exitCode).toBeNull();
      expect(backend.signalCode).toBeNull();
      expect(await admission(observer, "fence")).toMatchObject({ ok: false });
      expect(await admission(observer, "lease")).toMatchObject({ ok: true });

      await stop(backend);
      expect(backend.signalCode).toBe("SIGKILL");
      expect(await admission(candidate, "headless")).toEqual({
        ok: true,
        initializeCalls: 1,
        schemaVersion: LATEST_SCHEMA_VERSION,
      });
      // Probe was released; the in-process headless DB instead retains the
      // kernel lease through composition and until positive disposal.
      expect(await admission(observer, "fence")).toMatchObject({ ok: true });
      expect(await admission(observer, "lease")).toMatchObject({ ok: false });
      expect(await admission(candidate, "dispose")).toMatchObject({ ok: true });
      expect(await admission(observer, "lease")).toMatchObject({ ok: true });
    }, 120_000);

    it("cancels after probe acquisition without initializing and releases both owned locks", async () => {
      const candidate = launch();
      const observer = launch();
      const paths = resolveHostRootPaths(baseDir);
      expect(await admission(candidate, "cancel")).toEqual({
        ok: false,
        initializeCalls: 0,
        error: "fixture-startup-canceled",
      });
      expect(existsSync(paths.dataRoot)).toBe(false);
      expect(await admission(observer, "fence")).toMatchObject({ ok: true });
      expect(await admission(observer, "lease")).toMatchObject({ ok: true });
      expect(await admission(candidate, "headless")).toEqual({
        ok: true,
        initializeCalls: 1,
        schemaVersion: LATEST_SCHEMA_VERSION,
      });
      expect(await admission(candidate, "dispose")).toMatchObject({ ok: true });
    }, 120_000);
  },
);
