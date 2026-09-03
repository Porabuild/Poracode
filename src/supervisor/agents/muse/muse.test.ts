import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { createKnownSessionRef } from "../base";
import { createMuseAdapter } from "./index";
import {
  discoverMuseSessionRef,
  isMuseSessionUuid,
  snapshotMusePreSpawnSessions,
} from "./sessionFiles";
import { detectMuseTerminalStatus, isMuseReadyForInitialPrompt } from "./terminal";

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
  });

  it("advertises terminal-only and no structured session (awaiting real ACP)", () => {
    expect(adapter.capabilities.presentationModes).toEqual(["terminal"]);
    expect(adapter.capabilities.liveInputMode).toBe("terminal");
    expect(adapter.createStructuredSession).toBeUndefined();
  });

  it("neutralizes the browser for the WSL OAuth flow", () => {
    expect(adapter.spawnEnv?.wsl).toEqual({ BROWSER: "/bin/true" });
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

  it("launches fresh without a sessionRef so discovery can run", () => {
    const result = adapter.buildLaunchArgv(location, config, "hi");
    expect(result.binary).toBe("muse");
    expect(result.sessionRef).toBeUndefined();
    expect(result.args).toEqual(["--trust-workspace", "--model", "muse-spark-1.3", "hi"]);
  });

  it("resumes a discovered id with resume <uuid>", () => {
    const id = "966713f1-794f-480e-aa37-713e8387fe8e";
    const result = adapter.buildResumeArgv(
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

  it("chunks direct input with a paste-safe Enter delay", () => {
    expect(adapter.buildDirectInput?.("hello")).toEqual(["hello", "@wait:200", "\r"]);
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
    snapshotMusePreSpawnSessions(loc);
    makeSession(["2026", "08", "05"], "22222222-2222-2222-2222-222222222222");

    const ref = await discoverMuseSessionRef(loc);
    expect(ref?.providerSessionId).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("returns undefined when no new sessions exist", async () => {
    makeSession(["2026", "08", "05"], "11111111-1111-1111-1111-111111111111");
    snapshotMusePreSpawnSessions(loc);
    expect(await discoverMuseSessionRef(loc)).toBeUndefined();
  });

  it("does not bind a concurrent session created for another project", async () => {
    snapshotMusePreSpawnSessions(loc);
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
    snapshotMusePreSpawnSessions(loc);
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
