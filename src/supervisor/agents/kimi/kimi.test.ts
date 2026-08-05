import { describe, expect, it } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { resolveSharedUpdateCommand } from "@/shared/agents/updateResolver";
import { createKnownSessionRef } from "../base";
import { createKimiAdapter, resolveKimiEmptyResponseError } from "./index";
import { buildKimiLogoutCommand } from "./kimiLogout";

const location = { kind: "windows", path: "C:\\repo" } as ProjectLocation;
const config = { mode: "agent" } as ThreadConfig;

describe("createKimiAdapter shape", () => {
  const adapter = createKimiAdapter();

  it("exposes identity metadata", () => {
    expect(adapter.kind).toBe("kimi");
    expect(adapter.label).toBe("Kimi Code");
    expect(adapter.binary).toBe("kimi");
  });

  it("re-exposes the update spec on the adapter", () => {
    expect(adapter.update?.npm).toBe("@moonshot-ai/kimi-code");
    // `kimi upgrade` is an interactive TUI, so there is no `builtIn` updater;
    // the update re-runs the non-interactive install script instead.
    expect(adapter.update?.builtIn).toBeUndefined();
    expect(adapter.update?.installer?.posix).toEqual({
      binary: "sh",
      args: ["-c", "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash"],
    });
  });

  it("resolves a non-interactive installer update instead of the interactive `kimi upgrade`", () => {
    // The adapter no longer overrides the shared resolver — it drives the
    // update from the detection spec's `installer`, keeping supervisor and the
    // renderer preview in sync.
    expect(adapter.buildUpdateCommand).toBeUndefined();
    expect(
      resolveSharedUpdateCommand({
        update: adapter.update,
        executablePath: "/home/demo/.kimi-code/bin/kimi",
        envKind: "wsl",
      }),
    ).toEqual({
      binary: "sh",
      args: ["-c", "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash"],
      strategy: "installer",
    });
    expect(
      resolveSharedUpdateCommand({
        update: adapter.update,
        executablePath: "C:\\Users\\demo\\.kimi-code\\bin\\kimi.exe",
        envKind: "windows",
      }),
    ).toEqual({
      binary: "powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "irm https://code.kimi.com/kimi-code/install.ps1 | iex",
      ],
      strategy: "installer",
    });
  });

  it("declares terminal + GUI presentation and a structured session factory", () => {
    expect(adapter.capabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(typeof adapter.createStructuredSession).toBe("function");
  });

  it("provides ACP auth and managed OAuth logout commands", () => {
    expect(typeof adapter.buildAcpAuthCommand).toBe("function");
    expect(typeof adapter.buildAcpLogoutCommand).toBe("function");
  });

  it("neutralizes the browser for the WSL OAuth flow", () => {
    expect(adapter.spawnEnv?.wsl).toEqual({ BROWSER: "/bin/true" });
  });

  it("wires session discovery + watching", () => {
    expect(typeof adapter.discoverSessionRef).toBe("function");
    expect(typeof adapter.watchSessionRef).toBe("function");
    expect(adapter.createInitialSessionRef()).toBeUndefined();
  });

  it("uses Kimi's documented skill directories", () => {
    expect(adapter.skillSupport?.roots).toEqual([
      {
        id: "kimi",
        label: "Kimi Code",
        globalPath: ".kimi-code/skills",
        projectPath: ".kimi-code/skills",
        globalOverride: { env: "KIMI_CODE_HOME", path: "skills" },
      },
      {
        id: "agents",
        label: "Shared agent skills",
        globalPath: ".agents/skills",
        projectPath: ".agents/skills",
      },
    ]);
  });
});

