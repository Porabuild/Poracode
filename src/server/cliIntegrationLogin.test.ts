import { randomUUID } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import {
  controlMcpAuthenticationResultSchema,
  type McpAuthenticationIdentity,
} from "@/shared/contracts/mcpAuthentication";
import { parseIntegrationLoginCli, runIntegrationLoginCli } from "./cliIntegrationLogin";
import { cliCommandHelp } from "./cliHelp";

const descriptors = Object.fromEntries(
  ["isTTY", "isRaw", "setRawMode"].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(process.stdin, name),
  ]),
);
afterEach(() => {
  vi.restoreAllMocks();
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (descriptor) Object.defineProperty(process.stdin, name, descriptor);
    else Reflect.deleteProperty(process.stdin, name);
  }
});
const status = {
  formatVersion: 1,
  scope: "saved-user-oauth",
  server: {
    id: "tools",
    name: "Tools",
    enabled: true,
    transport: "http",
    timeoutMs: 10_000,
    disabledToolCount: 0,
  },
  usableCredentials: false,
  headerAuthorization: false,
  sharedServerIds: ["tools"],
  serverRevision: "ab".repeat(32),
};
function fixture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const output = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk, encoding, callback) => {
      stdout.push(String(chunk));
      (typeof encoding === "function" ? encoding : callback)?.();
      return true;
    });
  const errorOutput = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk, encoding, callback) => {
      stderr.push(String(chunk));
      (typeof encoding === "function" ? encoding : callback)?.();
      return true;
    });
  let target: McpAuthenticationIdentity = { scope: "saved-user", serverId: "tools" };
  const accountId = randomUUID();
  const reply = (command: HostAdminCommand) => {
    if (command.action === "mcp-auth-status") return status;
    if (command.action === "integration-auth-cancel")
      return { version: 1, action: "cancel", operationId: command.operationId, cancelled: true };
    if (command.action === "plugin-account-start")
      target = {
        scope: "plugin-service",
        pluginName: command.pluginName,
        serverName: command.serverName,
        accountId: command.accountId ?? accountId,
      };
    if (command.action === "mcp-auth-start" || command.action === "plugin-account-start")
      return {
        version: 1,
        action: "start",
        operationId: command.operationId,
        target,
        authorization: {
          status: "redirect",
          flowId: randomUUID(),
          authorizationUrl:
            "https://issuer.invalid/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A12345%2Fcallback",
        },
      };
    if (command.action === "mcp-auth-wait" || command.action === "plugin-account-wait")
      return {
        version: 1,
        action: "wait",
        operationId: command.operationId,
        target,
        authorization: { status: "authorized" },
      };
    throw new Error("Unexpected fixture command");
  };
  const request = vi.fn<(command: HostAdminCommand, signal?: AbortSignal) => Promise<unknown>>(
    async (command) => reply(command),
  );
  const connect = vi.fn<() => Promise<typeof request>>(async () => request);
  return { stdout, stderr, output, errorOutput, request, connect, reply, accountId };
}
function input(args: string[]) {
  const parsed = parseIntegrationLoginCli(args);
  if (!parsed) throw new Error("Expected login input");
  return parsed;
}
function tty() {
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  Object.defineProperty(process.stdin, "isRaw", { configurable: true, value: false });
  const setRawMode = vi.fn<(mode: boolean) => typeof process.stdin>((mode) => {
    Object.defineProperty(process.stdin, "isRaw", { configurable: true, value: mode });
    return process.stdin;
  });
  Object.defineProperty(process.stdin, "setRawMode", { configurable: true, value: setRawMode });
  vi.spyOn(process.stdin, "resume").mockReturnValue(process.stdin);
  vi.spyOn(process.stdin, "pause").mockReturnValue(process.stdin);
  return setRawMode;
}

