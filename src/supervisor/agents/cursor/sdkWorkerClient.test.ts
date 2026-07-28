import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  spawnCursorSdkWorker,
  terminateCursorSdkWorkerTree,
  type CursorSdkWorkerClientDependencies,
  type CursorSdkWorkerSpawnProcess,
} from "./sdkWorkerClient";

const tempDirectories: string[] = [];
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill();
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("spawnCursorSdkWorker", () => {
  it("boots a native helper, ignores shell banners, and dispatches events safely", async () => {
    const fixture = makeProtocolFixture();
    const client = await spawnCursorSdkWorker({
      projectLocation: { kind: "posix", path: fixture.directory },
      workerPath: fixture.path,
      configuredPath: "/opt/cursor-sdk",
    });
    const received: string[] = [];
    client.onEvent(() => {
      throw new Error("listener failure");
    });
    client.onEvent((event) => received.push(event.type));

    await expect(client.probe()).resolves.toEqual({
      models: [{ id: "fixture", displayName: "Fixture" }],
      sdkVersion: "1.0.24",
      source: "configured",
    });
    await expect(
      client.initialize({
        createOptions: {
          model: { id: "fixture" },
          local: { cwd: fixture.directory },
        },
      }),
    ).resolves.toEqual({ agentId: "agent-fixture", model: { id: "fixture" } });
    await expect(client.start({ message: "hello" })).resolves.toEqual({ runId: "run-fixture" });
    await waitFor(() => received.includes("result"));
    expect(received).toContain("delta");
    expect(received).toContain("message");
    await client.dispose();
  });

  it("stages into WSL, uses the resolved in-distro Node, and keeps API keys off argv", async () => {
    const fixture = makeProtocolFixture();
    const calls: Array<{ command: string; args: readonly string[]; options: SpawnOptions }> = [];
    const originalApiKey = process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_API_KEY;
    const spawnProcess: CursorSdkWorkerSpawnProcess = (command, args, options) => {
      calls.push({ command, args, options });
      const child = spawn(process.execPath, [fixture.path], {
        cwd: fixture.directory,
        stdio: ["pipe", "pipe", "pipe"],
      });
      children.push(child);
      return child;
    };
    const resolveNode = vi.fn<NonNullable<CursorSdkWorkerClientDependencies["resolveNode"]>>(
      async () => ({
        nodePath: "/home/user/.nvm/node",
        nodeVersion: "22.14.0",
        source: "user-installed",
      }),
    );

    try {
      const client = await spawnCursorSdkWorker(
        {
          projectLocation: {
            kind: "wsl",
            distro: "Ubuntu",
            linuxPath: "/work/repo",
            uncPath: "\\\\wsl.localhost\\Ubuntu\\work\\repo",
          },
          workerPath: fixture.path,
          configuredPath: "/home/user/sdk",
          env: {
            CURSOR_API_KEY: "must-not-appear-in-command",
            PORACODE_SAFE_TEST_VALUE: "visible",
          },
        },
        {
          spawnProcess,
          resolveNode,
          deploy: (_distro, baseName, files) => {
            expect(baseName).toMatch(/^poracode-cursor-sdk-/);
            expect(files).toEqual([
              {
                src: fixture.path,
                relDest: "cursor-sdk/cursor-sdk-worker.mjs",
              },
            ]);
            return { linuxBaseDir: "/tmp/poracode-test" };
          },
        },
      );

      expect(calls).toHaveLength(1);
      const [call] = calls;
      expect(call!.args).toEqual(expect.arrayContaining(["-d", "Ubuntu", "--cd", "/work/repo"]));
      const serializedArgv = JSON.stringify(call!.args);
      expect(serializedArgv).toContain("/home/user/.nvm/node");
      expect(serializedArgv).toContain("/tmp/poracode-test/cursor-sdk/cursor-sdk-worker.mjs");
      expect(serializedArgv).toContain("PORACODE_SAFE_TEST_VALUE");
      expect(serializedArgv).not.toContain("must-not-appear-in-command");
      expect(call!.options.env?.CURSOR_API_KEY).toBeUndefined();
      expect(resolveNode).toHaveBeenCalledExactlyOnceWith("Ubuntu", {
        minimumVersion: "22.13.0",
      });
      await client.dispose();
    } finally {
      if (originalApiKey === undefined) delete process.env.CURSOR_API_KEY;
      else process.env.CURSOR_API_KEY = originalApiKey;
    }
  });

  it("surfaces deployment and boot protocol failures without hanging", async () => {
    const fixture = makeProtocolFixture();
    await expect(
      spawnCursorSdkWorker(
        {
          projectLocation: {
            kind: "wsl",
            distro: "Ubuntu",
            linuxPath: "/work/repo",
            uncPath: "\\\\wsl.localhost\\Ubuntu\\work\\repo",
          },
          workerPath: fixture.path,
        },
        {
          resolveNode: async () => ({
            nodePath: "/usr/bin/node",
            nodeVersion: "24.10.0",
            source: "user-installed",
          }),
          deploy: () => null,
        },
      ),
    ).rejects.toThrow("could not be deployed");

    const incompatible = makeProtocolFixture(99);
    await expect(
      spawnCursorSdkWorker({
        projectLocation: { kind: "posix", path: incompatible.directory },
        workerPath: incompatible.path,
        bootTimeoutMs: 2_000,
      }),
    ).rejects.toThrow("protocol 99 is not supported");
  });

  it("rejects pending requests when the worker exits", async () => {
    const fixture = makeProtocolFixture(1, true);
    const client = await spawnCursorSdkWorker({
      projectLocation: { kind: "posix", path: fixture.directory },
      workerPath: fixture.path,
    });
    await expect(
      client.initialize({
        createOptions: {
          model: { id: "fixture" },
          local: { cwd: fixture.directory },
        },
      }),
    ).rejects.toThrow("exited");
    await client.dispose();
  });

  it("reports transport failure when the worker exits after acknowledging a start", async () => {
    const fixture = makeProtocolFixture(1, false, true);
    const client = await spawnCursorSdkWorker({
      projectLocation: { kind: "posix", path: fixture.directory },
      workerPath: fixture.path,
    });
    const errors: Error[] = [];
    client.onTransportError((error) => errors.push(error));
    await client.initialize({
      createOptions: {
        model: { id: "fixture" },
        local: { cwd: fixture.directory },
      },
    });

    await expect(client.start({ message: "hello" })).resolves.toEqual({
      runId: "run-fixture",
    });
    await waitFor(() => errors.length === 1);

    expect(errors[0]?.message).toContain("exited");
    expect(errors[0]?.message).toContain("code 9");
    await client.dispose();
  });

  it.runIf(process.platform !== "win32")(
    "launches native workers as POSIX process-group leaders",
    async () => {
      const fixture = makeProtocolFixture();
      let observedOptions: SpawnOptions | undefined;
      const client = await spawnCursorSdkWorker(
        {
          projectLocation: { kind: "posix", path: fixture.directory },
          workerPath: fixture.path,
        },
        {
          spawnProcess: (command, args, options) => {
            observedOptions = options;
            return spawn(command, args, options);
          },
        },
      );

      expect(observedOptions?.detached).toBe(true);
      await client.dispose();
    },
  );

  it.runIf(process.platform !== "win32")(
    "force-kills the dedicated POSIX worker process group",
    () => {
      const kill = vi.spyOn(process, "kill").mockReturnValue(true);
      try {
        terminateCursorSdkWorkerTree({ pid: 43_210 }, true);
        expect(kill).toHaveBeenCalledExactlyOnceWith(-43_210, "SIGKILL");
      } finally {
        kill.mockRestore();
      }
    },
  );

  it("makes a start timeout fatal so a late send cannot orphan a run", async () => {
    const fixture = makeDelayedMethodFixture("start", 250);
    const client = await spawnCursorSdkWorker({
      projectLocation: { kind: "posix", path: fixture.directory },
      workerPath: fixture.path,
      requestTimeoutMs: 40,
    });
    const transportErrors: Error[] = [];
    client.onTransportError((error) => transportErrors.push(error));
    await client.initialize({
      createOptions: {
        model: { id: "fixture" },
        local: { cwd: fixture.directory },
      },
    });

    await expect(client.start({ message: "delayed" })).rejects.toThrow(
      "Cursor SDK worker request start timed out.",
    );
    expect(transportErrors).toHaveLength(1);
    expect(transportErrors[0]?.message).toContain("start timed out");
    await expect(client.start({ message: "second" })).rejects.toThrow(
      "Cursor SDK worker is not running.",
    );
    await client.dispose();
  });

  it("makes an initialize timeout fatal so a late create cannot orphan an agent", async () => {
    const fixture = makeDelayedMethodFixture("initialize", 250);
    const client = await spawnCursorSdkWorker({
      projectLocation: { kind: "posix", path: fixture.directory },
      workerPath: fixture.path,
      requestTimeoutMs: 40,
    });
    const transportErrors: Error[] = [];
    client.onTransportError((error) => transportErrors.push(error));

    await expect(
      client.initialize({
        createOptions: {
          model: { id: "fixture" },
          local: { cwd: fixture.directory },
        },
      }),
    ).rejects.toThrow("Cursor SDK worker request initialize timed out.");
    expect(transportErrors).toHaveLength(1);
    await expect(client.listModels()).rejects.toThrow("Cursor SDK worker is not running.");
    await client.dispose();
  });

  it("makes a reload timeout fatal so a late refresh cannot race the next send", async () => {
    const fixture = makeDelayedMethodFixture("reload", 250);
    const client = await spawnCursorSdkWorker({
      projectLocation: { kind: "posix", path: fixture.directory },
      workerPath: fixture.path,
      requestTimeoutMs: 40,
    });
    const transportErrors: Error[] = [];
    client.onTransportError((error) => transportErrors.push(error));
    await client.initialize({
      createOptions: {
        model: { id: "fixture" },
        local: { cwd: fixture.directory },
      },
    });

    await expect(client.reload()).rejects.toThrow("Cursor SDK worker request reload timed out.");
    expect(transportErrors).toHaveLength(1);
    await expect(client.start({ message: "second" })).rejects.toThrow(
      "Cursor SDK worker is not running.",
    );
    await client.dispose();
  });
});

