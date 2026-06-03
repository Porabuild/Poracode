import { describe, expect, it } from "vitest";
import type { AgentStatus, ProjectLocation } from "./contracts";
import { getProjectAgentStatuses, getSettingsInstalledAgents } from "./agentStatus";

const capabilities = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal" as const,
  presentationMode: "terminal" as const,
  settingDefs: [],
};

function makeStatus(kind: AgentStatus["kind"], input: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind,
    label: kind,
    installed: true,
    authState: "unknown",
    capabilities,
    ...input,
  };
}

describe("getProjectAgentStatuses", () => {
  it("returns windows statuses for windows projects", () => {
    const location: ProjectLocation = { kind: "windows", path: "C:\\repo" };
    const windowsStatuses = [makeStatus("codex")];

    expect(getProjectAgentStatuses(location, windowsStatuses, [makeStatus("claude")])).toEqual(
      windowsStatuses,
    );
  });

  it("returns only statuses for the matching WSL distro", () => {
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/demo/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\repo",
    };

    expect(
      getProjectAgentStatuses(
        location,
        [],
        [
          makeStatus("codex", { envKind: "wsl", envDistro: "Ubuntu" }),
          makeStatus("claude", { envKind: "wsl", envDistro: "Debian" }),
        ],
      ),
    ).toEqual([makeStatus("codex", { envKind: "wsl", envDistro: "Ubuntu" })]);
  });

  it("falls back to legacy WSL statuses without a distro tag", () => {
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/demo/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\repo",
    };
    const legacyStatuses = [makeStatus("gemini", { envKind: "wsl" })];

    expect(getProjectAgentStatuses(location, [], legacyStatuses)).toEqual(legacyStatuses);
  });

  it("returns only statuses for the matching SSH host", () => {
    const location: ProjectLocation = { kind: "ssh", host: "devbox", path: "/repo" };

    expect(
      getProjectAgentStatuses(
        location,
        [makeStatus("codex", { envKind: "windows" })],
        [],
        [
          makeStatus("claude", { envKind: "ssh", envHost: "devbox" }),
          makeStatus("gemini", { envKind: "ssh", envHost: "other" }),
        ],
      ),
    ).toEqual([makeStatus("claude", { envKind: "ssh", envHost: "devbox" })]);
  });
});

describe("getSettingsInstalledAgents", () => {
  it("includes WSL-only installed agents after native ones", () => {
    expect(
      getSettingsInstalledAgents(
        [makeStatus("codex", { envKind: "windows" })],
        [makeStatus("gemini", { envKind: "wsl", envDistro: "Ubuntu" })],
      ).map((status) => status.kind),
    ).toEqual(["codex", "gemini"]);
  });

  it("dedupes providers installed in both native and WSL, preferring native", () => {
    const nativeGemini = makeStatus("gemini", { envKind: "windows", label: "Gemini Native" });
    const wslGemini = makeStatus("gemini", {
      envKind: "wsl",
      envDistro: "Ubuntu",
      label: "Gemini WSL",
    });

    expect(getSettingsInstalledAgents([nativeGemini], [wslGemini])).toEqual([nativeGemini]);
  });

  it("keeps only the first WSL-installed entry for navigation when no native install exists", () => {
    const ubuntu = makeStatus("gemini", { envKind: "wsl", envDistro: "Ubuntu" });
    const debian = makeStatus("gemini", { envKind: "wsl", envDistro: "Debian" });

    expect(getSettingsInstalledAgents([], [ubuntu, debian])).toEqual([ubuntu]);
  });
});