describe("buildKimiLogoutCommand", () => {
  const isWindows = process.platform === "win32";
  const hostEnvKind = isWindows ? "windows" : "posix";

  it("builds the credential-file cleanup spec without any side effect", () => {
    const logout = buildKimiLogoutCommand({ envKind: hostEnvKind });
    expect(logout.args).toContain(isWindows ? "-NoLogo" : "-c");
    expect(logout.args.join(" ")).toContain(isWindows ? "Remove-Item" : "rm -f");
    expect(logout.args.join(" ")).toContain(
      isWindows ? "credentials\\kimi-code.json" : "credentials/kimi-code.json",
    );
  });

  it("removes the managed OAuth token inside the selected WSL distro", () => {
    const logout = buildKimiLogoutCommand({ envKind: "wsl", wslDistro: "Ubuntu" });
    expect(logout.command.toLowerCase()).toContain("wsl");
    expect(logout.args).toContain("Ubuntu");
    expect(logout.args.join(" ")).toContain("credentials/kimi-code.json");
  });

  // Regression: an earlier revision ran the ACP logout RPC inside this
  // builder, so merely asking the adapter for its logout spec signed the user
  // out. dispatchAcpLogout owns the RPC now; the adapter opts in with
  // `preferAcpLogoutRpc`.
  it("is safe to call straight off the adapter, and the RPC is opt-in via dispatch", async () => {
    const adapter = createKimiAdapter();
    expect(adapter.preferAcpLogoutRpc).toBe(true);
    const logout = await adapter.buildAcpLogoutCommand?.({ envKind: hostEnvKind });
    expect(logout?.args.join(" ")).toContain(isWindows ? "Remove-Item" : "rm -f");
  });
});

describe("createKimiAdapter launch / resume argv", () => {
  const adapter = createKimiAdapter();

  it("launches fresh without a sessionRef so discovery can run", () => {
    const result = adapter.buildLaunchArgv(location, config, "", undefined, {});
    expect(result.binary).toBe("kimi");
    expect(result.sessionRef).toBeUndefined();
  });

  it("resumes a discovered id with --session", () => {
    const result = adapter.buildResumeArgv(location, config, "", createKnownSessionRef("sess-123"));
    expect(result.args.slice(0, 2)).toEqual(["--session", "sess-123"]);
  });

  it("falls back to --continue when the ref carries no session id", () => {
    const result = adapter.buildResumeArgv(location, config, "", {
      providerSessionId: "",
      discoveredAt: "",
    });
    expect(result.args).toContain("--continue");
  });
});

describe("createKimiAdapter one-shot", () => {
  const adapter = createKimiAdapter();

  it("defaults to the managed Kimi model alias and builds the headless -p command", () => {
    expect(adapter.defaultOneShotModel).toBe("kimi-code/kimi-for-coding");
    expect(adapter.buildOneShotCommand?.("kimi-code/kimi-for-coding", undefined, "hello")).toEqual({
      command: "kimi",
      args: ["-p", "hello", "-m", "kimi-code/kimi-for-coding", "--output-format", "text"],
      stdin: "",
    });
  });

  it("returns undefined without a prompt", () => {
    expect(
      adapter.buildOneShotCommand?.("kimi-code/kimi-for-coding", undefined, undefined),
    ).toBeUndefined();
  });
});

describe("createKimiAdapter terminal heuristics", () => {
  const adapter = createKimiAdapter();

  it("waits beyond Kimi's paste-burst window before submitting direct input", () => {
    expect(adapter.buildDirectInput?.("hello")).toEqual(["hello", "@wait:200", "\r"]);
  });

  it("maps approval prompts, working spinners, and idle hints", () => {
    expect(adapter.detectTerminalStatus?.("Do you want to proceed?")?.status).toBe(
      "needs_approval",
    );
    expect(adapter.detectTerminalStatus?.("Thinking… esc to interrupt")?.status).toBe("working");
    expect(adapter.detectTerminalStatus?.("⠋ working...")?.status).toBe("working");
    expect(adapter.detectTerminalStatus?.("? for shortcuts")?.status).toBe("idle");
    expect(adapter.detectTerminalStatus?.("context: 10% (23.2k/256k)")?.status).toBe("idle");
  });
});

describe("resolveKimiEmptyResponseError", () => {
  it("explains the Windows credential rename lock", () => {
    expect(
      resolveKimiEmptyResponseError({
        stopReason: "end_turn",
        stderr: [
          "EPERM: operation not permitted, rename 'C:\\\\Users\\\\demo\\\\.kimi-code\\\\credentials\\\\kimi-code.json.tmp' -> 'C:\\\\Users\\\\demo\\\\.kimi-code\\\\credentials\\\\kimi-code.json'",
        ],
      }).message,
    ).toContain("another process is using the credential file");
  });

  it("reports an actionable error for any other empty Kimi turn", () => {
    expect(resolveKimiEmptyResponseError({ stopReason: "end_turn", stderr: [] }).message).toContain(
      "without returning a response",
    );
  });
});
