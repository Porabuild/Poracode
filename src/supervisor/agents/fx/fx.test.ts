import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { programStatusOscHint } from "../base";
import { fxDetectionSpec } from "./detection";
import { createFxAdapter } from "./index";

const snapshotFxPreSpawnSessions = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("./sessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sessions")>();
  return { ...actual, snapshotFxPreSpawnSessions };
});

const location: ProjectLocation = { kind: "posix", path: "/tmp/demo" };

describe("createFxAdapter", () => {
  beforeEach(() => {
    snapshotFxPreSpawnSessions.mockReset();
    snapshotFxPreSpawnSessions.mockResolvedValue(undefined);
  });

  it("declares identity, update, and base spawn env", () => {
    const adapter = createFxAdapter();
    expect(adapter).toMatchObject({
      kind: "fx",
      label: "fx",
      binary: "fx",
      update: fxDetectionSpec.update,
      baseSpawnEnv: { FX_AUTO_UPGRADE: "0" },
      workingSilenceTimeoutMs: null,
    });
    expect(adapter.createInitialSessionRef?.()).toBeUndefined();
    expect(adapter.manageCredentials).toBeTypeOf("function");
    expect(adapter.skillSupport?.invocation).toBe("dollar");
    expect(adapter.skillSupport?.precedence).toEqual({
      global: ["fx", "claude", "agents"],
      project: ["fx", "claude", "agents"],
    });
  });

  it("keeps WSL sign-in browserless and native MCP setup host-only", () => {
    const adapter = createFxAdapter();
    expect(adapter.spawnEnv).toEqual({ wsl: { FX_NO_OPEN_BROWSER: "1" } });
    expect(adapter.nativeMcpConfig?.({ envKind: "wsl", wslDistro: "Ubuntu" })).toBeUndefined();
    expect(adapter.nativeMcpConfig?.({ envKind: "posix" })?.path).toMatch(
      /[\\/]\.fx[\\/]mcp\.json$/u,
    );
  });

  it("uses the shared OSC 7501 program-status hint", () => {
    expect(createFxAdapter().handleOscProgramStatus).toBe(programStatusOscHint);
  });

  it("snapshots sessions and builds the launch argv", async () => {
    const argv = await createFxAdapter().buildLaunchArgv(
      location,
      { model: "spacexai/grok-4.7", effort: "auto", fast: true },
      "hello",
    );
    expect(snapshotFxPreSpawnSessions).toHaveBeenCalledWith(location);
    expect(argv).toEqual({
      binary: "fx",
      args: ["--model", "spacexai/grok-4.7", "--effort", "auto", "--fast"],
      env: { FX_PERMISSION_MODE: "auto" },
    });
  });

  it("does not snapshot again when launch already carries a session id", async () => {
    const argv = await createFxAdapter().buildLaunchArgv(
      location,
      { model: "", approvalPolicy: "ask" },
      "hello",
      { providerSessionId: "existing", discoveredAt: "2026-01-01T00:00:00.000Z" },
    );
    expect(snapshotFxPreSpawnSessions).not.toHaveBeenCalled();
    expect(argv).toEqual({
      binary: "fx",
      args: ["--resume", "existing"],
      env: { FX_PERMISSION_MODE: "ask" },
    });
  });

  it("resumes with the provider session id", async () => {
    const argv = await createFxAdapter().buildResumeArgv(
      location,
      { model: "", approvalPolicy: "bypassPermissions" },
      "hello",
      { providerSessionId: "iHHa9odhGUbU", discoveredAt: "2026-01-01T00:00:00.000Z" },
    );
    expect(argv).toEqual({
      binary: "fx",
      args: ["--resume", "iHHa9odhGUbU"],
      env: { FX_PERMISSION_MODE: "full-access" },
    });
  });

  it("bracketed-pastes only multi-line input", () => {
    const adapter = createFxAdapter();
    expect(adapter.buildDirectInput?.("one line")).toEqual(["one line", "@wait:60", "\r"]);
    expect(adapter.buildDirectInput?.("first\nsecond")).toEqual([
      "\x1b[200~first\nsecond\x1b[201~",
      "@wait:60",
      "\r",
    ]);
  });

  it("recognizes the real startup and resumed-session screens", () => {
    const isReady = createFxAdapter().isReadyForInitialPrompt;
    expect(isReady?.("𝒇x v0.0.15 · Run /help for commands")).toBe(true);
    expect(isReady?.("* session resumed: Untitled session\nask · grok-4.7")).toBe(true);
    expect(isReady?.("auto · spacexai/grok-4.7")).toBe(true);
    expect(isReady?.("full access · anthropic/claude-opus-5.5")).toBe(true);
    expect(isReady?.("random terminal output")).toBe(false);
  });

  it("detects the unknown-session failure", () => {
    const detect = createFxAdapter().detectInvalidSessionRef;
    expect(detect?.("fx: saved session not found.")).toBe(true);
    expect(detect?.("all good")).toBe(false);
  });

  it("builds one-shot commands with stdin and an ask permission mode", () => {
    const adapter = createFxAdapter();
    expect(
      adapter.buildOneShotCommand?.(
        "spacexai/grok-4.7",
        "auto",
        "Summarize this",
        location,
        true,
        undefined,
      ),
    ).toEqual({
      command: "fx",
      args: ["ask", "--no-save", "--model", "spacexai/grok-4.7", "--effort", "auto", "--fast"],
      stdin: "Summarize this",
      env: { FX_PERMISSION_MODE: "ask" },
    });
  });

  it("omits the model when one is not supplied and maps explicit false fast", () => {
    const adapter = createFxAdapter();
    expect(
      adapter.buildOneShotCommand?.("", undefined, "Summarize this", location, false, undefined),
    ).toEqual({
      command: "fx",
      args: ["ask", "--no-save", "--no-fast"],
      stdin: "Summarize this",
      env: { FX_PERMISSION_MODE: "ask" },
    });
  });
});
