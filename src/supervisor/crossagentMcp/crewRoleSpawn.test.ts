import { expect, it, vi } from "vitest";
import type { ThreadCrewBinding } from "@/shared/crew";
import type { AgentCapability, RuntimeEvent } from "@/shared/contracts";
import { dispatchTool, type SubagentToolContext } from "./toolRegistry";
import { makeHarness, PARENT, flush } from "./testHarness";
import type { SpawnAgentRequest } from "./types";

const roleCrew = (parallel = 2, noEdits = true): ThreadCrewBinding => ({
  version: 1,
  name: "Ship crew",
  policy: "crew-only",
  roles: [
    {
      id: "builder",
      label: "Builder",
      brief: "Implements changes and runs tests",
      ...(noEdits ? { noEdits: true as const } : {}),
      selection: { agentKind: "codex", model: "gpt-5.5", effort: "high" },
      fallbacks: [{ agentKind: "codex", model: "gpt-5.5", effort: "high" }],
      parallel,
    },
  ],
});

function syntheticTileEvents(events: Array<{ event: RuntimeEvent }>) {
  return events.flatMap(({ event }) => {
    if (!("itemId" in event) || !event.itemId.startsWith("sub:") || !("payload" in event)) {
      return [];
    }
    return [{ event, payload: event.payload as Record<string, unknown> }];
  });
}

function context(
  manager: SubagentToolContext["runManager"],
  crew: ThreadCrewBinding,
  recordExplicitSelections = vi.fn<NonNullable<SubagentToolContext["recordExplicitSelections"]>>(),
): SubagentToolContext {
  return {
    parentThreadId: PARENT,
    runManager: manager,
    getCrew: () => crew,
    listSpawnableAgents: async () => [
      {
        provider: { value: "codex", label: "Codex" },
        models: [
          {
            value: "gpt-5.5",
            label: "GPT-5.5",
            reasoning: { values: ["high"] },
            fast: { available: true },
          },
        ],
        reasoningOptions: [{ value: "high", label: "High" }],
        defaultModel: "gpt-5.5",
        permissions: {
          options: [{ value: "full-access", label: "Full access" }],
          default: "full-access",
        },
        execution: "structured",
      },
    ],
    recordExplicitSelections,
  };
}

it("applies root role defaults to task batches and does not learn crew selections", async () => {
  const requests: SpawnAgentRequest[] = [];
  const recordExplicitSelections =
    vi.fn<NonNullable<SubagentToolContext["recordExplicitSelections"]>>();
  const runManager = {
    spawnMany: (_parent: string, batch: readonly SpawnAgentRequest[]) => {
      requests.push(...batch);
      return batch.map((_, index) => ({ runId: `run-${index}` }));
    },
  } as unknown as SubagentToolContext["runManager"];
  const result = await dispatchTool(
    "spawn_agent",
    {
      role: "builder",
      tasks: [{ prompt: "one" }, { role: "builder", prompt: "two" }],
      background: true,
    },
    context(runManager, roleCrew(), recordExplicitSelections),
  );
  expect(result.isError).not.toBe(true);
  expect(requests).toHaveLength(2);
  expect(requests.map((request) => [request.agent, request.model, request.crewRole?.id])).toEqual([
    ["codex", "gpt-5.5", "builder"],
    ["codex", "gpt-5.5", "builder"],
  ]);
  expect(recordExplicitSelections).not.toHaveBeenCalled();
});

it("applies the run_workflow root role to task defaults", async () => {
  const validated: SpawnAgentRequest[] = [];
  const manager = {
    validateRequests: (_parent: string, requests: readonly SpawnAgentRequest[]) => {
      validated.push(...requests);
    },
    getCapacity: () => 0,
    subscribe: () => () => {},
  } as unknown as SubagentToolContext["runManager"];
  const result = await dispatchTool(
    "run_workflow",
    {
      action: "start",
      role: "builder",
      tasks: [{ id: "build", prompt: "Implement", write_scope: [] }],
      background: true,
    },
    context(manager, roleCrew()),
  );
  expect(result.isError).not.toBe(true);
  expect(validated[0]).toMatchObject({
    agent: "codex",
    model: "gpt-5.5",
    crewRole: { id: "builder" },
  });
});

it("enforces crew policy through the older spawn_agents alias", async () => {
  const spawnMany = vi.fn<SubagentToolContext["runManager"]["spawnMany"]>(() => []);
  const manager = { spawnMany } as unknown as SubagentToolContext["runManager"];
  const result = await dispatchTool(
    "spawn_agents",
    { tasks: [{ prompt: "No role supplied" }] },
    context(manager, roleCrew()),
  );
  expect(result.isError).toBe(true);
  expect(result.content[0]?.text).toBe(
    "This thread's crew is Crew only: spawn with role=<id> (builder).",
  );
  expect(spawnMany).not.toHaveBeenCalled();
});

