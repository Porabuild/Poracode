import { beforeEach, describe, expect, it, vi } from "vitest";
import type { probeAcpCapabilities } from "../acp";

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
  probeAcpCapabilities: vi.fn<typeof probeAcpCapabilities>(),
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
import { primeWslLaunchEnvironment, type DetectionSpec } from "../base";

type ProbeCtx = Parameters<NonNullable<DetectionSpec["capabilitiesProbe"]>>[0];

function probeCtx(probeEnv: Record<string, string> | undefined): ProbeCtx {
  return {
    location: { kind: "posix", path: "/repo" },
    executablePath: "/usr/local/bin/cursor-agent",
    ...(probeEnv ? { probeEnv } : {}),
  } as ProbeCtx;
}

describe("Cursor detection probe integration", () => {
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
    primeWslLaunchEnvironment("Ubuntu", { shellPath: "/bin/bash", home: "/home/demo" });
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

  it("publishes parameterized ACP controls without replacing confirmed effort ladders from CLI", async () => {
    mocks.readCommandOutputAsync.mockResolvedValue({
      ok: true,
      stdout: [
        "composer-2.5-medium - Composer 2.5 Medium",
        "grok-4.6-low - Grok 4.6 Low",
        "gpt-5.5-medium - GPT-5.5 Medium",
      ].join("\n"),
      stderr: "",
    });
    mocks.probeAcpCapabilities.mockImplementation(async (_command, _args, _cwd, options) => {
      if (options?.clientCapabilitiesMeta?.parameterizedModelPicker !== true) {
        return { models: [{ id: "grok-4.6[reasoning=high]", label: "Grok 4.6 High" }] };
      }
      return {
        models: [
          { id: "composer-2.5", label: "Composer 2.5" },
          { id: "grok-4.6", label: "Grok 4.6" },
          { id: "gpt-5.5", label: "GPT-5.5" },
        ],
        efforts: ["high", "xhigh"],
        defaultEffort: "high",
        modelEfforts: { "composer-2.5": [], "grok-4.6": ["high", "xhigh"] },
        modelDefaultEfforts: { "grok-4.6": "xhigh" },
        fastModels: ["grok-4.6"],
        thinkingModels: ["grok-4.6"],
        contextSizes: [
          { id: "272k", label: "272K" },
          { id: "1m", label: "1M" },
        ],
        modelContextSizes: { "grok-4.6": ["272k", "1m"] },
      };
    });

    const result = await cursorDetectionSpec.capabilitiesProbe?.(probeCtx(undefined));

    expect(result?.presentationCapabilities?.gui).toMatchObject({
      efforts: ["medium", "high", "xhigh"],
      defaultEffort: "high",
      modelEfforts: {
        "composer-2.5": [],
        "grok-4.6": ["high", "xhigh"],
        "gpt-5.5": ["medium"],
      },
      modelDefaultEfforts: { "grok-4.6": "xhigh" },
      fastModels: ["grok-4.6"],
      thinkingModels: ["grok-4.6"],
      contextSizes: [
        { id: "272k", label: "272K" },
        { id: "1m", label: "1M" },
      ],
      modelContextSizes: { "grok-4.6": ["272k", "1m"] },
    });
    expect(result?.presentationCapabilities?.gui?.models?.map((model) => model.id)).toEqual([
      "composer-2.5",
      "gpt-5.5",
      "grok-4.6",
    ]);
    expect(result?.modelEfforts).toMatchObject({
      "composer-2.5": ["medium"],
      "grok-4.6": ["low"],
      "gpt-5.5": ["medium"],
    });
  });
});
