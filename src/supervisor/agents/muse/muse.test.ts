import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, ResolvedMcpServer, ThreadConfig } from "@/shared/contracts";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
}));

const detectAgentInstallMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
const readAgentCommandOutputMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; stdout: string; stderr: string }>>(),
);
const resolveAgentBinaryPathMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => string | undefined>(),
);
const prepareAgentLocationEnvironmentMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
);

vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: resolveAgentBinaryPathMock }));

vi.mock("../base", async () => {
  const actual = await vi.importActual<typeof import("../base")>("../base");
  return {
    ...actual,
    detectAgentInstall: detectAgentInstallMock,
    readAgentCommandOutput: readAgentCommandOutputMock,
    prepareAgentLocationEnvironment: prepareAgentLocationEnvironmentMock,
  };
});

import { createKnownSessionRef } from "../base";
import { museDefaultCapabilities } from "./detection";
import { createMuseAdapter } from "./index";
import {
  discoverMuseSessionRef,
  isMuseSessionUuid,
  snapshotMusePreSpawnSessions,
} from "./sessionFiles";
import { detectMuseTerminalStatus, isMuseReadyForInitialPrompt } from "./terminal";
import { buildMuseTerminalMcpForLocation } from "./mcpSupport";

const location = { kind: "posix", path: "/tmp/demo" } as ProjectLocation;
const config = { mode: "agent", model: "muse-spark-1.3" } as ThreadConfig;

describe("createMuseAdapter shape", () => {
  const adapter = createMuseAdapter();

  it("exposes identity metadata", () => {
    expect(adapter.kind).toBe("muse");
    expect(adapter.label).toBe("Muse Code");
    expect(adapter.binary).toBe("muse");
  });

  it("re-exposes the installer-only update spec on the adapter", () => {
    expect(adapter.update?.builtIn).toBeUndefined();
    expect(adapter.update?.npm).toBeUndefined();
    expect(adapter.update?.installer?.posix).toEqual({
      binary: "sh",
      args: ["-c", "curl -fsSL https://dev.meta.ai/install.sh | bash"],
    });
    expect(adapter.update?.installer?.windows).toEqual({
      binary: "powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "irm https://dev.meta.ai/install.ps1 | iex",
      ],
    });
  });

  it("advertises terminal and MSP-backed GUI presentations", () => {
    expect(adapter.capabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(adapter.capabilities.liveInputMode).toBe("terminal");
    expect(adapter.createStructuredSession).toBeTypeOf("function");
  });

  it("neutralizes the browser for the WSL OAuth flow", () => {
    expect(adapter.spawnEnv?.wsl).toEqual({ BROWSER: "/bin/true" });
  });

  it("uses the stdio launcher to preserve an MCP server working directory", () => {
    expect(adapter.mcpRequiresStdioCwdProxy).toBe(true);
  });

  it("builds a `muse logout` command so the Settings logout button can drive it", async () => {
    const command = await adapter.buildAcpLogoutCommand?.();
    expect(command).toBeDefined();
    const args = command?.args ?? [];
    const rendered = args.includes("-EncodedCommand")
      ? Buffer.from(args.at(-1) ?? "", "base64").toString("utf16le")
      : `${command?.command ?? ""} ${args.join(" ")}`;
    expect(rendered).toMatch(/muse/i);
    expect(rendered).toContain("logout");
  });

  it("wires session discovery + watching and mints no initial ref", () => {
    expect(typeof adapter.discoverSessionRef).toBe("function");
    expect(typeof adapter.watchSessionRef).toBe("function");
    expect(adapter.createInitialSessionRef()).toBeUndefined();
  });

  it("advertises one-shot generation through muse exec", () => {
    expect(adapter.defaultOneShotModel).toBe("muse-spark-1.3");
    expect(adapter.buildOneShotCommand).toBeTypeOf("function");
    expect(adapter.capabilities.supportsOneShot).toBe(true);
  });
});