it("performs saved-user login with the reviewed revision and structured start/completion records", async () => {
  const f = fixture();
  await runIntegrationLoginCli(input(["mcp", "auth", "login", "tools", "--json"]), f.connect);
  const calls = f.request.mock.calls.map((call) => call[0]);
  expect(calls.map((command) => command.action)).toEqual([
    "mcp-auth-status",
    "mcp-auth-start",
    "mcp-auth-wait",
  ]);
  expect(calls[1]).toMatchObject({
    serverId: "tools",
    expectedServerRevision: status.serverRevision,
  });
  expect(calls[2]).toMatchObject({
    expectedServerRevision: status.serverRevision,
    serverId: "tools",
  });
  const records = f.stdout.map((line) =>
    controlMcpAuthenticationResultSchema.parse(JSON.parse(line)),
  );
  expect(records.map((record) => record.action)).toEqual(["start", "wait"]);
  expect(records[1]?.operationId).toBe(records[0]?.operationId);
  expect(f.stderr).toEqual([]);
  expect(f.connect).toHaveBeenCalledOnce();
});

it("creates and reauthenticates exact plugin account identities without provider flags", async () => {
  const f = fixture();
  for (const existing of [false, true]) {
    await runIntegrationLoginCli(
      input([
        "plugins",
        "accounts",
        "login",
        "notes",
        "--server",
        "tools",
        "--label",
        "Work",
        "--json",
        ...(existing ? ["--account", f.accountId] : []),
      ]),
      f.connect,
    );
    expect(f.request.mock.calls.at(-1)?.[0]).toMatchObject({
      action: "plugin-account-wait",
      pluginName: "notes",
      serverName: "tools",
      accountId: f.accountId,
    });
  }
  expect(f.request.mock.calls.some((call) => call[0].action.startsWith("mcp-auth"))).toBe(false);
});

it("prints an intentional browser URL and SSH guidance without opening a browser or tunnel", async () => {
  const f = fixture();
  await runIntegrationLoginCli(input(["mcp", "auth", "login", "tools"]), f.connect);
  expect(f.stderr.join("")).toContain("https://issuer.invalid/authorize");
  expect(f.stderr.join("")).toContain("forward");
  expect(f.stdout.join("")).toContain("authentication completed");
  expect(cliCommandHelp("mcp", "auth")).toContain("newline-delimited");
  expect(cliCommandHelp("plugins", "accounts")).toContain("--label");
});

it.each(
  [
    ["mcp", "auth", "login"],
    ["mcp", "auth", "login", "tools", "--wsl", "Distro"],
    ["mcp", "auth", "login", "tools", "--account", randomUUID()],
    ["plugins", "accounts", "login", "notes", "--label", "Work"],
    ["plugins", "accounts", "login", "notes", "--server", "tools"],
    [
      "plugins",
      "accounts",
      "login",
      "notes",
      "--server",
      "tools",
      "--label",
      "Work",
      "--account",
      "other",
    ],
  ].map((args) => ({ args })),
)("refuses incomplete or cross-domain login flags before contact ($args)", ({ args }) => {
  expect(() => parseIntegrationLoginCli(args)).toThrow(/Usage:|Unknown option/u);
});

it("refuses a manual Authorization header before starting a flow", async () => {
  const f = fixture();
  f.request.mockResolvedValue({ ...status, headerAuthorization: true });
  await expect(
    runIntegrationLoginCli(input(["mcp", "auth", "login", "tools"]), f.connect),
  ).rejects.toThrow("Authorization header");
  expect(f.request).toHaveBeenCalledOnce();
  expect(f.stdout).toEqual([]);
});

it.each(["stdin", "stdout", "stderr"] as const)(
  "joins cancellation after an active %s error and preserves the original error",
  async (name) => {
    const f = fixture();
    const entered = Promise.withResolvers<void>();
    const retired = Promise.withResolvers<void>();
    const error = new Error(`${name} fixture failure`);
    f.request.mockImplementation(async (command, signal) => {
      if (command.action === "mcp-auth-start") {
        entered.resolve();
        await new Promise<void>((_resolve, reject) =>
          signal!.addEventListener("abort", () => reject(new Error("Request canceled")), {
            once: true,
          }),
        );
      }
      if (command.action === "integration-auth-cancel") await retired.promise;
      return f.reply(command);
    });
    const before = process[name].listenerCount("error");
    let settled = false;
    const outcome = runIntegrationLoginCli(
      input(["mcp", "auth", "login", "tools"]),
      f.connect,
    ).then(
      () => undefined,
      (failure) => {
        settled = true;
        return failure;
      },
    );
    await entered.promise;
    process[name].emit("error", error);
    try {
      await setImmediate();
      expect(settled).toBe(false);
      expect(f.request.mock.calls.at(-1)?.[0].action).toBe("integration-auth-cancel");
    } finally {
      retired.resolve();
    }
    expect(await outcome).toBe(error);
    expect(process[name].listenerCount("error")).toBe(before);
    expect(f.stdout).toEqual([]);
  },
);