it("rejects a role argument through spawn_agents when no crew exists", async () => {
  const spawnMany = vi.fn<SubagentToolContext["runManager"]["spawnMany"]>(() => []);
  const manager = { spawnMany } as unknown as SubagentToolContext["runManager"];
  const ctx = context(manager, roleCrew());
  delete ctx.getCrew;
  const result = await dispatchTool(
    "spawn_agents",
    { tasks: [{ role: "builder", prompt: "No crew" }] },
    ctx,
  );
  expect(result.isError).toBe(true);
  expect(result.content[0]?.text).toBe("This thread has no crew; omit role.");
  expect(spawnMany).not.toHaveBeenCalled();
});

it("resolves a role through the older spawn_agents alias", async () => {
  const requests: SpawnAgentRequest[] = [];
  const spawnMany = vi.fn<SubagentToolContext["runManager"]["spawnMany"]>((_parent, batch) => {
    requests.push(...batch);
    return batch.map((_, index) => ({ runId: `legacy-run-${index}` }));
  });
  const manager = { spawnMany } as unknown as SubagentToolContext["runManager"];
  const result = await dispatchTool(
    "spawn_agents",
    { tasks: [{ role: "builder", prompt: "Use the crew role" }] },
    context(manager, roleCrew()),
  );
  expect(result.isError).not.toBe(true);
  expect(JSON.parse(result.content[0]!.text)).toEqual({ run_ids: ["legacy-run-0"] });
  expect(requests[0]?.crewRole?.id).toBe("builder");
});

it("promotes the first spawnable role fallback through the tool layer", async () => {
  const crew = roleCrew();
  crew.roles[0]!.selection = { agentKind: "missing", model: "missing-model" };
  crew.roles[0]!.fallbacks = [{ agentKind: "codex", model: "gpt-5.5", effort: "high" }];
  let spawned: SpawnAgentRequest | undefined;
  const manager = {
    spawn: (_parent: string, request: SpawnAgentRequest) => {
      spawned = request;
      return { runId: "run" };
    },
    continueRole: async () => undefined,
  } as unknown as SubagentToolContext["runManager"];
  const result = await dispatchTool(
    "spawn_agent",
    { role: "builder", prompt: "Inspect", background: true },
    context(manager, crew),
  );
  expect(result.isError).not.toBe(true);
  expect(spawned).toMatchObject({
    agent: "codex",
    model: "gpt-5.5",
    effort: "high",
    crewRole: { id: "builder" },
  });
});

it("preserves the run_id for a foreground role spawn result", async () => {
  const runManager = {
    spawn: () => ({ runId: "foreground-role-run" }),
    continueRole: async () => undefined,
    waitFor: async () => ({ status: "completed" as const, output: "Done" }),
  } as unknown as SubagentToolContext["runManager"];
  const result = await dispatchTool(
    "spawn_agent",
    { role: "builder", prompt: "Implement" },
    context(runManager, roleCrew()),
  );
  expect(result.isError).not.toBe(true);
  expect(JSON.parse(result.content[0]!.text)).toMatchObject({
    run_id: "foreground-role-run",
    status: "completed",
    output: "Done",
  });
});

it("includes run_id in a foreground role spawn result", async () => {
  const runManager = {
    spawn: () => ({ runId: "foreground-role-run" }),
    continueRole: async () => undefined,
    waitFor: async () => ({ status: "completed" as const, output: "Done" }),
  } as unknown as SubagentToolContext["runManager"];
  const result = await dispatchTool(
    "spawn_agent",
    { role: "builder", prompt: "Implement" },
    context(runManager, roleCrew()),
  );
  expect(result.isError).not.toBe(true);
  expect(JSON.parse(result.content[0]!.text)).toMatchObject({
    run_id: "foreground-role-run",
    status: "completed",
    output: "Done",
  });
});

it("returns the exact unavailable-role error through the tool layer", async () => {
  const crew = roleCrew();
  crew.roles[0]!.selection = { agentKind: "missing", model: "missing-model" };
  crew.roles[0]!.fallbacks = [];
  const spawn = vi.fn<(parentThreadId: string, request: SpawnAgentRequest) => { runId: string }>();
  const manager = { spawn } as unknown as SubagentToolContext["runManager"];
  const result = await dispatchTool(
    "spawn_agent",
    { role: "builder", prompt: "Inspect", background: true },
    context(manager, crew),
  );
  expect(result.isError).toBe(true);
  expect(result.content[0]?.text).toBe(
    "Role Builder has no available agent right now (missing/missing-model and its fallbacks are unavailable).",
  );
  expect(spawn).not.toHaveBeenCalled();
});

