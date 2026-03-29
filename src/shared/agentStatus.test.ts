import { describe, expect, it } from "vitest";
import type { AgentStatus, ProjectLocation } from "./contracts";
import { getProjectAgentStatuses } from "./agentStatus";

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
});
