import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { spawn as spawnPty } from "node-pty";
import { AcpTerminalManager } from "./terminalManager";

// Reproduce the host's exhausted PTY pool without consuming any real PTYs.
vi.mock("node-pty", () => ({
  spawn: vi.fn<typeof import("node-pty").spawn>(() => {
    throw new Error("posix_spawnp failed.");
  }),
}));

const managers: AcpTerminalManager[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const manager of managers.splice(0)) manager.releaseAllAcpTerminals();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "acp-command-"));
  directories.push(cwd);
  const manager = new AcpTerminalManager({
    projectLocation: { kind: process.platform === "win32" ? "windows" : "posix", path: cwd },
    cwd,
    assertRequestSession: (id) => expect(id).toBe("session-1"),
  });
  managers.push(manager);
  const create = (script: string) =>
    manager.handleCreateTerminal({
      sessionId: "session-1",
      command: process.execPath,
      args: ["-e", script],
    });
  const request = (terminalId: string) => ({ sessionId: "session-1", terminalId });
  return { manager, create, request };
}

it("drains stdout and stderr with intact UTF-8 before returning the exit code", async () => {
  const { manager, create, request } = fixture();
  const { terminalId } = await create(`
    process.stdout.write(Buffer.from([0xe2]));
    setTimeout(() => {
      process.stdout.write(Buffer.from([0x82, 0xac]));
      process.stderr.write('stderr-' + 'x'.repeat(100000));
      process.exitCode = 3;
    }, 10);
  `);
  await expect(manager.handleWaitForTerminalExit(request(terminalId))).resolves.toEqual({
    exitCode: 3,
  });
  const result = manager.handleTerminalOutput(request(terminalId));
  expect(result.output).toContain("€");
  expect(result.output).toContain("stderr-" + "x".repeat(100000));
  expect(result.output).not.toContain("�");
  manager.handleReleaseTerminal(request(terminalId));
  expect(manager.getTerminalOutput(terminalId)).toBe(result.output);
  expect(spawnPty).not.toHaveBeenCalled();
});

it("runs and releases more commands than the concurrent limit without a PTY", async () => {
  const { manager, create, request } = fixture();
  for (let index = 0; index < 35; index++) {
    const { terminalId } = await create("process.stdout.write('ok')");
    await expect(manager.handleWaitForTerminalExit(request(terminalId))).resolves.toEqual({
      exitCode: 0,
    });
    expect(manager.handleTerminalOutput(request(terminalId)).output).toBe("ok");
    manager.handleReleaseTerminal(request(terminalId));
  }
  expect(spawnPty).not.toHaveBeenCalled();
});

it("settles spawn errors with diagnostic output", async () => {
  const { manager, request } = fixture();
  const { terminalId } = await manager.handleCreateTerminal({
    sessionId: "session-1",
    command: "poracode-nonexistent-command-for-test",
    args: ["argument"],
  });
  await expect(manager.handleWaitForTerminalExit(request(terminalId))).resolves.toEqual({
    exitCode: 1,
  });
  expect(manager.handleTerminalOutput(request(terminalId)).output).toContain("ENOENT");
  expect(spawnPty).not.toHaveBeenCalled();
});

it.skipIf(process.platform === "win32")("kills the command's owned process group", async () => {
  const { manager, create, request } = fixture();
  const { terminalId } = await create(`
    const child = require('node:child_process').spawn(process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'], {stdio: ['ignore', 'inherit', 'inherit']});
    child.on('spawn', () => process.stdout.write('ready'));
    setInterval(() => {}, 1000);
  `);
  await vi.waitFor(() => {
    expect(manager.handleTerminalOutput(request(terminalId)).output).toBe("ready");
  });
  manager.handleKillTerminal(request(terminalId));
  // close cannot fire until the descendant also closes its inherited pipes.
  await expect(manager.handleWaitForTerminalExit(request(terminalId))).resolves.toEqual({
    signal: "SIGKILL",
  });
  expect(spawnPty).not.toHaveBeenCalled();
});

it("release settles pending waiters and retires the command", async () => {
  const { manager, create, request } = fixture();
  const { terminalId } = await create("setInterval(() => {}, 1000)");
  const waiting = manager.handleWaitForTerminalExit(request(terminalId));
  manager.handleReleaseTerminal(request(terminalId));
  await expect(waiting).resolves.toEqual({ signal: "SIGTERM" });
  expect(() => manager.handleTerminalOutput(request(terminalId))).toThrow("Invalid params");
  expect(spawnPty).not.toHaveBeenCalled();
});

it("cancels a terminal create awaiting cwd validation and admits the next create", async () => {
  const { manager, create, request } = fixture();
  const pending = create("process.stdout.write('cancelled')");
  manager.killAllAcpTerminals();
  await expect(pending).rejects.toMatchObject({ code: -32602 });
  const { terminalId } = await create("process.stdout.write('next turn')");
  await expect(manager.handleWaitForTerminalExit(request(terminalId))).resolves.toEqual({
    exitCode: 0,
  });
  expect(manager.handleTerminalOutput(request(terminalId)).output).toBe("next turn");
});

it("kills running host commands without requiring provider terminal/kill requests", async () => {
  const { manager, create, request } = fixture();
  const { terminalId } = await create(
    "process.stdout.write('running'); setInterval(() => {}, 1000)",
  );
  await vi.waitFor(() => {
    expect(manager.handleTerminalOutput(request(terminalId)).output).toBe("running");
  });
  manager.killAllAcpTerminals();
  const status = await manager.handleWaitForTerminalExit(request(terminalId));
  expect(status).not.toEqual({ exitCode: 0 });
  expect(manager.handleTerminalOutput(request(terminalId)).output).toBe("running");
});

it.skipIf(process.platform === "win32")(
  "reports leader exit while inherited pipes stay open and releases its descendants",
  async () => {
    const { manager, create, request } = fixture();
    const { terminalId } = await create(`
      const child = require('node:child_process').spawn(process.execPath,
        ['-e', 'setInterval(() => {}, 1000)'], {stdio: ['ignore', 'inherit', 'inherit']});
      child.on('spawn', () => process.stdout.write(String(child.pid)));
      child.unref();
    `);
    await vi.waitFor(() => {
      expect(manager.handleTerminalOutput(request(terminalId)).exitStatus).toEqual({ exitCode: 0 });
    });
    const descendant = Number(manager.handleTerminalOutput(request(terminalId)).output);
    expect(descendant).toBeGreaterThan(0);
    expect(() => process.kill(descendant, 0)).not.toThrow();
    await expect(manager.handleWaitForTerminalExit(request(terminalId))).resolves.toEqual({
      exitCode: 0,
    });
    manager.handleReleaseTerminal(request(terminalId));
    await vi.waitFor(() => {
      expect(() => process.kill(descendant, 0)).toThrow("ESRCH");
    });
    expect(spawnPty).not.toHaveBeenCalled();
  },
);
