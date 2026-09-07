import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentAdapter, CommandSpec } from "../base";
import { dispatchAcpAuthenticate, dispatchAcpLogout } from "./dispatch";

const authenticateAcpAgentMock = vi.hoisted(() =>
  vi.fn<
    (
      command: string,
      args: string[],
      methodId: string,
      options?: {
        processCwd?: string;
        env?: Record<string, string>;
        label?: string;
        timeoutMs?: number;
      },
    ) => Promise<void>
  >(),
);
const readCommandOutputAsyncMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; stdout: string; stderr: string }>>(),
);
const logoutAcpAgentMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());

vi.mock("./probe", () => ({
  authenticateAcpAgent: authenticateAcpAgentMock,
  logoutAcpAgent: logoutAcpAgentMock,
}));

vi.mock("../base", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../base")>();
  return {
    ...actual,
    readCommandOutputAsync: readCommandOutputAsyncMock,
  };
});

function makeAdapter(command: CommandSpec, overrides: Partial<AgentAdapter> = {}): AgentAdapter {
  return {
    kind: "cursor",
    label: "Cursor",
    binary: "cursor-agent",
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal", "gui"],
      settingDefs: [],
    },
    async detectInstall() {
      throw new Error("not used");
    },
    buildLaunchArgv() {
      throw new Error("not used");
    },
    buildResumeArgv() {
      throw new Error("not used");
    },
    async buildAcpAuthCommand() {
      return command;
    },
    createInitialSessionRef() {
      return undefined;
    },
    ...overrides,
  };
}

describe("dispatchAcpAuthenticate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateAcpAgentMock.mockResolvedValue(undefined);
    logoutAcpAgentMock.mockResolvedValue(undefined);
    readCommandOutputAsyncMock.mockResolvedValue({ ok: true, stdout: "", stderr: "" });
  });

  it("injects the native browser launcher into WSL ACP auth commands", async () => {
    await dispatchAcpAuthenticate({
      adapter: makeAdapter({
        command: "C:\\Windows\\System32\\wsl.exe",
        args: [
          "-d",
          "Ubuntu",
          "--cd",
          "/tmp",
          "--",
          "/bin/bash",
          "-l",
          "-i",
          "-c",
          "exec 'cursor-agent' 'acp'",
        ],
      }),
      methodId: "browser-login",
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });

    const [command, args, methodId, options] = authenticateAcpAgentMock.mock.calls[0]!;
    expect(command).toMatch(/wsl(?:\.exe)?$/u);
    expect(methodId).toBe("browser-login");
    expect(args.at(-1)).toContain("export BROWSER='cmd.exe /c start \"\"'");
    expect(args.at(-1)).toContain("exec 'cursor-agent' 'acp'");
    expect(options).not.toHaveProperty("env");
  });

  it("does not re-inject command env that is already baked into WSL auth commands", async () => {
    await dispatchAcpAuthenticate({
      adapter: makeAdapter({
        command: "C:\\Windows\\System32\\wsl.exe",
        args: [
          "-d",
          "Ubuntu",
          "--cd",
          "/tmp",
          "--",
          "/bin/bash",
          "-l",
          "-i",
          "-c",
          "export CURSOR_CONFIG='/tmp/config'; exec 'cursor-agent' 'acp'",
        ],
        env: { CURSOR_CONFIG: "/tmp/config" },
      }),
      methodId: "browser-login",
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });

    const [, args] = authenticateAcpAgentMock.mock.calls[0]!;
    const script = String(args.at(-1));
    expect(script.match(/export CURSOR_CONFIG=/gu)).toHaveLength(1);
    expect(script).toContain("export BROWSER='cmd.exe /c start \"\"'");
  });

  it("injects base and browser env into WSL ACP auth commands", async () => {
    await dispatchAcpAuthenticate({
      adapter: makeAdapter(
        {
          command: "C:\\Windows\\System32\\wsl.exe",
          args: ["-d", "Ubuntu", "--", "/bin/bash", "-l", "-i", "-c", "exec 'muse' 'serve'"],
        },
        { baseSpawnEnv: { MUSE_NO_AUTO_UPDATE: "1" } },
      ),
      methodId: "browser-login",
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });

    const [, args, , options] = authenticateAcpAgentMock.mock.calls[0]!;
    const script = String(args.at(-1));
    expect(script).toContain("export MUSE_NO_AUTO_UPDATE='1'");
    expect(script).toContain("export BROWSER='cmd.exe /c start \"\"'");
    expect(options).not.toHaveProperty("env");
  });
});