it("Ctrl+C joins an outstanding output callback and restores raw mode/listeners", async () => {
  const f = fixture();
  const setRawMode = tty();
  const written = Promise.withResolvers<void>();
  let finishOutput: (() => void) | undefined;
  f.errorOutput.mockImplementationOnce((_chunk, encoding, callback) => {
    const done = typeof encoding === "function" ? encoding : callback;
    finishOutput = () => done?.();
    written.resolve();
    return true;
  });
  const listeners = process.stdin.listenerCount("data");
  let settled = false;
  const outcome = runIntegrationLoginCli(input(["mcp", "auth", "login", "tools"]), f.connect).then(
    () => undefined,
    (error) => {
      settled = true;
      return error;
    },
  );
  await written.promise;
  process.stdin.emit("data", Buffer.from([3]));
  try {
    await setImmediate();
    expect(settled).toBe(false);
    expect(f.request.mock.calls.at(-1)?.[0].action).toBe("integration-auth-cancel");
  } finally {
    finishOutput?.();
  }
  expect(await outcome).toMatchObject({ message: "Integration login canceled." });
  expect(setRawMode.mock.calls).toEqual([[true], [false]]);
  expect(process.stdin.listenerCount("data")).toBe(listeners);
});

it("refuses a wrong target before printing its authorization URL and confirms scoped cleanup", async () => {
  const f = fixture();
  f.request.mockImplementation(async (command) => {
    const result = f.reply(command);
    return command.action === "mcp-auth-start"
      ? { ...result, target: { scope: "saved-user", serverId: "other" } }
      : result;
  });
  await expect(
    runIntegrationLoginCli(input(["mcp", "auth", "login", "tools", "--json"]), f.connect),
  ).rejects.toThrow("different integration login account");
  expect(f.stdout).toEqual([]);
  expect(f.request.mock.calls.at(-1)?.[0].action).toBe("integration-auth-cancel");
});

it.each(["stdout", "stderr"] as const)(
  "joins a held %s callback after a stream error",
  async (name) => {
    const f = fixture();
    const written = Promise.withResolvers<void>();
    const error = new Error("Output callback fixture failure");
    let finish: (() => void) | undefined;
    const output = name === "stdout" ? f.output : f.errorOutput;
    output.mockImplementationOnce((_chunk, encoding, callback) => {
      const done = typeof encoding === "function" ? encoding : callback;
      finish = () => done?.(error);
      written.resolve();
      return true;
    });
    const before = process[name].listenerCount("error");
    let settled = false;
    const outcome = runIntegrationLoginCli(
      input(["mcp", "auth", "login", "tools", ...(name === "stdout" ? ["--json"] : [])]),
      f.connect,
    ).then(
      () => undefined,
      (failure: unknown) => {
        settled = true;
        return failure;
      },
    );
    await written.promise;
    process[name].emit("error", error);
    try {
      await setImmediate();
      expect(settled).toBe(false);
      expect(f.request.mock.calls.at(-1)?.[0].action).toBe("integration-auth-cancel");
    } finally {
      finish?.();
    }
    expect(await outcome).toBe(error);
    expect(process[name].listenerCount("error")).toBe(before);
  },
);

it("still removes all listeners when restoring raw mode fails", async () => {
  const f = fixture();
  const setRawMode = tty();
  const error = new Error("Raw mode fixture restore failure");
  setRawMode.mockImplementation((mode) => {
    if (!mode) throw error;
    return process.stdin;
  });
  const before = [process.stdin, process.stdout, process.stderr].map((stream) =>
    stream.listenerCount("error"),
  );
  await expect(
    runIntegrationLoginCli(input(["mcp", "auth", "login", "tools", "--json"]), f.connect),
  ).rejects.toMatchObject({ errors: [error] });
  expect(
    [process.stdin, process.stdout, process.stderr].map((stream) => stream.listenerCount("error")),
  ).toEqual(before);
});