describe("createMuseAdapter launch / resume argv", () => {
  const adapter = createMuseAdapter();

  it("launches fresh without a sessionRef so discovery can run", async () => {
    const result = await adapter.buildLaunchArgv(location, config, "hi");
    expect(result.binary).toBe("muse");
    expect(result.sessionRef).toBeUndefined();
    expect(result.args).toEqual(["--trust-workspace", "--model", "muse-spark-1.3", "hi"]);
  });

  it("resumes a discovered id with resume <uuid>", async () => {
    const id = "966713f1-794f-480e-aa37-713e8387fe8e";
    const result = await adapter.buildResumeArgv(
      location,
      { ...config, approvalPolicy: "yolo", effort: "low" },
      "",
      createKnownSessionRef(id),
    );
    expect(result.binary).toBe("muse");
    expect(result.args).toEqual([
      "resume",
      id,
      "--trust-workspace",
      "--model",
      "muse-spark-1.3",
      "--reasoning-effort",
      "low",
      "--yolo",
    ]);
  });

  it.each(["old", "failed", "rejected"])(
    "withholds -c MCP settings after an %s launch probe",
    async (outcome) => {
      if (outcome === "rejected")
        readAgentCommandOutputMock.mockRejectedValueOnce(new Error("spawn failed"));
      else
        readAgentCommandOutputMock.mockResolvedValueOnce({
          ok: outcome === "old",
          stdout: "muse --help",
          stderr: "",
        });
      const unprobed = createMuseAdapter();
      const mcpServers: ResolvedMcpServer[] = [
        {
          id: "app-controls",
          name: "poracode",
          timeoutMs: 30_000,
          transport: {
            type: "http",
            url: "http://127.0.0.1:1234/mcp?threadId=t1",
            headers: { Authorization: "Bearer [REDACTED]" },
          },
        },
      ];
      const launched = await unprobed.buildLaunchArgv(location, config, "hi", undefined, {
        mcpServers,
      });
      expect(launched.args).not.toContain("-c");
      expect(launched.args.some((arg) => arg.startsWith("mcpServers."))).toBe(false);
      expect(launched.env).toBeUndefined();
    },
  );

  it("delivers launch MCP servers as -c settings with env-carried secrets", async () => {
    readAgentCommandOutputMock.mockResolvedValue({
      ok: true,
      stdout: "-c, --config <KEY=VALUE>",
      stderr: "",
    });
    const probed = createMuseAdapter();
    const mcpServers: ResolvedMcpServer[] = [
      {
        id: "app-controls",
        name: "poracode",
        timeoutMs: 30_000,
        transport: {
          type: "http",
          url: "http://127.0.0.1:1234/mcp?threadId=t1",
          headers: { Authorization: "Bearer launch-token" },
        },
      },
    ];
    const launched = await probed.buildLaunchArgv(location, config, "hi", undefined, {
      mcpServers,
    });
    const flagIndex = launched.args.findIndex((arg) => arg.startsWith("mcpServers.poracode="));
    expect(flagIndex).toBeGreaterThan(0);
    // Option section only: the positional prompt stays last.
    expect(launched.args.at(-1)).toBe("hi");
    expect(launched.args.join(" ")).not.toContain("launch-token");
    expect(Object.values(launched.env ?? {})).toContain("Bearer launch-token");

    const resumed = await probed.buildResumeArgv(
      location,
      config,
      "",
      createKnownSessionRef("966713f1-794f-480e-aa37-713e8387fe8e"),
      { mcpServers },
    );
    expect(resumed.args.slice(0, 2)).toEqual(["resume", "966713f1-794f-480e-aa37-713e8387fe8e"]);
    expect(resumed.args.some((arg) => arg.startsWith("mcpServers.poracode="))).toBe(true);
    expect(Object.values(resumed.env ?? {})).toContain("Bearer launch-token");
    expect(readAgentCommandOutputMock).toHaveBeenCalledWith(location, "muse", ["--help"], {
      timeoutMs: 8_000,
      env: { MUSE_NO_AUTO_UPDATE: "1" },
    });
  });

  it("probes and launches the same resolved binary instead of a different shell binary", async () => {
    resolveAgentBinaryPathMock
      .mockReturnValueOnce("/selected/muse")
      .mockReturnValueOnce("/selected/muse");
    readAgentCommandOutputMock.mockResolvedValue({ ok: true, stdout: "muse --help", stderr: "" });
    const probed = createMuseAdapter();
    const mcpServers: ResolvedMcpServer[] = [
      {
        id: "proof",
        name: "proof",
        timeoutMs: 30_000,
        transport: { type: "http", url: "http://localhost/mcp", headers: {} },
      },
    ];
    const launched = await probed.buildLaunchArgv(location, config, "hi", undefined, {
      mcpServers,
    });
    const resumed = await probed.buildResumeArgv(
      location,
      config,
      "",
      createKnownSessionRef("session-id"),
      { mcpServers },
    );
    expect(launched.binary).toBe("/selected/muse");
    expect(resumed.binary).toBe("/selected/muse");
    expect(launched.args).not.toContain("-c");
    expect(resumed.args).not.toContain("-c");
    expect(readAgentCommandOutputMock).toHaveBeenCalledWith(
      location,
      "/selected/muse",
      ["--help"],
      expect.anything(),
    );
    expect(prepareAgentLocationEnvironmentMock).toHaveBeenCalledWith(location);
  });

  it.each([true, false])(
    "probes each execution target regardless of detection order (native first: %s)",
    async (nativeFirst) => {
      const targets: ProjectLocation[] = [
        { kind: "windows", path: "C:\\repo" },
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
        },
      ];
      readAgentCommandOutputMock.mockImplementation(async (target) => ({
        ok: true,
        stdout: (target as ProjectLocation).kind === "wsl" ? "--config <KEY=VALUE>" : "muse --help",
        stderr: "",
      }));
      const probed = createMuseAdapter();
      for (const target of nativeFirst ? targets : targets.toReversed()) {
        detectAgentInstallMock.mockResolvedValueOnce({
          capabilities: {
            ...museDefaultCapabilities,
            mcpScope: { terminal: target.kind === "wsl" ? "launch" : "none", gui: "none" },
          },
        });
        await probed.detectInstall(
          target.kind === "wsl"
            ? { envKind: "wsl", wslDistro: target.distro }
            : { envKind: target.kind },
        );
      }
      const mcpServers: ResolvedMcpServer[] = [
        {
          id: "app-controls",
          name: "poracode",
          timeoutMs: 30_000,
          transport: { type: "http", url: "http://localhost/mcp", headers: {} },
        },
      ];
      for (const target of targets) {
        const launched = await probed.buildLaunchArgv(target, config, "hi", undefined, {
          mcpServers,
        });
        const resumed = await probed.buildResumeArgv(
          target,
          config,
          "",
          createKnownSessionRef("session-id"),
          { mcpServers },
        );
        expect(launched.args.includes("-c")).toBe(target.kind === "wsl");
        expect(resumed.args.includes("-c")).toBe(target.kind === "wsl");
      }
    },
  );

  it("chunks direct input with a paste-safe Enter delay", () => {
    expect(adapter.buildDirectInput?.("hello")).toEqual(["hello", "@wait:200", "\x1b[13;1u"]);
  });

  it("submits Windows console input with carriage return instead of Kitty Enter", () => {
    expect(
      adapter.buildDirectInput?.("hello", undefined, undefined, {
        kind: "windows",
        path: "C:\\repo",
      }),
    ).toEqual(["hello", "@wait:200", "\r"]);
  });

  it("defers initial prompts to the TUI so resumed sessions receive them", () => {
    expect(adapter.shouldDeferPromptToTerminal?.(config)).toBe(true);
  });

  it("runs one-shot prompts through muse exec as a read-only invocation", () => {
    expect(adapter.buildOneShotCommand?.("muse-spark-1.1", "low", "write a title")).toEqual({
      command: "muse",
      args: [
        "exec",
        "--no-session-log",
        "--trust-workspace",
        "--disable-write",
        "--disable-shell",
        "--user-input-auto-resolve",
        "--model",
        "muse-spark-1.1",
        "--reasoning-effort",
        "low",
        "write a title",
      ],
      stdin: "",
    });
    expect(adapter.buildOneShotCommand?.("", undefined, undefined)).toBeUndefined();
  });
});