describe("dispatchAcpLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logoutAcpAgentMock.mockResolvedValue(undefined);
    readCommandOutputAsyncMock.mockResolvedValue({ ok: true, stdout: "", stderr: "" });
  });

  it("dispatches adapter-provided logout commands", async () => {
    await dispatchAcpLogout({
      adapter: makeAdapter(
        { command: "cursor-agent", args: ["acp"] },
        {
          async buildAcpLogoutCommand() {
            return { command: "cursor-agent", args: ["logout"], cwd: "/repo" };
          },
        },
      ),
      // WSL probe locations pass spec.cwd through; posix hosts redirect into agent-probe.
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });

    expect(readCommandOutputAsyncMock).toHaveBeenCalledWith("cursor-agent", ["logout"], {
      cwd: "/repo",
    });
  });

  describe("preferAcpLogoutRpc", () => {
    function makeRpcFirstAdapter(): AgentAdapter {
      return makeAdapter(
        { command: "kimi", args: ["acp"] },
        {
          preferAcpLogoutRpc: true,
          async buildAcpLogoutCommand() {
            return { command: "sh", args: ["-c", "rm -f -- creds.json"] };
          },
        },
      );
    }

    it("runs the ACP logout RPC before the adapter's logout command", async () => {
      const order: string[] = [];
      logoutAcpAgentMock.mockImplementationOnce(async () => {
        order.push("rpc");
      });
      readCommandOutputAsyncMock.mockImplementationOnce(async () => {
        order.push("command");
        return { ok: true, stdout: "", stderr: "" };
      });

      await dispatchAcpLogout({ adapter: makeRpcFirstAdapter(), envKind: "posix" });

      expect(order).toEqual(["rpc", "command"]);
      expect(logoutAcpAgentMock.mock.calls[0]?.[0]).toBe("kimi");
      expect(logoutAcpAgentMock.mock.calls[0]?.[1]).toEqual(["acp"]);
    });

    it("skips the RPC for adapters that do not opt in", async () => {
      await dispatchAcpLogout({
        adapter: makeAdapter(
          { command: "cursor-agent", args: ["acp"] },
          {
            async buildAcpLogoutCommand() {
              return { command: "cursor-agent", args: ["logout"] };
            },
          },
        ),
        envKind: "posix",
      });

      expect(logoutAcpAgentMock).not.toHaveBeenCalled();
      expect(readCommandOutputAsyncMock).toHaveBeenCalledTimes(1);
    });

    it("still runs the logout command when the agent has no logout RPC", async () => {
      logoutAcpAgentMock.mockRejectedValueOnce(
        new Error("ACP logout is not supported by this agent."),
      );

      await dispatchAcpLogout({ adapter: makeRpcFirstAdapter(), envKind: "posix" });

      expect(readCommandOutputAsyncMock).toHaveBeenCalledTimes(1);
    });

    // A stalled or unspawnable ACP server must not strand the user signed in:
    // the credential-file command is what the adapter relied on before the RPC
    // existed, so it runs regardless of why the RPC failed.
    it("still runs the logout command when the RPC fails unexpectedly", async () => {
      logoutAcpAgentMock.mockRejectedValueOnce(new Error("ACP logout timed out"));

      await dispatchAcpLogout({ adapter: makeRpcFirstAdapter(), envKind: "posix" });

      expect(readCommandOutputAsyncMock).toHaveBeenCalledTimes(1);
    });
  });

  it("throws when the adapter returns no logout command", async () => {
    await expect(
      dispatchAcpLogout({
        adapter: makeAdapter(
          { command: "cursor-agent", args: ["acp"] },
          { buildAcpLogoutCommand: async () => undefined },
        ),
        envKind: "windows",
      }),
    ).rejects.toThrow("did not return an ACP logout command");
  });
});

describe("baseSpawnEnv — every ACP auth/logout spawn carries the adapter's base env", () => {
  const baseSpawnEnv = { DROID_DISABLE_AUTO_UPDATE: "true" };

  beforeEach(() => {
    vi.clearAllMocks();
    authenticateAcpAgentMock.mockResolvedValue(undefined);
    logoutAcpAgentMock.mockResolvedValue(undefined);
    readCommandOutputAsyncMock.mockResolvedValue({ ok: true, stdout: "", stderr: "" });
  });

  it("applies it to ACP auth commands", async () => {
    await dispatchAcpAuthenticate({
      adapter: makeAdapter({ command: "droid", args: ["exec"] }, { baseSpawnEnv }),
      methodId: "login",
      envKind: "posix",
    });

    const [, , , options] = authenticateAcpAgentMock.mock.calls[0]!;
    expect(options?.env).toMatchObject(baseSpawnEnv);
  });

  it("lets command-declared env win over the base env", async () => {
    await dispatchAcpAuthenticate({
      adapter: makeAdapter(
        { command: "droid", args: ["exec"], env: { DROID_DISABLE_AUTO_UPDATE: "false" } },
        { baseSpawnEnv },
      ),
      methodId: "login",
      envKind: "posix",
    });

    const [, , , options] = authenticateAcpAgentMock.mock.calls[0]!;
    expect(options?.env).toMatchObject({ DROID_DISABLE_AUTO_UPDATE: "false" });
  });

  it("applies it to direct logout commands", async () => {
    await dispatchAcpLogout({
      adapter: makeAdapter(
        { command: "droid", args: ["exec"] },
        {
          baseSpawnEnv,
          async buildAcpLogoutCommand() {
            return { command: "droid", args: ["logout"] };
          },
        },
      ),
      envKind: "posix",
    });

    const [, , options] = readCommandOutputAsyncMock.mock.calls[0]!;
    expect(options).toEqual(
      expect.objectContaining({ env: expect.objectContaining(baseSpawnEnv) }),
    );
  });

  it("injects it into direct WSL logout commands", async () => {
    await dispatchAcpLogout({
      adapter: makeAdapter(
        { command: "muse", args: ["serve"] },
        {
          baseSpawnEnv: { MUSE_NO_AUTO_UPDATE: "1" },
          async buildAcpLogoutCommand() {
            return {
              command: "C:\\Windows\\System32\\wsl.exe",
              args: ["-d", "Ubuntu", "--", "/bin/bash", "-l", "-i", "-c", "muse logout"],
            };
          },
        },
      ),
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });

    const [, args, options] = readCommandOutputAsyncMock.mock.calls[0]!;
    expect(String((args as string[]).at(-1))).toContain("export MUSE_NO_AUTO_UPDATE='1'");
    expect(options).toBeUndefined();
  });

  it("applies it to the logout RPC fallback", async () => {
    await dispatchAcpLogout({
      adapter: makeAdapter({ command: "droid", args: ["exec"] }, { baseSpawnEnv }),
      envKind: "posix",
    });

    const options = logoutAcpAgentMock.mock.calls[0]?.[2] as
      | { env?: Record<string, string> }
      | undefined;
    expect(options?.env).toMatchObject(baseSpawnEnv);
  });
});
