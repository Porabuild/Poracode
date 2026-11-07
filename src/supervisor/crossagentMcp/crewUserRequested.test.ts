import { expect, it, vi } from "vitest";
import type { ThreadCrewBinding } from "@/shared/crew";
import { dispatchTool, type SubagentToolContext } from "./toolRegistry";
import type { SpawnAgentRequest, SpawnableAgent } from "./types";

// The existing persisted shape remains valid; no crew migration is required.
const crew: ThreadCrewBinding = {
  version: 1,
  policy: "crew-only",
  roles: [
    { id: "sidekick", label: "Sidekick", selection: { agentKind: "claude", model: "sonnet" } },
  ],
};
const reviewer: SpawnableAgent = {
  provider: { value: "codex", label: "Codex" },
  models: [{ value: "review-model", label: "Review model", reasoning: { values: ["high"] } }],
  defaultModel: "review-model",
  reasoningOptions: [{ value: "high", label: "High" }],
  permissions: {
    options: [{ value: "full-access", label: "Full access" }],
    default: "full-access",
  },
  execution: "structured",
};

function harness() {
  const spawnMany = vi.fn<SubagentToolContext["runManager"]["spawnMany"]>((_parent, requests) =>
    requests.map((_, index) => ({ runId: `run-${index}` })),
  );
  const validateRequests = vi.fn<SubagentToolContext["runManager"]["validateRequests"]>();
  const ctx: SubagentToolContext = {
    parentThreadId: "parent",
    getCrew: () => crew,
    listSpawnableAgents: async () => [reviewer],
    runManager: {
      spawnMany,
      validateRequests,
      getCapacity: () => 0,
      subscribe: () => () => {},
    } as unknown as SubagentToolContext["runManager"],
  };
  return { ctx, spawnMany, validateRequests };
}

it.each(["spawn_agent", "spawn_agents", "run_workflow"])(
  "%s honors root user-request defaults and per-task requests for outside reviewers",
  async (tool) => {
    for (const rootDefault of [true, false]) {
      const h = harness();
      const result = await dispatchTool(
        tool,
        {
          background: true,
          provider: "codex",
          model: "review-model",
          reasoning: "high",
          ...(rootDefault ? { user_requested: true } : {}),
          tasks: [
            {
              id: "review-one",
              prompt: "Review correctness",
              write_scope: [],
              ...(rootDefault ? {} : { user_requested: true }),
            },
            { id: "review-two", prompt: "Review parity", write_scope: [], user_requested: true },
          ],
        },
        h.ctx,
      );
      expect(result.isError).not.toBe(true);
      const calls =
        tool === "run_workflow" ? h.validateRequests.mock.calls : h.spawnMany.mock.calls;
      expect(calls).toHaveLength(1);
      const requests = calls[0]![1] as SpawnAgentRequest[];
      expect(requests).toHaveLength(2);
      for (const request of requests) {
        expect(request).toMatchObject({ agent: "codex", model: "review-model", effort: "high" });
        expect(request.crewRole).toBeUndefined();
      }
      expect(crew.policy).toBe("crew-only");
    }
  },
);

it.each(["spawn_agent", "spawn_agents", "run_workflow"])(
  "%s rejects the entire batch if any task lacks an explicit user request",
  async (tool) => {
    const h = harness();
    const result = await dispatchTool(
      tool,
      {
        background: true,
        user_requested: true,
        provider: "codex",
        tasks: [
          { id: "review", prompt: "Requested review", write_scope: [] },
          { id: "automatic", prompt: "Automatic review", write_scope: [], user_requested: false },
        ],
      },
      h.ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("for automatic delegation");
    expect(h.spawnMany).not.toHaveBeenCalled();
    expect(h.validateRequests).not.toHaveBeenCalled();
  },
);

it("keeps provider availability validation for user-requested reviewers", async () => {
  const h = harness();
  const result = await dispatchTool(
    "spawn_agent",
    {
      user_requested: true,
      provider: "unavailable",
      prompt: "Review",
      background: true,
    },
    h.ctx,
  );
  expect(result.isError).toBe(true);
  expect(result.content[0]?.text).toContain("not currently available");
  expect(h.spawnMany).not.toHaveBeenCalled();
});
