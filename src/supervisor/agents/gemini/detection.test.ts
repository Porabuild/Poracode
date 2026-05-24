import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const buildAgentCommandMock = vi.hoisted(() =>
  vi.fn<
    (
      location: ProjectLocation,
      command: string,
      args: string[],
      executablePath?: string,
    ) => { command: string; args: string[] }
  >(),
);
const probeAcpCapabilitiesMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<unknown>>(),
);

vi.mock("../base", async () => {
  const actual = await vi.importActual<typeof import("../base")>("../base");
  return {
    ...actual,
    buildAgentCommand: buildAgentCommandMock,
  };
});

vi.mock("../acp", () => ({
  probeAcpCapabilities: probeAcpCapabilitiesMock,
}));

import { geminiDetectionSpec, parseGeminiGoogleAccountsJson } from "./detection";

describe("geminiDetectionSpec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildAgentCommandMock.mockReturnValue({
      command: "/bin/zsh",
      args: ["-l", "-c", "exec '/Users/demo/.local/bin/gemini' '--acp'"],
    });
    probeAcpCapabilitiesMock.mockResolvedValue(undefined);
  });

  it("uses the native project location and resolved executable for non-WSL probes", async () => {
    const location: ProjectLocation = { kind: "posix", path: "/Users/demo/project" };

    // Even when the ACP probe fails, Gemini surfaces a terminal auth method
    // so the Login button stays in the settings UI.
    await expect(
      geminiDetectionSpec.capabilitiesProbe?.({
        location,
        executablePath: "/Users/demo/.local/bin/gemini",
      }),
    ).resolves.toEqual({
      authMethods: [{ id: "gemini-terminal-login", name: "Login", type: "terminal" }],
    });

    expect(buildAgentCommandMock).toHaveBeenCalledWith(location, "/Users/demo/.local/bin/gemini", [
      "--acp",
      "--skip-trust",
    ]);
    expect(probeAcpCapabilitiesMock).toHaveBeenCalledWith(
      "/bin/zsh",
      ["-l", "-c", "exec '/Users/demo/.local/bin/gemini' '--acp'"],
      expect.any(String),
      expect.objectContaining({
        label: "gemini:posix",
        timeoutMs: 15_000,
      }),
    );
  });

  it("adds context labels only for exact documented Gemini model ids", async () => {
    const location: ProjectLocation = { kind: "posix", path: "/Users/demo/project" };
    probeAcpCapabilitiesMock.mockResolvedValue({
      models: [
        { id: "auto-gemini-3", label: "Auto (Gemini 3)" },
        { id: "gemini-3.1-pro-preview", label: "3.1 Pro Preview" },
        { id: "gemini-2.5-flash", label: "2.5 Flash" },
        { id: "gemini-9-pro", label: "9 Pro" },
      ],
    });

    const result = await geminiDetectionSpec.capabilitiesProbe?.({
      location,
      executablePath: "/Users/demo/.local/bin/gemini",
    });

    expect(result).toMatchObject({
      contextSizes: [{ id: "1M", label: "1M" }],
      modelContextSizes: {
        "gemini-3.1-pro-preview": ["1M"],
        "gemini-2.5-flash": ["1M"],
      },
    });
    expect(result?.modelContextSizes).not.toHaveProperty("auto-gemini-3");
    expect(result?.modelContextSizes).not.toHaveProperty("gemini-9-pro");
  });
});

describe("parseGeminiGoogleAccountsJson", () => {
  it("returns the active account email", () => {
    expect(
      parseGeminiGoogleAccountsJson(
        JSON.stringify({ active: "user@gmail.com", old: ["other@gmail.com"] }),
      ),
    ).toBe("user@gmail.com");
  });

  it("returns undefined when no active account is set", () => {
    expect(parseGeminiGoogleAccountsJson(JSON.stringify({ old: [] }))).toBeUndefined();
    expect(parseGeminiGoogleAccountsJson(JSON.stringify({ active: "" }))).toBeUndefined();
  });

  it("returns undefined for malformed JSON", () => {
    expect(parseGeminiGoogleAccountsJson("not json")).toBeUndefined();
  });
});
