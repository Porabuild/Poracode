import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const authFileMock = vi.hoisted(() => ({ exists: false }));
const buildAgentCommandMock = vi.hoisted(() =>
  vi.fn<
    (
      location: ProjectLocation,
      command: string,
      args: string[],
      executablePath?: string,
    ) => { command: string; args: string[]; cwd?: string; env?: Record<string, string> }
  >(),
);
const probeAcpCapabilitiesMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<unknown>>(),
);

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (path: import("node:fs").PathLike) =>
      String(path).endsWith("/.grok/auth.json") ? authFileMock.exists : actual.existsSync(path),
  };
});

vi.mock("../base", async () => {
  const actual = await vi.importActual<typeof import("../base")>("../base");
  return { ...actual, buildAgentCommand: buildAgentCommandMock };
});

vi.mock("../acp", async () => {
  const actual = await vi.importActual<typeof import("../acp")>("../acp");
  return { ...actual, probeAcpCapabilities: probeAcpCapabilitiesMock };
});

import {
  buildGrokProviderMetadata,
  grokDetectionSpec,
  mapGrokEffortCapabilities,
} from "./detection";

// Model `_meta` shapes as returned live by `grok agent stdio` 0.2.118
// (initialize/_meta.modelState and session/new `models.availableModels[]._meta`).
const GROK_45_META = {
  totalContextTokens: 500_000,
  agentType: "grok-build-plan",
  supportsReasoningEffort: true,
  reasoningEffort: "high",
  reasoningEfforts: [
    { id: "high", value: "high", label: "High Effort", default: true },
    { id: "medium", value: "medium", label: "Medium Effort", default: false },
    { id: "low", value: "low", label: "Low Effort", default: false },
  ],
};

const MODEL_WITHOUT_EFFORT_META = {
  totalContextTokens: 200_000,
  agentType: "cursor",
};

beforeEach(() => {
  vi.clearAllMocks();
  buildAgentCommandMock.mockReturnValue({
    command: "/Users/demo/.local/share/fnm/node-versions/v24/bin/grok",
    args: ["--no-auto-update", "agent", "stdio"],
    cwd: "/Users/demo/project",
    env: { PATH: "/Users/demo/.local/share/fnm/node-versions/v24/bin:/usr/bin:/bin" },
  });
  probeAcpCapabilitiesMock.mockResolvedValue(undefined);
});

describe("Grok capability detection", () => {
  it("forwards the login-shell environment to the ACP process", async () => {
    const location: ProjectLocation = { kind: "posix", path: "/Users/demo/project" };

    await grokDetectionSpec.capabilitiesProbe?.({
      location,
      executablePath: "/Users/demo/.local/share/fnm/node-versions/v24/bin/grok",
    });

    expect(probeAcpCapabilitiesMock).toHaveBeenCalledWith(
      "/Users/demo/.local/share/fnm/node-versions/v24/bin/grok",
      ["--no-auto-update", "agent", "stdio"],
      expect.any(String),
      expect.objectContaining({
        env: {
          PATH: "/Users/demo/.local/share/fnm/node-versions/v24/bin:/usr/bin:/bin",
        },
        label: "grok:posix",
        timeoutMs: 20_000,
      }),
    );
  });
});

describe("mapGrokEffortCapabilities", () => {
  it("derives ascending effort tiers and the advertised default", () => {
    const caps = mapGrokEffortCapabilities({
      "grok-4.5": GROK_45_META,
      "model-without-effort": MODEL_WITHOUT_EFFORT_META,
    });
    expect(caps.efforts).toEqual(["low", "medium", "high"]);
    expect(caps.defaultEffort).toBe("high");
  });

  it("gives models without tiers an explicit empty list so the picker hides effort", () => {
    const caps = mapGrokEffortCapabilities({
      "grok-4.5": GROK_45_META,
      "model-without-effort": MODEL_WITHOUT_EFFORT_META,
    });
    expect(caps.modelEfforts).toEqual({
      "grok-4.5": ["low", "medium", "high"],
      "model-without-effort": [],
    });
  });

  it("keeps unknown tier ids after the known ones in their original order", () => {
    const caps = mapGrokEffortCapabilities({
      m: {
        reasoningEfforts: [
          { id: "turbo", default: false },
          { id: "low", default: true },
          { id: "hyper", default: false },
        ],
      },
    });
    expect(caps.modelEfforts["m"]).toEqual(["low", "turbo", "hyper"]);
    expect(caps.defaultEffort).toBe("low");
  });

  it("returns empty capabilities when metadata is missing or malformed", () => {
    expect(mapGrokEffortCapabilities(undefined)).toEqual({ efforts: [], modelEfforts: {} });
    expect(mapGrokEffortCapabilities({ m: { reasoningEfforts: "nope" as unknown } })).toEqual({
      efforts: [],
      modelEfforts: { m: [] },
    });
  });
});

describe("buildGrokProviderMetadata", () => {
  it("maps the 0.2.x authenticate _meta fields, including team_name → organization", () => {
    expect(
      buildGrokProviderMetadata({
        email: "dev@example.com",
        auth_mode: "Oidc",
        subscription_tier: "X Premium+",
        team_name: "Acme",
        team_id: "t-1",
        is_zdr: false,
      }),
    ).toEqual({
      authenticatedAs: "dev@example.com",
      organization: "Acme",
      plan: "X Premium+",
      authMethod: "OIDC",
    });
  });

  it("omits organization when team_name is null (personal accounts)", () => {
    expect(buildGrokProviderMetadata({ email: "dev@example.com", team_name: null })).toEqual({
      authenticatedAs: "dev@example.com",
    });
  });
});

describe("Grok auth file detection", () => {
  const probe = grokDetectionSpec.authProbes?.[1];

  it("reports missing authentication after logout removes auth.json", async () => {
    authFileMock.exists = false;

    await expect(
      probe?.({ location: { kind: "posix", path: "/repo" }, executablePath: "grok" }),
    ).resolves.toBe("missing");
  });

  it("reports authentication while auth.json is present", async () => {
    authFileMock.exists = true;

    await expect(
      probe?.({ location: { kind: "posix", path: "/repo" }, executablePath: "grok" }),
    ).resolves.toBe("authenticated");
  });
});