function makeProtocolFixture(
  protocolVersion = 1,
  exitOnInitialize = false,
  exitAfterStart = false,
): {
  directory: string;
  path: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "poracode-cursor-sdk-client-"));
  tempDirectories.push(directory);
  const path = join(directory, "worker.mjs");
  writeFileSync(
    path,
    `
import { createInterface } from "node:readline";
process.stdout.write("login shell banner\\n");
process.stdout.write(JSON.stringify({ type: "ready", protocolVersion: ${protocolVersion} }) + "\\n");
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  const request = JSON.parse(line);
  if (${exitOnInitialize} && request.method === "initialize") {
    process.exit(7);
  }
  let result = {};
  if (request.method === "models.list") {
    result = {
      models: [{ id: "fixture", displayName: "Fixture" }],
      sdkVersion: "1.0.24",
      source: "configured",
    };
  } else if (request.method === "initialize") {
    result = { agentId: "agent-fixture", model: { id: "fixture" } };
  } else if (request.method === "start") {
    result = { runId: "run-fixture" };
  }
  process.stdout.write(JSON.stringify({ type: "response", id: request.id, ok: true, result }) + "\\n");
  if (${exitAfterStart} && request.method === "start") {
    setImmediate(() => process.exit(9));
    return;
  }
  if (request.method === "start") {
    for (const event of [
      { type: "delta", requestId: request.id, runId: "run-fixture", update: { type: "text-delta", text: "hi" } },
      { type: "message", requestId: request.id, runId: "run-fixture", message: {
        type: "assistant", agent_id: "agent-fixture", run_id: "run-fixture",
        message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
      } },
      { type: "result", requestId: request.id, runId: "run-fixture", result: {
        id: "run-fixture", status: "finished", result: "hi",
      } },
    ]) {
      process.stdout.write(JSON.stringify({ type: "event", event }) + "\\n");
    }
  }
});
`,
    "utf8",
  );
  return { directory, path };
}

function makeDelayedMethodFixture(
  method: "initialize" | "start" | "reload",
  delayMs: number,
): {
  directory: string;
  path: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "poracode-cursor-sdk-client-delayed-"));
  tempDirectories.push(directory);
  const path = join(directory, "worker.mjs");
  writeFileSync(
    path,
    `
import { createInterface } from "node:readline";
process.stdout.write(JSON.stringify({ type: "ready", protocolVersion: 1 }) + "\\n");
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  const request = JSON.parse(line);
  const result = request.method === "initialize"
    ? { agentId: "agent-fixture", model: { id: "fixture" } }
    : request.method === "start"
      ? { runId: "late-run" }
      : {};
  const respond = () => process.stdout.write(
    JSON.stringify({ type: "response", id: request.id, ok: true, result }) + "\\n"
  );
  if (request.method === ${JSON.stringify(method)}) setTimeout(respond, ${delayMs});
  else respond();
});
`,
    "utf8",
  );
  return { directory, path };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for client event.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
