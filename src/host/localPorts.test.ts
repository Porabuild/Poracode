import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type AddressInfo } from "node:net";
import {
  closeLocalPort,
  listLocalPorts,
  parseLsofListeners,
  parseProcessOwners,
  parseSsListeners,
} from "./localPorts";

const run = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<{ stdout: string }>>());
const readStat = vi.hoisted(() => vi.fn<() => Promise<string>>());
vi.mock("node:fs/promises", () => ({ readFile: readStat }));
vi.mock("node:child_process", () => ({
  execFile: Object.assign(vi.fn(), { [Symbol.for("nodejs.util.promisify.custom")]: run }),
}));
vi.mock("node:timers/promises", () => ({ setTimeout: async () => {} }));

const originalPlatform = process.platform;
const pid = process.pid + 1000;
const row = {
  port: 45123,
  address: "127.0.0.1",
  pid,
  processName: "fixture",
  processStartedAt: "12345",
  processPath: "/fixture",
  needsProbe: false,
};
const payload = {
  port: row.port,
  address: row.address,
  pid,
  processStartedAt: row.processStartedAt,
};

beforeEach(() => {
  Object.defineProperty(process, "platform", { value: "win32" });
  run.mockReset();
  readStat.mockReset().mockResolvedValue(`60 (worker ) name) S ${"0 ".repeat(18)}999`);
  vi.spyOn(process, "kill").mockReturnValue(true);
});
afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
  vi.restoreAllMocks();
});

describe("local port inspection", () => {
  it("retains scoped IPv6 listeners even though browsers cannot address them", async () => {
    run.mockResolvedValue({ stdout: JSON.stringify([{ ...row, address: "fe80::1%4" }]) });
    expect((await listLocalPorts()).ports).toEqual([
      expect.objectContaining({ address: "fe80::1%4", url: null, canClose: true }),
    ]);
  });

  it("probes unknown Windows states and excludes endpoints that no longer listen", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    run.mockResolvedValue({ stdout: JSON.stringify([{ ...row, port, needsProbe: true }]) });
    try {
      expect((await listLocalPorts()).ports).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    expect((await listLocalPorts()).ports).toHaveLength(0);
  });

  it("lists arbitrary ports, retains distinct listeners and maps wildcard addresses to loopback", async () => {
    run.mockResolvedValue({
      stdout: JSON.stringify([
        row,
        row,
        { ...row, address: "::" },
        { ...row, address: "0.0.0.0", port: 80 },
      ]),
    });
    const { ports } = await listLocalPorts();
    expect(ports).toHaveLength(3);
    expect(ports[0]).toMatchObject({
      port: 80,
      url: "http://127.0.0.1:80",
      processName: "fixture",
      canClose: true,
    });
    expect(ports.find((port) => port.address === "::")?.url).toBe("http://[::1]:45123");
    expect(run).toHaveBeenCalledWith(
      expect.stringMatching(/WindowsPowerShell.*powershell\.exe$/),
      expect.arrayContaining(["-NoProfile", "-NonInteractive"]),
      expect.objectContaining({ windowsHide: true, timeout: 15_000 }),
    );
  });

  it("keeps system, unknown and its own listeners visible but non-closable", async () => {
    run.mockResolvedValue({
      stdout: JSON.stringify([
        { ...row, pid: 4 },
        { ...row, pid: process.pid },
        { ...row, pid: 0, processName: null, processStartedAt: null },
      ]),
    });
    const { ports } = await listLocalPorts();
    expect(ports).toHaveLength(3);
    expect(ports.every((port) => !port.canClose)).toBe(true);
  });

  it("parses macOS machine-readable IPv4, IPv6 and wildcard listeners", () => {
    expect(
      parseLsofListeners("p50\nf20\nn*:5173\nf21\nn[::1]:45123\np60\nn127.0.0.1:8000\n"),
    ).toEqual([
      { pid: 50, address: "*", port: 5173 },
      { pid: 50, address: "::1", port: 45123 },
      { pid: 60, address: "127.0.0.1", port: 8000 },
    ]);
  });

  it("parses Linux listeners including missing ownership and socket sharing", () => {
    expect(
      parseSsListeners(
        'LISTEN 0 511 [::]:45123 [::]:* users:(("node",pid=60,fd=1),("node",pid=61,fd=2))\nLISTEN 0 128 127.0.0.1:5432 0.0.0.0:*\n',
      ),
    ).toEqual([
      { pid: 60, address: "::", port: 45123 },
      { pid: 61, address: "::", port: 45123 },
      { pid: null, address: "127.0.0.1", port: 5432 },
    ]);
  });

  it("pins Unix process identities to creation time and preserves executable paths with spaces", () => {
    expect(
      parseProcessOwners("  60 Thu Nov  5 10:12:13 2026 /Applications/My App/node\n").get(60),
    ).toEqual({
      name: "node",
      path: "/Applications/My App/node",
      startedAt: "Thu Nov 5 10:12:13 2026",
    });
  });

  it.each(["linux", "darwin"])(
    "composes the %s listener and process snapshots",
    async (platform) => {
      Object.defineProperty(process, "platform", { value: platform });
      run.mockImplementation(async (command) => ({
        stdout:
          command === "ps"
            ? "60 Thu Nov  5 10:12:13 2026 /usr/bin/node\n"
            : command === "lsof"
              ? "p60\nn[::1]:45123\n"
              : 'LISTEN 0 511 [::1]:45123 [::]:* users:(("node",pid=60,fd=1))\n',
      }));
      expect((await listLocalPorts()).ports).toEqual([
        expect.objectContaining({
          port: 45123,
          pid: 60,
          processName: "node",
          url: "http://[::1]:45123",
          canClose: true,
        }),
      ]);
    },
  );
});

