import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("./oneShotSpawn", () => ({
  prepareOneShot: prepareOneShotMock,
}));

import { generateTitle } from "./titleGenerator";

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
    prepareOneShotMock.mockReturnValue({
      spec: { command: "droid", args: ["exec"] },
      spawn: async () => "Fix login timeout",
    });
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