it("includes the role preamble and no-edit instruction in worker turns", async () => {
  const h = makeHarness();
  const recordExplicitSelections =
    vi.fn<NonNullable<SubagentToolContext["recordExplicitSelections"]>>();
  const ctx = context(h.manager, roleCrew(), recordExplicitSelections);
  const result = await dispatchTool(
    "spawn_agent",
    { role: "builder", prompt: "Make the change", background: true },
    ctx,
  );
  expect(result.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[0]?.startTurns).toHaveLength(1));
  expect(h.handles[0]!.startTurns[0]!.prompt).toContain(
    "Crew role: Builder. Implements changes and runs tests. This role is told not to edit files: do not create, modify or delete files; report what you find instead. Do this work yourself: do not start subagents, including your own built-in subagent or task tools, and do not hand it to other agents. Follow the task as written; if it cannot work, stop and report why instead of changing the plan. Finish with a short report for the lead (under 15 lines): what you changed (files), the checks you ran with pass/fail, and anything left open. Do not paste full logs or whole files; the lead reads the diff itself.\n\nMake the change",
  );
  expect(h.inputs[0]!.config).toMatchObject({
    approvalPolicy: "never",
    sandboxMode: "danger-full-access",
  });
  expect(h.manager.listRuns(PARENT)[0]?.role).toBe("builder");
  expect(recordExplicitSelections).not.toHaveBeenCalled();
  h.handles[0]!.completeTurn("completed");
  await flush();
});

it("omits optional role brief and no-edit text when absent", async () => {
  const h = makeHarness();
  const crew = roleCrew(2, false);
  delete crew.roles[0]!.brief;
  const result = await dispatchTool(
    "spawn_agent",
    { role: "builder", prompt: "Inspect", background: true },
    context(h.manager, crew),
  );
  expect(result.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[0]?.startTurns).toHaveLength(1));
  expect(h.handles[0]!.startTurns[0]!.prompt).toContain(
    "Crew role: Builder. Do this work yourself: do not start subagents, including your own built-in subagent or task tools, and do not hand it to other agents. Follow the task as written; if it cannot work, stop and report why instead of changing the plan. Finish with a short report for the lead (under 15 lines): what you changed (files), the checks you ran with pass/fail, and anything left open. Do not paste full logs or whole files; the lead reads the diff itself.\n\nInspect",
  );
  expect(h.handles[0]!.startTurns[0]!.prompt).not.toContain("Told not to edit files");
  h.handles[0]!.completeTurn("completed");
  await flush();
});

it("marks the synthetic role tile on start, fallback update and completion", async () => {
  const h = makeHarness({ createFailures: 1 });
  const result = await dispatchTool(
    "spawn_agent",
    { role: "builder", prompt: "Inspect", background: true },
    context(h.manager, roleCrew()),
  );
  expect(result.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles).toHaveLength(1));
  const tiles = syntheticTileEvents(h.appended);
  expect(tiles[0]?.event).toMatchObject({
    type: "item.started",
  });
  expect(tiles[0]?.payload).toMatchObject({
    subAgentType: "Builder",
  });
  expect(
    tiles.some(
      ({ event, payload }) => event.type === "item.updated" && payload.subAgentType === "Builder",
    ),
  ).toBe(true);
  h.handles[0]!.completeTurn("completed");
  await flush();
  expect(
    syntheticTileEvents(h.appended).some(
      ({ event, payload }) => event.type === "item.completed" && payload.subAgentType === "Builder",
    ),
  ).toBe(true);
});

it("keeps the role label on a continued run's synthetic tile", async () => {
  const h = makeHarness({ resume: { sessionId: "role-session" } });
  const ctx = context(h.manager, roleCrew());
  const started = await dispatchTool(
    "spawn_agent",
    { role: "builder", prompt: "Inspect", background: true },
    ctx,
  );
  expect(started.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles).toHaveLength(1));
  const firstRun = h.manager.listRuns(PARENT)[0]!.run_id;
  h.handles[0]!.emit({
    type: "content.delta",
    threadId: "child",
    itemId: "answer",
    stream: "assistant_text",
    delta: "Done",
  });
  h.handles[0]!.completeTurn("completed");
  await h.manager.waitForSettlement(PARENT, firstRun);

  const continued = await dispatchTool(
    "steer_agent",
    { run_id: firstRun, prompt: "Verify the result", background: true },
    ctx,
  );
  expect(continued.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles).toHaveLength(2));
  const continuedTile = h.appended.find(
    ({ event }) =>
      event.type === "item.started" &&
      event.itemId?.startsWith("sub:") &&
      event.itemId !== `sub:${firstRun}`,
  );
  expect(continuedTile?.event).toMatchObject({
    type: "item.started",
    payload: { subAgentType: "Builder" },
  });
  expect(h.manager.listRuns(PARENT).find((run) => run.run_id !== firstRun)?.role).toBe("builder");
  h.handles[1]!.completeTurn("completed");
  await flush();
});

