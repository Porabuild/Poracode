import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readCursorAgentCommandOutput:
    vi.fn<
      (
        location: unknown,
        executablePath: string,
        args: string[],
        options?: { env?: Record<string, string> },
      ) => Promise<{ ok: boolean; stdout: string; stderr: string }>
    >(),
  probeAcpCapabilities:
    vi.fn<
      (
        command: string,
        args: string[],
        cwd: string,
        options?: { env?: Record<string, string> },
      ) => Promise<undefined>
    >(),
  readCommandOutputAsync:
    vi.fn<
      (
        command: string,
        args: string[],
        options?: { env?: Record<string, string> },
      ) => Promise<{ ok: boolean; stdout: string; stderr: string }>
    >(),
  readWslLoginShellCommandOutputAsync:
    vi.fn<
      (
        distro: string,
        linuxCwd: string,
        command: string,
        args: string[],
        options?: { env?: Record<string, string> },
      ) => Promise<{ ok: boolean; stdout: string; stderr: string }>
    >(),
}));

vi.mock("./windowsExecutable", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./windowsExecutable")>()),
  readCursorAgentCommandOutput: mocks.readCursorAgentCommandOutput,
}));

vi.mock("../acp", () => ({
  dedupeAcpAuthMethods: (methods: unknown) => methods,
  probeAcpCapabilities: mocks.probeAcpCapabilities,
}));

vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  readCommandOutputAsync: mocks.readCommandOutputAsync,
  readWslLoginShellCommandOutputAsync: mocks.readWslLoginShellCommandOutputAsync,
}));

import { cursorDetectionSpec } from "./detection";
import type { DetectionSpec } from "../base";

type ProbeCtx = Parameters<NonNullable<DetectionSpec["capabilitiesProbe"]>>[0];

function probeCtx(probeEnv: Record<string, string> | undefined): ProbeCtx {
  return {
    location: { kind: "posix", path: "/repo" },
    executablePath: "/usr/local/bin/cursor-agent",
    ...(probeEnv ? { probeEnv } : {}),
  } as ProbeCtx;
}

describe("cursor detection probes honor ctx.probeEnv", () => {
  beforeEach(() => {
    mocks.readCursorAgentCommandOutput
      .mockReset()
      .mockResolvedValue({ ok: true, stdout: "", stderr: "" });
    mocks.probeAcpCapabilities.mockReset().mockResolvedValue(undefined);
    mocks.readCommandOutputAsync
      .mockReset()
      .mockResolvedValue({ ok: true, stdout: "", stderr: "" });
    mocks.readWslLoginShellCommandOutputAsync
      .mockReset()
      .mockResolvedValue({ ok: true, stdout: "", stderr: "" });
  });

  it("runs the whoami/about status probes under the profile key", async () => {
    await cursorDetectionSpec.statusProbe?.(probeCtx({ CURSOR_API_KEY: "profile-key" }));

    expect(mocks.readCursorAgentCommandOutput).toHaveBeenCalledTimes(2);
    for (const call of mocks.readCursorAgentCommandOutput.mock.calls) {
      expect(call[3]?.env).toEqual({ CURSOR_API_KEY: "profile-key" });
    }
  });

  it("runs the model-list and ACP capability probes under the profile key", async () => {
    await cursorDetectionSpec.capabilitiesProbe?.(probeCtx({ CURSOR_API_KEY: "profile-key" }));

    expect(mocks.readCommandOutputAsync).toHaveBeenCalled();
    for (const call of mocks.readCommandOutputAsync.mock.calls) {
      expect(call[2]?.env).toEqual(expect.objectContaining({ CURSOR_API_KEY: "profile-key" }));
    }
    expect(mocks.probeAcpCapabilities).toHaveBeenCalled();
    expect(mocks.probeAcpCapabilities.mock.calls[0]?.[3]?.env).toEqual({
      CURSOR_API_KEY: "profile-key",
    });
  });

  it("leaves base-cursor probes on the ambient environment when no probeEnv is set", async () => {
    await cursorDetectionSpec.statusProbe?.(probeCtx(undefined));
    await cursorDetectionSpec.capabilitiesProbe?.(probeCtx(undefined));

    for (const call of mocks.readCursorAgentCommandOutput.mock.calls) {
      expect(call[3]?.env).toBeUndefined();
    }
    for (const call of mocks.readCommandOutputAsync.mock.calls) {
      // `buildCursorProbeSpec` may contribute its own launch env; the profile
      // key must never appear without `ctx.probeEnv`.
      expect(JSON.stringify(call[2]?.env ?? {})).not.toContain("CURSOR_API_KEY");
    }
    expect(mocks.probeAcpCapabilities.mock.calls[0]?.[3]?.env).toBeUndefined();
  });

  it("exports the profile key into the WSL login shell for the model list", async () => {
    await cursorDetectionSpec.capabilitiesProbe?.({
      ...probeCtx({ CURSOR_API_KEY: "profile-key" }),
      location: {
        kind: "wsl",
        linuxPath: "/repo",
        distro: "Ubuntu",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
      },
    } as ProbeCtx);

    expect(mocks.readWslLoginShellCommandOutputAsync).toHaveBeenCalled();
    expect(mocks.readWslLoginShellCommandOutputAsync.mock.calls[0]?.[4]?.env).toEqual({
      CURSOR_API_KEY: "profile-key",
    });
    expect(mocks.probeAcpCapabilities.mock.calls[0]?.[1].at(-1)).toContain(
      "export CURSOR_API_KEY='profile-key';",
    );
  });
});