describe("closing a local port", () => {
  it("rejects Linux PID reuse within the same ps start-time second", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    run.mockImplementation(async (command) => ({
      stdout:
        command === "ps"
          ? "60 Thu Nov  5 10:12:13 2026 /usr/bin/node\n"
          : 'LISTEN 0 511 [::1]:45123 [::]:* users:(("node",pid=60,fd=1))\n',
    }));
    const original = (await listLocalPorts()).ports[0]!;
    expect(original.processStartedAt).toBe("999");
    readStat.mockResolvedValue(`60 (worker ) name) S ${"0 ".repeat(18)}1000`);
    expect(
      await closeLocalPort({
        port: original.port,
        address: original.address,
        pid: 60,
        processStartedAt: original.processStartedAt!,
      }),
    ).toEqual({ closed: false });
    expect(process.kill).not.toHaveBeenCalled();
  });

  it.each([
    { ...row, pid: pid + 1 },
    { ...row, processStartedAt: "new-process" },
    { ...row, address: "::1" },
    { ...row, port: 45124 },
    { ...row, pid: process.pid },
  ])("does not signal a changed or protected listener", async (current) => {
    run.mockResolvedValue({ stdout: JSON.stringify([current]) });
    expect(await closeLocalPort(payload)).toEqual({ closed: false });
    expect(process.kill).not.toHaveBeenCalled();
  });

  it("signals only the selected process and verifies that its listener disappeared", async () => {
    run
      .mockResolvedValueOnce({ stdout: JSON.stringify([row]) })
      .mockResolvedValue({ stdout: "[]" });
    expect(await closeLocalPort(payload)).toEqual({ closed: true });
    expect(process.kill).toHaveBeenCalledExactlyOnceWith(pid, "SIGTERM");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("reports failure when the process retains the listener without escalating", async () => {
    run.mockResolvedValue({ stdout: JSON.stringify([row]) });
    expect(await closeLocalPort(payload)).toEqual({ closed: false });
    expect(process.kill).toHaveBeenCalledExactlyOnceWith(pid, "SIGTERM");
  });
});
