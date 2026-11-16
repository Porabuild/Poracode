import { expect, it, vi } from "vitest";
import type { ThreadCrewBinding } from "@/shared/crew";
import { agentCapabilitySchema, type SessionRef } from "@/shared/contracts";
import { dispatchTool, type SubagentToolContext } from "./toolRegistry";
import { FakeHandle, makeHarness, PARENT, flush } from "./testHarness";

async function setup(complete = true) {
  let crew: ThreadCrewBinding = {
    version: 1,
    policy: "crew-only",
    roles: [
      {
        id: "builder",
        label: "Builder",
        brief: "Implement changes",
        parallel: 2,
        selection: { agentKind: "codex", model: "gpt-5.5", effort: "high", fast: true },
      },
    ],
  };
  const capabilities = agentCapabilitySchema.parse({
    supportsResume: true,
    models: [
      { id: "gpt-5.5", label: "First" },
      { id: "other-model", label: "Second" },
    ],
    efforts: ["low", "high"],
    fastModels: ["gpt-5.5", "other-model"],
    contextSizes: [{ id: "1m", label: "1M" }],
    modelContextSizes: { "gpt-5.5": ["1m"] },
    approvalPolicies: [{ id: "never", label: "Full access" }],
    sandboxModes: [{ id: "danger-full-access", label: "Full access" }],
  });
  const open = vi.fn<(handle: FakeHandle, ref: SessionRef | undefined) => Promise<string>>(
    async () => "helper-session",
  );
  const h = makeHarness({
    resume: { sessionId: "helper-session", open },
    statusCapabilities: capabilities,
  });
  const ctx: SubagentToolContext = {
    parentThreadId: PARENT,
    runManager: h.manager,
    getCrew: () => crew,
    listSpawnableAgents: async () => [
      {
        provider: { value: "codex", label: "Worker" },
        models: capabilities.models.map((model) => ({
          value: model.id,
          label: model.label,
          reasoning: { values: ["low", "high"] },
          fast: { available: true },
        })),
        reasoningOptions: [],
        defaultModel: "gpt-5.5",
        permissions: {
          options: [{ value: "full-access", label: "Full access" }],
          default: "full-access",
        },
        execution: "structured",
      },
    ],
  };
  const result = await dispatchTool(
    "spawn_agent",
    { role: "builder", prompt: "First", background: true },
    ctx,
  );
  expect(result.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[0]?.startTurns).toHaveLength(1));
  const runId = h.manager.listRuns(PARENT)[0]!.run_id;
  if (complete) {
    h.handles[0]!.completeTurn("completed");
    await h.manager.waitForSettlement(PARENT, runId);
  }
  return {
    ...h,
    ctx,
    runId,
    open,
    changeRole(patch: Partial<ThreadCrewBinding["roles"][number]>) {
      crew = { ...crew, roles: [{ ...crew.roles[0]!, ...patch }] };
    },
  };
}