describe("Muse Windows launcher", () => {
  it.each([true, false])("uses the installed executable with MCP enabled: %s", async (withMcp) => {
    const root = mkdtempSync(join(tmpdir(), "muse-launcher-"));
    const shim = join(root, "muse.cmd");
    const executable = join(root, "muse-bin-1.4.12-R6909.1.exe");
    writeFileSync(shim, "@echo off");
    writeFileSync(executable, "");
    writeFileSync(join(root, ".muse-version"), "1.4.12-R6909.1\n");
    resolveAgentBinaryPathMock.mockReturnValue(shim);
    readAgentCommandOutputMock.mockClear();
    readAgentCommandOutputMock.mockResolvedValue({
      ok: true,
      stdout: "--config <KEY=VALUE>",
      stderr: "",
    });
    const mcpServers: ResolvedMcpServer[] = withMcp
      ? [
          {
            id: "tools",
            name: "tools",
            timeoutMs: 30_000,
            transport: { type: "http", url: "https://example.test/mcp", headers: {} },
          },
        ]
      : [];
    try {
      const target: ProjectLocation = { kind: "windows", path: root };
      const adapter = createMuseAdapter();
      const launched = await adapter.buildLaunchArgv(target, config, "hi", undefined, {
        mcpServers,
      });
      const resumed = await adapter.buildResumeArgv(
        target,
        config,
        "",
        createKnownSessionRef("session"),
        { mcpServers },
      );
      expect(launched.binary).toBe(executable);
      expect(resumed.binary).toBe(executable);
      expect(launched.args.includes("-c")).toBe(withMcp);
      expect(readAgentCommandOutputMock.mock.calls.map((call) => call[1])).toEqual(
        withMcp ? [executable, executable] : [],
      );
    } finally {
      resolveAgentBinaryPathMock.mockReset();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([undefined, "../../outside", "future-version", "1.0.2-R1.1"])(
    "keeps the shim for an older or incomplete installation (%s)",
    async (version) => {
      const root = mkdtempSync(join(tmpdir(), "muse-launcher-"));
      const shim = join(root, "muse.cmd");
      writeFileSync(shim, "@echo off");
      if (version !== undefined) writeFileSync(join(root, ".muse-version"), version);
      resolveAgentBinaryPathMock.mockReturnValue(shim);
      try {
        const launch = await buildMuseTerminalMcpForLocation({ kind: "windows", path: root }, []);
        expect(launch.binary).toBe(shim);
      } finally {
        resolveAgentBinaryPathMock.mockReset();
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

describe("detectMuseTerminalStatus", () => {
  // Strings grounded in real echo-provider TUI captures
  // (`muse --provider echo --no-session-log --trust-workspace "say hello"`):
  // 0.1.0 (`Working / esc to interrupt / Voice input / Muse Code` header) and
  // 1.0.2 (adds `◇ Thinking` / `◇ Double checking` states, `@ to search`
  // composer hint, `Muse Code 1.0.2` header).

  it("detects working from esc to interrupt", () => {
    expect(detectMuseTerminalStatus("◆ Working (0s · esc to interrupt)")).toMatchObject({
      status: "working",
      attention: "working",
    });
  });

  it("detects working from the Finishing status strip", () => {
    expect(detectMuseTerminalStatus("◆ Finishing (1s · esc to interrupt)")).toMatchObject({
      status: "working",
    });
  });

  it("detects working from the 1.0.2 Thinking state without an interrupt suffix", () => {
    // The Thinking frame carries no `esc to interrupt` text, and the
    // always-visible `Muse Code` header would otherwise read as idle.
    expect(detectMuseTerminalStatus("echo · ◇ Thinking")).toMatchObject({
      status: "working",
      attention: "working",
    });
  });

  it("detects working from the 1.0.2 Double checking state", () => {
    expect(detectMuseTerminalStatus("◇ Double checking (0s · esc to interrupt)")).toMatchObject({
      status: "working",
    });
  });

  it("falls back to idle on composer hints / Muse Code chrome", () => {
    expect(detectMuseTerminalStatus("Voice input (⌥ + v to start)")).toMatchObject({
      status: "idle",
      attention: "none",
    });
    expect(
      detectMuseTerminalStatus("Type @ to search and insert workspace file paths"),
    ).toMatchObject({
      status: "idle",
      attention: "none",
    });
    expect(detectMuseTerminalStatus("Muse Code 0.1.0")).toMatchObject({ status: "idle" });
    expect(detectMuseTerminalStatus("Muse Code 1.0.2")).toMatchObject({ status: "idle" });
  });

  it("corroborates idle only when composer hint and header co-occur", () => {
    // The shared matcher requires EVERY fallback entry to match; the two
    // version-specific composer hints are one entry so either corroborates.
    expect(
      detectMuseTerminalStatus("Muse Code 1.0.2\nType @ to search and insert workspace file paths"),
    ).toMatchObject({ status: "idle", corroborated: true });
    expect(detectMuseTerminalStatus("Muse Code 0.1.0\nVoice input (⌥ + v to start)")).toMatchObject(
      { status: "idle", corroborated: true },
    );
    expect(detectMuseTerminalStatus("Muse Code 1.0.2")).toMatchObject({
      status: "idle",
      corroborated: false,
    });
  });

  it("detects generic approval prompts conservatively", () => {
    expect(detectMuseTerminalStatus("Allow shell command? [y/n]")).toMatchObject({
      status: "needs_approval",
      attention: "needs_approval",
    });
  });
});

describe("isMuseReadyForInitialPrompt", () => {
  it("is ready once Muse chrome has painted", () => {
    expect(isMuseReadyForInitialPrompt("Muse Code 0.1.0")).toBe(true);
    expect(isMuseReadyForInitialPrompt("Voice input (⌥ + v to start)")).toBe(true);
    expect(isMuseReadyForInitialPrompt("⟩")).toBe(true);
    expect(isMuseReadyForInitialPrompt("")).toBe(false);
    expect(isMuseReadyForInitialPrompt("loading…")).toBe(false);
  });
});

describe("muse session discovery (native)", () => {
  let dataHome: string;
  let previousXdg: string | undefined;
  let loc: ProjectLocation;
  const workspacePath = join(tmpdir(), "muse-proj");

  const makeSession = (ymd: [string, string, string], id: string, workspace = workspacePath) => {
    const dir = join(dataHome, "sessions", ...ymd, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "session.jsonl"),
      `${JSON.stringify({
        payload_type: "runtime.session.metadata",
        payload: { record: { workspace_root: workspace } },
      })}\n`,
    );
    return dir;
  };

  beforeEach(() => {
    dataHome = mkdtempSync(join(tmpdir(), "muse-data-"));
    previousXdg = process.env["XDG_DATA_HOME"];
    process.env["XDG_DATA_HOME"] = dataHome;
    // nativeMuseDataHome joins XDG_DATA_HOME + "muse", so nest under a parent.
    // Actually nativeMuseDataHome = join(XDG_DATA_HOME, "muse"). Override so
    // sessions land at $XDG_DATA_HOME/muse/sessions — set XDG to the parent of
    // our temp muse tree.
    process.env["XDG_DATA_HOME"] = dataHome;
    // paths: join(xdg, "muse") → dataHome/muse. Recreate layout under that.
    dataHome = join(dataHome, "muse");
    mkdirSync(join(dataHome, "sessions"), { recursive: true });
    loc = { kind: "posix", path: workspacePath } as ProjectLocation;
  });

  afterEach(() => {
    if (previousXdg === undefined) delete process.env["XDG_DATA_HOME"];
    else process.env["XDG_DATA_HOME"] = previousXdg;
    // dataHome is …/muse; parent is the mkdtemp root
    const parent = join(dataHome, "..");
    rmSync(parent, { recursive: true, force: true });
  });

  it("recognizes Muse session UUIDs", () => {
    expect(isMuseSessionUuid("966713f1-794f-480e-aa37-713e8387fe8e")).toBe(true);
    expect(isMuseSessionUuid("not-a-uuid")).toBe(false);
  });

  it("discovers the session dir created after the pre-spawn snapshot", async () => {
    makeSession(["2026", "08", "05"], "11111111-1111-1111-1111-111111111111");
    await snapshotMusePreSpawnSessions(loc);
    makeSession(["2026", "08", "05"], "22222222-2222-2222-2222-222222222222");

    const ref = await discoverMuseSessionRef(loc);
    expect(ref?.providerSessionId).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("returns undefined when no new sessions exist", async () => {
    makeSession(["2026", "08", "05"], "11111111-1111-1111-1111-111111111111");
    await snapshotMusePreSpawnSessions(loc);
    expect(await discoverMuseSessionRef(loc)).toBeUndefined();
  });

  it("retains the completed snapshot while another launch scans", async () => {
    makeSession(["2026", "08", "05"], "11111111-1111-1111-1111-111111111111");
    await snapshotMusePreSpawnSessions(loc);
    const read = fsPromises.readdir;
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(fsPromises, "readdir").mockImplementationOnce(async (...args) => {
      entered();
      await blocked;
      return read(...args);
    });
    const pending = snapshotMusePreSpawnSessions(loc);
    await started;
    try {
      expect(await discoverMuseSessionRef(loc)).toBeUndefined();
    } finally {
      release();
      await pending;
      spy.mockRestore();
    }
  });

  it("does not bind a concurrent session created for another project", async () => {
    await snapshotMusePreSpawnSessions(loc);
    makeSession(
      ["2026", "08", "05"],
      "33333333-3333-3333-3333-333333333333",
      join(tmpdir(), "other-muse-project"),
    );

    expect(await discoverMuseSessionRef(loc)).toBeUndefined();

    makeSession(["2026", "08", "05"], "44444444-4444-4444-4444-444444444444");
    expect((await discoverMuseSessionRef(loc))?.providerSessionId).toBe(
      "44444444-4444-4444-4444-444444444444",
    );
  });

  it("ignores subagent-nested session ids and sidecar dirs (real 1.0.2 layout)", async () => {
    // Real sessions nest `subagent/<uuid>/session.jsonl` plus sidecars
    // (`approval-review/`, `cron.db`, `*.sqlite3`) inside the top-level uuid
    // dir. Discovery must bind the top id only — the walk never descends past
    // the YYYY/MM/DD/<uuid> level.
    await snapshotMusePreSpawnSessions(loc);
    const top = "55555555-5555-5555-5555-555555555555";
    makeSession(["2026", "09", "02"], top);
    const topDir = join(dataHome, "sessions", "2026", "09", "02", top);
    const nested = join(topDir, "subagent", "66666666-6666-6666-6666-666666666666");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "session.jsonl"), "{}\n");
    mkdirSync(join(topDir, "approval-review"), { recursive: true });

    expect((await discoverMuseSessionRef(loc))?.providerSessionId).toBe(top);
  });
});
