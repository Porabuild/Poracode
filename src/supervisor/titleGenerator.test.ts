import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter } from "./agents/base";

const prepareOneShotMock = vi.hoisted(() =>
  vi.fn<
    (
      location: ProjectLocation,
      cmd: { command: string; args: string[]; env?: Record<string, string> },
    ) => {
      spec: unknown;
      spawn: (spec: unknown, input: string, timeoutMs: number) => Promise<string>;
    }
  >(),
);
const resolveAgentProjectLocationMock = vi.hoisted(() =>
  vi.fn<
    (
      _adapter: AgentAdapter,
      location: ProjectLocation,
      _environment?: unknown,
      signal?: AbortSignal,
    ) => Promise<ProjectLocation>
  >(),
);

vi.mock("./oneShotSpawn", () => ({
  prepareOneShot: prepareOneShotMock,
}));
vi.mock("./agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agents/base")>()),
  resolveAgentProjectLocation: resolveAgentProjectLocationMock,
}));

import { generateTitle } from "./titleGenerator";
import { MockAgentLaunchBlockedError } from "./agentLaunchGuard";

const windowsProject: ProjectLocation = { kind: "windows", path: "C:\\Users\\demo\\project" };
const baseSpawnEnv = { DROID_DISABLE_AUTO_UPDATE: "true" };

function cliAdapter(overrides: Partial<AgentAdapter> = {}): AgentAdapter {
  return {
    label: "Factory Droid",
    defaultOneShotModel: "model-a",
    baseSpawnEnv,
    buildOneShotCommand: () => ({
      command: "droid",
      args: ["exec"],
    }),
    ...overrides,
  } as AgentAdapter;
}

describe("generateTitle CLI spawn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAgentProjectLocationMock.mockImplementation(async (_adapter, location) => location);
    prepareOneShotMock.mockReturnValue({
      spec: { command: "droid", args: ["exec"] },
      spawn: async () => "Fix login timeout",
    });
  });

  it("uses the resolved provider execution location", async () => {
    const wslProject: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/mnt/c/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\repo",
    };
    resolveAgentProjectLocationMock.mockResolvedValue(wslProject);

    await generateTitle(windowsProject, cliAdapter(), "the login times out");

    expect(resolveAgentProjectLocationMock).toHaveBeenCalledWith(
      expect.anything(),
      windowsProject,
      undefined,
      expect.any(AbortSignal),
    );
    expect(prepareOneShotMock).toHaveBeenCalledWith(wslProject, expect.anything());
  });

  it.each([
    ["TDTN-2424", ["TDTN-2424"]],
    ["PR #747", ["PR #747"]],
    ["pull request 747", ["pull request 747"]],
    ["https://github.com/example/repo/pull/747", ["https://github.com/example/repo/pull/747"]],
    ["https://example.atlassian.net/browse/TDTN-2424", ["TDTN-2424"]],
    ["PR #747 (TDTN-2424)", ["PR #747", "TDTN-2424"]],
    ["TDTN-2424 ".repeat(300) + "PR #747", ["TDTN-2424", "PR #747"]],
  ])("preserves references beyond the message limit: %s", async (reference, expected) => {
    const runOneShot = vi
      .fn<NonNullable<AgentAdapter["runOneShot"]>>()
      .mockResolvedValue("Fix login timeout");
    const prompt = "Investigate login timeouts. ".repeat(150) + reference;

    await generateTitle(windowsProject, cliAdapter({ runOneShot }), prompt);

    const sentPrompt = runOneShot.mock.calls[0]![0].prompt;
    expect(sentPrompt).toContain("[message truncated]");
    expect(sentPrompt).not.toContain("Investigate login timeouts. ".repeat(150));
    const preservedReferences = sentPrompt.split(
      "Reference candidates from the full message:\n",
    )[1];
    expect(preservedReferences?.split("\n")).toEqual(expected);
  });

  it("applies adapter baseSpawnEnv to the one-shot command", async () => {
    await generateTitle(windowsProject, cliAdapter(), "the login times out");

    expect(prepareOneShotMock).toHaveBeenCalledWith(
      windowsProject,
      expect.objectContaining({
        command: "droid",
        args: ["exec"],
        env: baseSpawnEnv,
      }),
    );
  });

  it("lets command-declared env win on conflict", async () => {
    await generateTitle(
      windowsProject,
      cliAdapter({
        buildOneShotCommand: () => ({
          command: "droid",
          args: ["exec"],
          env: { DROID_DISABLE_AUTO_UPDATE: "false", OTHER: "1" },
        }),
      }),
      "the login times out",
    );

    expect(prepareOneShotMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        env: { DROID_DISABLE_AUTO_UPDATE: "false", OTHER: "1" },
      }),
    );
  });

  it("allows a CLI adapter to use its target environment's implicit model", async () => {
    const buildOneShotCommand = vi.fn<NonNullable<AgentAdapter["buildOneShotCommand"]>>(
      (_model: string) => ({
        command: "command-code",
        args: ["--no-session", "-p", "prompt"],
      }),
    );
    const adapter = cliAdapter({ allowsImplicitOneShotModel: true, buildOneShotCommand });
    delete adapter.defaultOneShotModel;
    await generateTitle(windowsProject, adapter, "the login times out");

    expect(buildOneShotCommand).toHaveBeenCalledWith(
      "",
      undefined,
      expect.any(String),
      windowsProject,
      undefined,
    );
  });
});

describe("title generation mock isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PORACODE_IS_DEV", "1");
    vi.stubEnv("PORACODE_MOCK_AGENTS", "1");
    resolveAgentProjectLocationMock.mockImplementation(async (_adapter, location) => location);
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(["structured", "cli"] as const)(
    "refuses %s title generation before dispatch or location resolution",
    async (lane) => {
      const runOneShot = vi.fn<NonNullable<AgentAdapter["runOneShot"]>>(
        async () => "Unexpected real turn",
      );
      const buildOneShotCommand = vi.fn<NonNullable<AgentAdapter["buildOneShotCommand"]>>(() => ({
        command: "fixture-agent",
        args: [],
      }));
      const adapter = {
        label: "Fixture agent",
        defaultOneShotModel: "fixture-model",
        ...(lane === "structured" ? { runOneShot } : { buildOneShotCommand }),
      } as unknown as AgentAdapter;

      await expect(
        generateTitle(windowsProject, adapter, "Private message"),
      ).rejects.toBeInstanceOf(MockAgentLaunchBlockedError);

      expect(runOneShot).not.toHaveBeenCalled();
      expect(buildOneShotCommand).not.toHaveBeenCalled();
      expect(resolveAgentProjectLocationMock).not.toHaveBeenCalled();
      expect(prepareOneShotMock).not.toHaveBeenCalled();
    },
  );

  it("preserves structured generation outside the mock profile", async () => {
    vi.stubEnv("PORACODE_MOCK_AGENTS", "0");
    const runOneShot = vi.fn<NonNullable<AgentAdapter["runOneShot"]>>(async () => "Fixture title");
    const adapter = {
      label: "Fixture agent",
      defaultOneShotModel: "fixture-model",
      runOneShot,
    } as unknown as AgentAdapter;

    await expect(generateTitle(windowsProject, adapter, "Title this task")).resolves.toBe(
      "Fixture title",
    );
    expect(runOneShot).toHaveBeenCalledOnce();
  });
});