it.each(["spawn_agent", "steer_agent"] as const)(
  "%s applies the current role's effort, Fast, brief, editing rules and label on its next turn",
  async (tool) => {
    const h = await setup();
    try {
      h.changeRole({
        label: "Reviewer",
        brief: "Review the result",
        noEdits: true,
        parallel: 1,
        selection: { agentKind: "codex", model: "gpt-5.5", effort: "low", fast: false },
      });
      const response = await dispatchTool(
        tool,
        {
          ...(tool === "spawn_agent" ? { role: "builder" } : { run_id: h.runId }),
          prompt: "Second",
          background: true,
        },
        h.ctx,
      );
      expect(response.isError).not.toBe(true);
      await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
      expect(h.inputs[1]!.sessionRef?.providerSessionId).toBe("helper-session");
      const turn = h.handles[1]!.startTurns[0]!;
      expect(turn.config.effort).toBe("low");
      expect(turn.config.fast).not.toBe(true);
      expect(turn.prompt).toContain("Crew role: Reviewer. Review the result.");
      expect(turn.prompt).toContain("This role is told not to edit project files");
      expect(turn.prompt).not.toContain("Implement changes");
      expect(h.inputs[0]!.config).toMatchObject({ effort: "high", fast: true });
      h.handles[1]!.completeTurn("completed");
      await h.manager.waitForSettlement(PARENT, h.manager.listRuns(PARENT)[1]!.run_id);

      h.changeRole({
        label: "Builder",
        brief: "Implement again",
        noEdits: undefined,
        selection: { agentKind: "codex", model: "gpt-5.5" },
      });
      const cleared = await dispatchTool(
        tool,
        {
          ...(tool === "spawn_agent"
            ? { role: "builder" }
            : { run_id: h.manager.listRuns(PARENT)[1]!.run_id }),
          prompt: "Third",
          background: true,
        },
        h.ctx,
      );
      expect(cleared.isError).not.toBe(true);
      await vi.waitFor(() => expect(h.handles[2]?.startTurns).toHaveLength(1));
      const reset = h.handles[2]!.startTurns[0]!;
      expect(reset.config.effort).toBeUndefined();
      expect(reset.config.fast).not.toBe(true);
      expect(reset.prompt).toContain("replaces previous role instructions");
      expect(reset.prompt).not.toContain("This role is told not to edit project files");
    } finally {
      h.manager.cancelAllForThread(PARENT);
      await flush();
    }
  },
);

