import { expect, it, vi } from "vitest";
import { makeHarness, PARENT, flush } from "./testHarness";
import { dispatchTool, type SubagentToolContext } from "./toolRegistry";
import { parseSpawnRequest } from "./toolRequests";

it.each([false, true, undefined] as const)(
  "retains fast setting %s in primary and fallback requests",
  (fast) => {
    const selected = typeof fast === "boolean" ? { fast } : {};
    const request = parseSpawnRequest({
      provider: "fixture-provider",
      prompt: "Inspect the fixture",
      ...selected,
      fallbacks: [{ provider: "fixture-fallback", ...selected }],
    });
    expect(request.fast).toBe(fast);
    expect(request.fallbacks![0]!.fast).toBe(fast);
  },
);

function context(manager: SubagentToolContext["runManager"]): SubagentToolContext {
  return {
    parentThreadId: PARENT,
    runManager: manager,
    listSpawnableAgents: async () => [
      {
        provider: { value: "codex", label: "Fixture provider" },
        models: [
          {
            value: "gpt-5.5",
            label: "Fixture model",
            reasoning: { values: [] },
            fast: { available: true },
          },
        ],
        reasoningOptions: [],
        defaultModel: "gpt-5.5",
        execution: "structured",
        permissions: {
          options: [{ value: "full-access", label: "Full access" }],
          default: "full-access",
        },
      },
    ],
  };
}

it("delivers disabled fast mode through the MCP dispatcher and startup fallback", async () => {
  const h = makeHarness({ createFailures: 1 });
  const result = await dispatchTool(
    "spawn_agent",
    {
      provider: "codex",
      prompt: "Inspect the fixture",
      fast: true,
      background: true,
      fallbacks: [{ provider: "codex", fast: false }],
    },
    context(h.manager),
  );
  expect(result.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[0]?.startTurns).toHaveLength(1));
  expect(h.inputs.map((input) => input.config.fast)).toEqual([true, false]);
  expect(h.handles[0]!.startTurns[0]!.config.fast).toBe(false);
  h.handles[0]!.completeTurn("completed");
  await flush();
});