it("enforces the role parallel limit atomically for same-batch requests", async () => {
  const h = makeHarness();
  const result = await dispatchTool(
    "spawn_agent",
    {
      role: "builder",
      tasks: [{ prompt: "one" }, { prompt: "two" }],
      background: true,
    },
    context(h.manager, roleCrew(1)),
  );
  expect(result.isError).toBe(true);
  expect(result.content[0]?.text).toBe(
    "Role Builder allows 1 run(s) at once; this call asked for 2.",
  );
  expect(h.inputs).toHaveLength(0);
});

it("counts already-running role runs before accepting another", async () => {
  const h = makeHarness();
  const ctx = context(h.manager, roleCrew(1));
  expect(
    (await dispatchTool("spawn_agent", { role: "builder", prompt: "one", background: true }, ctx))
      .isError,
  ).not.toBe(true);
  await vi.waitFor(() => expect(h.handles).toHaveLength(1));
  const result = await dispatchTool(
    "spawn_agent",
    { role: "builder", prompt: "two", background: true },
    ctx,
  );
  expect(result.isError).toBe(true);
  expect(result.content[0]?.text).toBe(
    "Role Builder allows 1 run(s) at once and 1 are running. Wait for one to finish.",
  );
  expect(h.inputs).toHaveLength(1);
  h.handles[0]!.completeTurn("completed");
  await flush();
});

it("does not add a role preamble when the request has no crew role", async () => {
  const h = makeHarness();
  const noRoleCrew = roleCrew();
  noRoleCrew.policy = "crew-first";
  const result = await dispatchTool(
    "spawn_agent",
    { provider: "codex", model: "gpt-5.5", prompt: "Inspect", background: true },
    context(h.manager, noRoleCrew),
  );
  expect(result.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[0]?.startTurns).toHaveLength(1));
  expect(h.handles[0]!.startTurns[0]!.prompt).not.toContain("Crew role:");
  h.handles[0]!.completeTurn("completed");
  await flush();
});

it("continues a role's helper session unless the lead asks for a fresh one", async () => {
  const spawn = vi.fn<(parentThreadId: string, request: SpawnAgentRequest) => { runId: string }>(
    () => ({ runId: "fresh-run" }),
  );
  const continueRole = vi.fn<
    (
      parentThreadId: string,
      request: SpawnAgentRequest,
      background: boolean,
    ) => Promise<{ runId: string; continuedFrom: string } | undefined>
  >(async () => ({ runId: "continued-run", continuedFrom: "first-run" }));
  const manager = { spawn, continueRole } as unknown as SubagentToolContext["runManager"];

  const continued = await dispatchTool(
    "spawn_agent",
    { role: "builder", prompt: "Next task", background: true },
    context(manager, roleCrew()),
  );
  expect(JSON.parse(continued.content[0]!.text)).toMatchObject({
    run_id: "continued-run",
    continued_from: "first-run",
    status: "running",
  });
  expect(spawn).not.toHaveBeenCalled();

  const fresh = await dispatchTool(
    "spawn_agent",
    { role: "builder", prompt: "Unrelated task", background: true, fresh_session: true },
    context(manager, roleCrew()),
  );
  expect(JSON.parse(fresh.content[0]!.text)).toMatchObject({ run_id: "fresh-run" });
  expect(continueRole).toHaveBeenCalledTimes(1);
});

it("gives a helper the role's context length only when its model offers it", async () => {
  const statusCapabilities = {
    models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
    efforts: ["low", "high"],
    contextSizes: [
      { id: "272k", label: "272k" },
      { id: "1m", label: "1M" },
    ],
    modelContextSizes: { "gpt-5.5": ["272k", "1m"] },
    approvalPolicies: [{ id: "never", label: "Full Access" }],
    sandboxModes: [{ id: "danger-full-access", label: "Full Access" }],
    bypassPermissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
  } as unknown as AgentCapability;
  const h = makeHarness({ statusCapabilities });
  h.manager.spawn(PARENT, { agent: "codex", model: "gpt-5.5", contextSize: "1m", prompt: "Wide" });
  h.manager.spawn(PARENT, { agent: "codex", model: "gpt-5.5", contextSize: "2m", prompt: "Odd" });
  await vi.waitFor(() => expect(h.inputs).toHaveLength(2));
  expect(h.inputs[0]!.config.contextSize).toBe("1m");
  expect(h.inputs[1]!.config.contextSize).toBeUndefined();
  h.manager.cancelAllForThread(PARENT);
  await flush();
});