it.each(["model", "context", "fallback"] as const)(
  "a completed steer refuses a changed %s before losing conversation context",
  async (change) => {
    const h = await setup();
    try {
      h.changeRole(
        change === "fallback"
          ? {
              selection: { agentKind: "unavailable", model: "missing" },
              fallbacks: [{ agentKind: "codex", model: "other-model", effort: "low" }],
            }
          : {
              selection: {
                agentKind: "codex",
                model: change === "model" ? "other-model" : "gpt-5.5",
                ...(change === "context" ? { contextSize: "1m" } : {}),
                effort: "low",
                fast: false,
              },
            },
      );
      const result = await dispatchTool(
        "steer_agent",
        { run_id: h.runId, prompt: "Next", background: true },
        h.ctx,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("self-contained task brief");
      expect(h.inputs).toHaveLength(1);
      expect(h.manager.listRuns(PARENT)[0]?.continued_by).toBeUndefined();
      const fresh = await dispatchTool(
        "spawn_agent",
        {
          role: "builder",
          prompt: "Complete task brief for the new helper",
          background: true,
        },
        h.ctx,
      );
      expect(fresh.isError).not.toBe(true);
      await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
      expect(h.inputs[1]!.sessionRef).toBeUndefined();
      expect(h.inputs[1]!.config).toMatchObject({
        model: change === "context" ? "gpt-5.5" : "other-model",
        effort: "low",
      });
      expect(h.inputs[1]!.config.contextSize).toBe(change === "context" ? "1m" : undefined);
      expect(h.manager.getStatus(h.runId).status).toBe("completed");
    } finally {
      h.manager.cancelAllForThread(PARENT);
      await flush();
    }
  },
);

it("refuses a removed role before starting another helper turn", async () => {
  const h = await setup();
  h.changeRole({ id: "replacement", label: "Replacement" });
  const result = await dispatchTool(
    "steer_agent",
    { run_id: h.runId, prompt: "Next", background: true },
    h.ctx,
  );
  expect(result.isError).toBe(true);
  expect(result.content[0]?.text).toContain("Unknown crew role: builder");
  expect(h.inputs).toHaveLength(1);
});

it("keeps a failed resumed turn retryable instead of silently starting its fallback", async () => {
  const h = await setup();
  try {
    h.changeRole({
      selection: { agentKind: "codex", model: "gpt-5.5", effort: "low" },
      fallbacks: [{ agentKind: "codex", model: "other-model", effort: "low" }],
    });
    h.open.mockRejectedValueOnce(new Error("Resume unavailable"));
    const result = await dispatchTool(
      "steer_agent",
      {
        run_id: h.runId,
        prompt: "Next",
        background: true,
      },
      h.ctx,
    );
    expect(result.isError).not.toBe(true);
    const failedId = h.manager.listRuns(PARENT)[1]!.run_id;
    await h.manager.waitForSettlement(PARENT, failedId);
    await vi.waitFor(() => expect(h.manager.listRuns(PARENT)[0]?.continued_by).toBeUndefined());
    expect(h.inputs).toHaveLength(2);
    expect(h.inputs[1]!.sessionRef?.providerSessionId).toBe("helper-session");
    const retry = await dispatchTool(
      "steer_agent",
      {
        run_id: h.runId,
        prompt: "Retry next",
        background: true,
      },
      h.ctx,
    );
    expect(retry.isError).not.toBe(true);
    await vi.waitFor(() => expect(h.handles[2]?.startTurns).toHaveLength(1));
    expect(h.inputs[2]!.sessionRef?.providerSessionId).toBe("helper-session");
  } finally {
    h.manager.cancelAllForThread(PARENT);
    await flush();
  }
});

it("refreshes config and role instructions when steering opens another provider turn", async () => {
  const h = await setup(false);
  try {
    const handle = h.handles[0]!;
    handle.interruptTurn = async () => handle.completeTurn("interrupted");
    h.changeRole({
      brief: "Review only",
      noEdits: true,
      selection: { agentKind: "codex", model: "gpt-5.5", effort: "low", fast: false },
    });
    const result = await dispatchTool(
      "steer_agent",
      {
        run_id: h.runId,
        prompt: "Correct the current task",
        background: true,
      },
      h.ctx,
    );
    expect(result.isError).not.toBe(true);
    expect(h.inputs).toHaveLength(1);
    expect(handle.startTurns).toHaveLength(2);
    expect(handle.startTurns[1]!.config).toMatchObject({ effort: "low", fast: false });
    expect(handle.startTurns[1]!.prompt).toContain("Review only");
    expect(handle.startTurns[1]!.prompt).toContain("This role is told not to edit project files");
    expect(handle.startTurns[0]!.config).toMatchObject({ effort: "high", fast: true });
  } finally {
    h.manager.cancelAllForThread(PARENT);
    await flush();
  }
});

it("rejects an incompatible active correction before interrupting the original work", async () => {
  const h = await setup(false);
  try {
    h.changeRole({ selection: { agentKind: "codex", model: "other-model" } });
    const result = await dispatchTool(
      "steer_agent",
      {
        run_id: h.runId,
        prompt: "Correct the task",
        background: true,
      },
      h.ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("self-contained task brief");
    expect(h.handles[0]!.interrupted).toBe(false);
    expect(h.handles[0]!.startTurns).toHaveLength(1);
    expect(h.manager.getStatus(h.runId).status).toBe("running");
  } finally {
    h.manager.cancelAllForThread(PARENT);
    await flush();
  }
});

it("keeps native steering inside its already-admitted provider turn", async () => {
  const h = await setup(false);
  try {
    const steer = vi.fn<NonNullable<FakeHandle["steerTurn"]>>(async () => {});
    h.handles[0]!.steerTurn = steer;
    h.changeRole({ selection: { agentKind: "codex", model: "other-model", effort: "low" } });
    const result = await dispatchTool(
      "steer_agent",
      {
        run_id: h.runId,
        prompt: "Correct current work",
        background: true,
      },
      h.ctx,
    );
    expect(result.isError).not.toBe(true);
    expect(steer).toHaveBeenCalledWith(
      "Correct current work",
      expect.objectContaining({ model: "gpt-5.5", effort: "high", fast: true }),
    );
    expect(h.handles[0]!.startTurns).toHaveLength(1);
  } finally {
    h.manager.cancelAllForThread(PARENT);
    await flush();
  }
});
