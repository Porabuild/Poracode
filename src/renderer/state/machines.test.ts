import { describe, expect, it } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { deriveMachines, machineIdForStatus } from "./machines";

function status(overrides: Partial<AgentStatus>): AgentStatus {
  return {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "terminal",
      settingDefs: [],
    },
    ...overrides,
  } as AgentStatus;
}

describe("deriveMachines", () => {
  it("always lists the local machine first and dedupes/sorts WSL distros", () => {
    const machines = deriveMachines({
      enumeratedDistros: ["Ubuntu", "Debian"],
      projectDistros: ["Ubuntu", "Alpine"],
      remoteServers: [],
      remoteRuntime: {},
    });
    expect(machines.map((machine) => machine.id)).toEqual([
      "local",
      "local/wsl:Alpine",
      "local/wsl:Debian",
      "local/wsl:Ubuntu",
    ]);
    expect(machines[0]!.status).toBe("online");
  });

  it("adds remote machines with connection state and their WSL distros", () => {
    const machines = deriveMachines({
      enumeratedDistros: [],
      projectDistros: [],
      remoteServers: [{ desktopId: "desk-1", label: "Studio" }],
      remoteRuntime: {
        "desk-1": {
          status: "online",
          agentStatuses: { wsl: [{ envDistro: "Ubuntu" }, { envDistro: "Ubuntu" }, {}] },
        },
      },
    });
    expect(machines.map((machine) => machine.id)).toEqual([
      "local",
      "remote:desk-1",
      "remote:desk-1/wsl:Ubuntu",
    ]);
    expect(machines[1]!.status).toBe("online");
    expect(machines[1]!.label).toBe("Studio");
  });

  it("marks unpaired runtime states offline", () => {
    const machines = deriveMachines({
      enumeratedDistros: [],
      projectDistros: [],
      remoteServers: [{ desktopId: "desk-2", label: "Laptop" }],
      remoteRuntime: {},
    });
    expect(machines[1]!.status).toBe("offline");
  });
});

describe("machineIdForStatus", () => {
  it("buckets local statuses by env", () => {
    expect(machineIdForStatus(status({ envKind: "windows" }))).toBe("local");
    expect(machineIdForStatus(status({ envKind: "posix" }))).toBe("local");
    expect(machineIdForStatus(status({ envKind: "wsl", envDistro: "Ubuntu" }))).toBe(
      "local/wsl:Ubuntu",
    );
  });
});
