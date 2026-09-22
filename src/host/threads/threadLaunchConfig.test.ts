import { describe, expect, it, vi } from "vitest";
import type { AgentStatus, AgentStatusesResponse } from "@/shared/contracts";
import { resolveHostThreadTitlePrompt } from "./threadLaunchConfig";

const LOCATION = { kind: "posix", path: "/repo" } as const;

function statuses(threadTitleCommands?: AgentStatus["capabilities"]["threadTitleCommands"]) {
  return {
    windows: [
      {
        kind: "fixture-agent",
        capabilities: threadTitleCommands ? { threadTitleCommands } : {},
      } as unknown as AgentStatus,
    ],
    wsl: [],
  } as unknown as AgentStatusesResponse;
}

describe("resolveHostThreadTitlePrompt", () => {
  it("applies the agent's declared title commands", async () => {
    const getAgentStatuses = vi.fn<(wslDistros: string[]) => Promise<AgentStatusesResponse>>(
      async () => statuses([{ command: "task" }]),
    );
    await expect(
      resolveHostThreadTitlePrompt(getAgentStatuses, "fixture-agent", LOCATION, "/task Ship it"),
    ).resolves.toBe("Ship it");
    expect(getAgentStatuses).toHaveBeenCalledWith([]);
  });

  it("skips the status read for ordinary prompts", async () => {
    const getAgentStatuses = vi.fn<(wslDistros: string[]) => Promise<AgentStatusesResponse>>(
      async () => statuses([{ command: "task" }]),
    );
    await expect(
      resolveHostThreadTitlePrompt(getAgentStatuses, "fixture-agent", LOCATION, "Ship it"),
    ).resolves.toBe("Ship it");
    expect(getAgentStatuses).not.toHaveBeenCalled();
  });

  it("keeps the prompt for undeclared agents and failed lookups", async () => {
    await expect(
      resolveHostThreadTitlePrompt(
        async () => statuses(),
        "fixture-agent",
        LOCATION,
        "/task Ship it",
      ),
    ).resolves.toBe("/task Ship it");
    await expect(
      resolveHostThreadTitlePrompt(
        async () => {
          throw new Error("supervisor down");
        },
        "fixture-agent",
        LOCATION,
        "/task Ship it",
      ),
    ).resolves.toBe("/task Ship it");
  });
});
