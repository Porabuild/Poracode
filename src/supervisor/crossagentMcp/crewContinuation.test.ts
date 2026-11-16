import { expect, it, vi } from "vitest";
import type { ThreadCrewBinding } from "@/shared/crew";
import { agentCapabilitySchema, type AgentCapability } from "@/shared/contracts";
import { dispatchTool, type SubagentToolContext } from "./toolRegistry";
import { FakeHandle, makeHarness, PARENT, flush } from "./testHarness";
import type { SpawnAgentRequest, SpawnableAgent } from "./types";

type CrewRole = ThreadCrewBinding["roles"][number];

const FALLBACK_ROLE: CrewRole = {
  id: "sidekick",
  label: "Sidekick",
  parallel: 1,
  selection: { agentKind: "codex", model: "first", effort: "high" },
  fallbacks: [{ agentKind: "codex", model: "second", effort: "low" }],
};

const SINGLE_ROLE: CrewRole = {
  id: "sidekick",
  label: "Sidekick",
  parallel: 1,
  selection: { agentKind: "codex", model: "first", effort: "high" },
};

// Same provider/model/raw context in primary and fallback: only the original
// configured option index distinguishes them.
const DUPLICATE_ROLE: CrewRole = {
  id: "sidekick",
  label: "Sidekick",
  parallel: 1,
  selection: { agentKind: "codex", model: "first", effort: "high", fast: true },
  fallbacks: [{ agentKind: "codex", model: "first", effort: "low", fast: false }],
};

// Primary wins by default; fallback stays available for capability-drift tests.
const PRIMARY_FAST_ROLE: CrewRole = {
  id: "sidekick",
  label: "Sidekick",
  parallel: 1,
  selection: { agentKind: "codex", model: "first", effort: "high", fast: true },
  fallbacks: [{ agentKind: "codex", model: "second", effort: "low", fast: false }],
};

function capabilities(options?: { modelContextSizes?: Record<string, string[]> }) {
  return agentCapabilitySchema.parse({
    supportsResume: true,
    models: [
      { id: "first", label: "First" },
      { id: "second", label: "Second" },
      { id: "third", label: "Third" },
    ],
    efforts: ["low", "high"],
    fastModels: ["first", "second", "third"],
    contextSizes: [
      { id: "1m", label: "1M" },
      { id: "272k", label: "272K" },
    ],
    modelContextSizes: options?.modelContextSizes ?? {
      first: ["1m", "272k"],
      second: ["1m", "272k"],
      third: ["1m", "272k"],
    },
    approvalPolicies: [{ id: "never", label: "Full access" }],
    sandboxModes: [{ id: "danger-full-access", label: "Full access" }],
  });
}

function roster(
  models: readonly string[],
  options?: { reasoning?: readonly string[]; fastAvailable?: boolean },
): SpawnableAgent[] {
  return [
    {
      provider: { value: "codex", label: "Worker" },
      models: models.map((model) => ({
        value: model,
        label: model,
        reasoning: { values: [...(options?.reasoning ?? ["low", "high"])] },
        fast: { available: options?.fastAvailable ?? true },
      })),
      reasoningOptions: [],
      defaultModel: models[0]!,
      permissions: {
        options: [{ value: "full-access", label: "Full access" }],
        default: "full-access",
      },
      execution: "structured",
    },
  ];
}

function crew(role: CrewRole): ThreadCrewBinding {
  return { version: 1, policy: "crew-only", roles: [role] };
}

function wide(role: CrewRole): CrewRole {
  return { ...role, selection: { ...role.selection, contextSize: "1m" } };
}

function setup(options?: {
  role?: CrewRole;
  models?: string[];
  caps?: AgentCapability;
  createFailures?: number;
  rosterOptions?: { reasoning?: readonly string[]; fastAvailable?: boolean };
}) {
  const caps = options?.caps ?? capabilities();
  const h = makeHarness({
    resume: { sessionId: "helper-session" },
    statusCapabilities: caps,
    ...(options?.createFailures ? { createFailures: options.createFailures } : {}),
  });
  let binding = crew(options?.role ?? SINGLE_ROLE);
  let visibleModels = [...(options?.models ?? ["first"])];
  let visibleRosterOptions = options?.rosterOptions;
  const ctx: SubagentToolContext = {
    parentThreadId: PARENT,
    runManager: h.manager,
    getCrew: () => binding,
    listSpawnableAgents: async () => roster(visibleModels, visibleRosterOptions),
  };
  return {
    ...h,
    ctx,
    caps,
    patchRole: (patch: Partial<CrewRole>) => {
      binding = { ...binding, roles: [{ ...binding.roles[0]!, ...patch }] };
    },
    setModels: (models: string[]) => {
      visibleModels = models;
    },
    setRosterOptions: (rosterOptions: {
      reasoning?: readonly string[];
      fastAvailable?: boolean;
    }) => {
      visibleRosterOptions = rosterOptions;
    },
  };
}

function answer(handle: FakeHandle, text: string) {
  handle.emit({
    type: "content.delta",
    threadId: "child",
    itemId: "answer",
    stream: "assistant_text",
    delta: text,
  });
  handle.completeTurn("completed");
}

async function spawnRole(h: ReturnType<typeof setup>, prompt = "First task"): Promise<string> {
  const result = await dispatchTool(
    "spawn_agent",
    { role: "sidekick", prompt, background: true },
    h.ctx,
  );
  expect(result.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[0]?.startTurns).toHaveLength(1));
  return h.manager.listRuns(PARENT)[0]!.run_id;
}

async function completeFirst(h: ReturnType<typeof setup>, runId: string) {
  answer(h.handles[0]!, "First result");
  await h.manager.waitForSettlement(PARENT, runId);
}

async function steer(h: ReturnType<typeof setup>, runId: string, prompt = "Second task") {
  return dispatchTool("steer_agent", { run_id: runId, prompt, background: true }, h.ctx);
}

it("continues a winning runtime fallback for an unchanged role", async () => {
  const h = setup({ role: FALLBACK_ROLE, models: ["first", "second"], createFailures: 1 });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);
  expect(h.inputs[0]!.config.model).toBe("first");
  expect(h.inputs[1]!.config.model).toBe("second");
  expect(h.manager.listRuns(PARENT)[0]).toMatchObject({ attempt: 2, can_steer: true });

  const steered = await steer(h, runId);
  expect(steered.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
  const lastInput = h.inputs[h.inputs.length - 1]!;
  expect(lastInput.sessionRef?.providerSessionId).toBe("helper-session");
  expect(lastInput.config).toMatchObject({ model: "second", effort: "low" });
  expect(h.handles[1]!.startTurns[0]!.prompt).toContain("[crew update]");
  const receipt = JSON.parse(steered.content[0]!.text) as {
    run_id: string;
    continued_from: string;
  };
  expect(receipt.continued_from).toBe(runId);
  answer(h.handles[1]!, "Second result");
  await h.manager.waitForSettlement(PARENT, receipt.run_id);
});

it.each(["steer", "spawn"] as const)(
  "does not switch back to the primary when availability recovers via %s",
  async (route) => {
    const h = setup({ role: FALLBACK_ROLE, models: ["second"] });
    const runId = await spawnRole(h);
    await completeFirst(h, runId);
    expect(h.inputs[0]!.config.model).toBe("second");

    h.setModels(["first", "second"]);
    const response =
      route === "steer"
        ? await steer(h, runId)
        : await dispatchTool(
            "spawn_agent",
            { role: "sidekick", prompt: "Second task", background: true },
            h.ctx,
          );
    expect(response.isError).not.toBe(true);
    await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
    expect(h.inputs[h.inputs.length - 1]!.sessionRef?.providerSessionId).toBe("helper-session");
    expect(h.handles[1]!.startTurns[0]!.config.model).toBe("second");
    answer(h.handles[1]!, "Second result");
    const receipt = JSON.parse(response.content[0]!.text) as {
      run_id: string;
      continued_from: string;
    };
    expect(receipt.continued_from).toBe(runId);
    await h.manager.waitForSettlement(PARENT, receipt.run_id);
  },
);

it("preserves the original effective context when the configured size becomes advertised", async () => {
  const caps = capabilities({ modelContextSizes: {} });
  const h = setup({ role: wide(SINGLE_ROLE), caps });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);
  expect(h.inputs[0]!.config.contextSize).toBeUndefined();

  caps.modelContextSizes = { first: ["1m"] };
  const steered = await steer(h, runId);
  expect(steered.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
  expect(h.inputs[h.inputs.length - 1]!.sessionRef?.providerSessionId).toBe("helper-session");
  expect(h.handles[1]!.startTurns[0]!.config.contextSize).toBeUndefined();
  answer(h.handles[1]!, "Second result");
  const receipt = JSON.parse(steered.content[0]!.text) as { run_id: string };
  await h.manager.waitForSettlement(PARENT, receipt.run_id);
});

it("preserves the filtered raw-context identity across two completed steer follow-ups", async () => {
  const caps = capabilities({ modelContextSizes: {} });
  const h = setup({ role: wide(SINGLE_ROLE), caps });
  let runId = await spawnRole(h);
  await completeFirst(h, runId);
  expect(h.inputs[0]!.config.contextSize).toBeUndefined();

  caps.modelContextSizes = { first: ["1m"] };
  for (let turn = 1; turn <= 2; turn += 1) {
    const steered = await steer(h, runId, `Follow-up ${turn}`);
    expect(steered.isError).not.toBe(true);
    await vi.waitFor(() => expect(h.handles[h.handles.length - 1]?.startTurns).toHaveLength(1));
    expect(h.inputs[h.inputs.length - 1]!.sessionRef?.providerSessionId).toBe("helper-session");
    expect(h.handles[h.handles.length - 1]!.startTurns[0]!.config.contextSize).toBeUndefined();
    const receipt = JSON.parse(steered.content[0]!.text) as {
      run_id: string;
      continued_from: string;
    };
    expect(receipt.continued_from).toBe(runId);
    answer(h.handles[h.handles.length - 1]!, `Result ${turn}`);
    await h.manager.waitForSettlement(PARENT, receipt.run_id);
    runId = receipt.run_id;
  }

  h.patchRole({ selection: { ...wide(SINGLE_ROLE).selection, contextSize: "272k" } });
  const changed = await steer(h, runId, "Changed context");
  expect(changed.isError).toBe(true);
  expect(changed.content[0]?.text).toContain("original codex/first/1m");
  expect(changed.content[0]?.text).toContain("current codex/first/272k");
  expect(h.inputs).toHaveLength(3);
});

it("preserves the filtered raw-context identity across two same-role spawn follow-ups", async () => {
  const caps = capabilities({ modelContextSizes: {} });
  const h = setup({ role: wide(SINGLE_ROLE), caps });
  let runId = await spawnRole(h);
  await completeFirst(h, runId);
  expect(h.inputs[0]!.config.contextSize).toBeUndefined();

  caps.modelContextSizes = { first: ["1m"] };
  for (let turn = 1; turn <= 2; turn += 1) {
    const spawned = await dispatchTool(
      "spawn_agent",
      { role: "sidekick", prompt: `Spawn follow-up ${turn}`, background: true },
      h.ctx,
    );
    expect(spawned.isError).not.toBe(true);
    await vi.waitFor(() => expect(h.handles[h.handles.length - 1]?.startTurns).toHaveLength(1));
    expect(h.inputs[h.inputs.length - 1]!.sessionRef?.providerSessionId).toBe("helper-session");
    expect(h.handles[h.handles.length - 1]!.startTurns[0]!.config.contextSize).toBeUndefined();
    const receipt = JSON.parse(spawned.content[0]!.text) as {
      run_id: string;
      continued_from: string;
    };
    expect(receipt.continued_from).toBe(runId);
    answer(h.handles[h.handles.length - 1]!, `Spawn result ${turn}`);
    await h.manager.waitForSettlement(PARENT, receipt.run_id);
    runId = receipt.run_id;
  }

  h.patchRole({ selection: { ...wide(SINGLE_ROLE).selection, contextSize: "272k" } });
  const changed = await steer(h, runId, "Changed context");
  expect(changed.isError).toBe(true);
  expect(changed.content[0]?.text).toContain("original codex/first/1m");
  expect(changed.content[0]?.text).toContain("current codex/first/272k");
  expect(h.inputs).toHaveLength(3);
});

it("refuses a new turn when the provider stops advertising the original context, then allows retry", async () => {
  const caps = capabilities({ modelContextSizes: { first: ["1m"] } });
  const h = setup({ role: wide(SINGLE_ROLE), caps });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);
  expect(h.inputs[0]!.config.contextSize).toBe("1m");

  caps.modelContextSizes = {};
  const steered = await steer(h, runId);
  expect(steered.isError).toBe(true);
  const message = steered.content[0]?.text ?? "";
  expect(message).toContain("codex/first");
  expect(message).toContain("requested context length 1m");
  expect(message).toContain("original effective context 1m");
  expect(message).toContain("no longer available");
  expect(h.inputs).toHaveLength(1);
  expect(h.manager.listRuns(PARENT)[0]).toMatchObject({
    status: "completed",
    can_steer: true,
  });
  expect(h.manager.listRuns(PARENT)[0]?.continued_by).toBeUndefined();

  caps.modelContextSizes = { first: ["1m"] };
  const retried = await steer(h, runId);
  expect(retried.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
  expect(h.inputs[h.inputs.length - 1]!.sessionRef?.providerSessionId).toBe("helper-session");
  expect(h.handles[1]!.startTurns[0]!.config.contextSize).toBe("1m");
  answer(h.handles[1]!, "Second result");
  const receipt = JSON.parse(retried.content[0]!.text) as { run_id: string };
  await h.manager.waitForSettlement(PARENT, receipt.run_id);
});

it("surfaces a capability failure from same-role spawn instead of starting a fresh helper", async () => {
  const caps = capabilities({ modelContextSizes: { first: ["1m"] } });
  const h = setup({ role: wide(SINGLE_ROLE), caps });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);

  caps.modelContextSizes = {};
  const spawned = await dispatchTool(
    "spawn_agent",
    { role: "sidekick", prompt: "Second task", background: true },
    h.ctx,
  );
  expect(spawned.isError).toBe(true);
  expect(spawned.content[0]?.text).toContain("no longer available");
  expect(h.inputs).toHaveLength(1);
  expect(h.manager.listRuns(PARENT)[0]?.can_steer).toBe(true);

  caps.modelContextSizes = { first: ["1m"] };
  const retried = await dispatchTool(
    "spawn_agent",
    { role: "sidekick", prompt: "Second task", background: true },
    h.ctx,
  );
  expect(retried.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
  expect(h.inputs[h.inputs.length - 1]!.sessionRef?.providerSessionId).toBe("helper-session");
  expect(h.handles[1]!.startTurns[0]!.config.contextSize).toBe("1m");
  answer(h.handles[1]!, "Second result");
  const receipt = JSON.parse(retried.content[0]!.text) as { run_id: string };
  await h.manager.waitForSettlement(PARENT, receipt.run_id);
});

it.each([
  {
    name: "model",
    reason: "Unknown model: first",
    mutate: (caps: AgentCapability) => {
      caps.models = caps.models.filter((model) => model.id !== "first");
    },
    applyRoster: (h: ReturnType<typeof setup>) => h.setModels(["second"]),
  },
  {
    name: "effort",
    reason: "Unsupported reasoning for first: high",
    mutate: (caps: AgentCapability) => {
      caps.efforts = ["low"];
    },
    applyRoster: (h: ReturnType<typeof setup>) => h.setRosterOptions({ reasoning: ["low"] }),
  },
  {
    name: "Fast",
    reason: "Fast is not supported by first",
    mutate: (caps: AgentCapability) => {
      caps.fastModels = ["second"];
    },
    applyRoster: (h: ReturnType<typeof setup>) => h.setRosterOptions({ fastAvailable: false }),
  },
])(
  "surfaces $name drift for the winning option without spawning another one",
  async ({ reason, mutate, applyRoster }) => {
    const caps = capabilities();
    const h = setup({ role: PRIMARY_FAST_ROLE, models: ["first", "second"], caps });
    const runId = await spawnRole(h);
    await completeFirst(h, runId);
    const original = {
      models: caps.models,
      efforts: caps.efforts,
      fastModels: caps.fastModels,
    };
    mutate(caps);
    applyRoster(h);
    const spawn = vi.spyOn(h.manager, "spawn");

    const blocked = await dispatchTool(
      "spawn_agent",
      { role: "sidekick", prompt: "Second task", background: true },
      h.ctx,
    );
    expect(blocked.isError).toBe(true);
    const message = blocked.content[0]?.text ?? "";
    expect(message).toContain("cannot continue codex/first");
    expect(message).toContain("current configuration rejects the winning selection");
    expect(message).toContain(reason);
    expect(message).toContain("with the current role");
    expect(message).toContain("fresh_session=true");
    expect(message).toContain("currently available model, settings and context");
    expect(spawn).not.toHaveBeenCalled();
    expect(h.inputs).toHaveLength(1);
    expect(h.manager.listRuns(PARENT)[0]).toMatchObject({ can_steer: true });
    expect(h.manager.listRuns(PARENT)[0]?.continued_by).toBeUndefined();

    caps.models = original.models;
    caps.efforts = original.efforts;
    if (original.fastModels !== undefined) caps.fastModels = original.fastModels;
    h.setModels(["first", "second"]);
    h.setRosterOptions({});
    const retried = await dispatchTool(
      "spawn_agent",
      { role: "sidekick", prompt: "Second task", background: true },
      h.ctx,
    );
    expect(retried.isError).not.toBe(true);
    await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
    expect(h.inputs[h.inputs.length - 1]!.sessionRef?.providerSessionId).toBe("helper-session");
    expect(h.handles[1]!.startTurns[0]!.config).toMatchObject({
      model: "first",
      effort: "high",
      fast: true,
    });
    answer(h.handles[1]!, "Second result");
    const receipt = JSON.parse(retried.content[0]!.text) as {
      run_id: string;
      continued_from: string;
    };
    expect(receipt.continued_from).toBe(runId);
    await h.manager.waitForSettlement(PARENT, receipt.run_id);
  },
);

it("offers fresh_session recovery after a context capability failure", async () => {
  const caps = capabilities({ modelContextSizes: { first: ["1m"] } });
  const h = setup({ role: wide(SINGLE_ROLE), caps });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);
  expect(h.inputs[0]!.config.contextSize).toBe("1m");

  caps.modelContextSizes = {};
  const blocked = await dispatchTool(
    "spawn_agent",
    { role: "sidekick", prompt: "Second task", background: true },
    h.ctx,
  );
  expect(blocked.isError).toBe(true);
  expect(blocked.content[0]?.text).toContain("fresh_session=true");
  expect(h.inputs).toHaveLength(1);
  expect(h.manager.listRuns(PARENT)[0]).toMatchObject({ can_steer: true });

  const fresh = await dispatchTool(
    "spawn_agent",
    { role: "sidekick", prompt: "Fresh task", background: true, fresh_session: true },
    h.ctx,
  );
  expect(fresh.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
  expect(h.inputs[h.inputs.length - 1]!.sessionRef).toBeUndefined();
  expect(h.handles[1]!.startTurns[0]!.config.contextSize).toBeUndefined();
  const receipt = JSON.parse(fresh.content[0]!.text) as { run_id: string };
  expect(receipt).not.toHaveProperty("continued_from");
  expect(h.manager.listRuns(PARENT)[0]?.continued_by).toBeUndefined();
  expect(h.manager.listRuns(PARENT)[0]?.can_steer).toBe(true);
  answer(h.handles[1]!, "Fresh result");
  await h.manager.waitForSettlement(PARENT, receipt.run_id);
});

it.each([
  { direction: "gains", before: {}, after: { first: ["1m"] } },
  { direction: "loses", before: { first: ["1m"] }, after: {} },
])(
  "does not treat a capability $direction 1m as a crew change when no context is configured",
  async ({ before, after }) => {
    const caps = capabilities({ modelContextSizes: before });
    const h = setup({ role: SINGLE_ROLE, caps });
    const runId = await spawnRole(h);
    await completeFirst(h, runId);
    expect(h.inputs[0]!.config.contextSize).toBeUndefined();

    caps.modelContextSizes = after;
    const steered = await steer(h, runId);
    expect(steered.isError).not.toBe(true);
    await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
    expect(h.inputs[h.inputs.length - 1]!.sessionRef?.providerSessionId).toBe("helper-session");
    expect(h.handles[1]!.startTurns[0]!.config.contextSize).toBeUndefined();
    answer(h.handles[1]!, "Second result");
    const receipt = JSON.parse(steered.content[0]!.text) as { run_id: string };
    await h.manager.waitForSettlement(PARENT, receipt.run_id);
  },
);

it("applies the winning fallback's current effort and Fast, not the primary's", async () => {
  const h = setup({ role: FALLBACK_ROLE, models: ["first", "second"], createFailures: 1 });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);

  h.patchRole({
    selection: { agentKind: "codex", model: "first", effort: "low", fast: true },
    fallbacks: [{ agentKind: "codex", model: "second", effort: "high", fast: true }],
  });
  const steered = await steer(h, runId);
  expect(steered.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
  expect(h.handles[1]!.startTurns[0]!.config).toMatchObject({
    model: "second",
    effort: "high",
    fast: true,
  });
  answer(h.handles[1]!, "Second result");
  const receipt = JSON.parse(steered.content[0]!.text) as { run_id: string };
  await h.manager.waitForSettlement(PARENT, receipt.run_id);
});

it("keeps the winning duplicate option across steer follow-ups and refreshes its effort/Fast", async () => {
  const h = setup({ role: DUPLICATE_ROLE, models: ["first"], createFailures: 1 });
  let runId = await spawnRole(h);
  await completeFirst(h, runId);
  expect(h.inputs[1]!.config).toMatchObject({ model: "first", effort: "low", fast: false });

  for (let turn = 1; turn <= 2; turn += 1) {
    const steered = await steer(h, runId, `Follow-up ${turn}`);
    expect(steered.isError).not.toBe(true);
    await vi.waitFor(() => expect(h.handles[h.handles.length - 1]?.startTurns).toHaveLength(1));
    const lastInput = h.inputs[h.inputs.length - 1]!;
    expect(lastInput.sessionRef?.providerSessionId).toBe("helper-session");
    expect(lastInput.config).toMatchObject({ model: "first", effort: "low", fast: false });
    const receipt = JSON.parse(steered.content[0]!.text) as {
      run_id: string;
      continued_from: string;
    };
    expect(receipt.continued_from).toBe(runId);
    answer(h.handles[h.handles.length - 1]!, `Result ${turn}`);
    await h.manager.waitForSettlement(PARENT, receipt.run_id);
    runId = receipt.run_id;
  }

  h.patchRole({
    selection: { agentKind: "codex", model: "first", effort: "low", fast: false },
    fallbacks: [{ agentKind: "codex", model: "first", effort: "high", fast: true }],
  });
  const refreshed = await steer(h, runId, "Refreshed fallback");
  expect(refreshed.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[h.handles.length - 1]?.startTurns).toHaveLength(1));
  expect(h.inputs[h.inputs.length - 1]!.config).toMatchObject({
    model: "first",
    effort: "high",
    fast: true,
  });
  answer(h.handles[h.handles.length - 1]!, "Refreshed result");
  const refreshedReceipt = JSON.parse(refreshed.content[0]!.text) as { run_id: string };
  await h.manager.waitForSettlement(PARENT, refreshedReceipt.run_id);
});

it("keeps the winning duplicate option across same-role spawn follow-ups", async () => {
  const h = setup({ role: DUPLICATE_ROLE, models: ["first"], createFailures: 1 });
  let runId = await spawnRole(h);
  await completeFirst(h, runId);
  expect(h.inputs[1]!.config).toMatchObject({ model: "first", effort: "low", fast: false });

  for (let turn = 1; turn <= 2; turn += 1) {
    const spawned = await dispatchTool(
      "spawn_agent",
      { role: "sidekick", prompt: `Spawn follow-up ${turn}`, background: true },
      h.ctx,
    );
    expect(spawned.isError).not.toBe(true);
    await vi.waitFor(() => expect(h.handles[h.handles.length - 1]?.startTurns).toHaveLength(1));
    expect(h.inputs[h.inputs.length - 1]!.sessionRef?.providerSessionId).toBe("helper-session");
    expect(h.handles[h.handles.length - 1]!.startTurns[0]!.config).toMatchObject({
      model: "first",
      effort: "low",
      fast: false,
    });
    const receipt = JSON.parse(spawned.content[0]!.text) as {
      run_id: string;
      continued_from: string;
    };
    expect(receipt.continued_from).toBe(runId);
    answer(h.handles[h.handles.length - 1]!, `Spawn result ${turn}`);
    await h.manager.waitForSettlement(PARENT, receipt.run_id);
    runId = receipt.run_id;
  }
});

it("keeps the duplicate's occurrence when an earlier option becomes available", async () => {
  const h = setup({
    role: DUPLICATE_ROLE,
    models: ["first"],
    rosterOptions: { reasoning: ["low"] },
  });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);
  // The primary's high effort was unavailable, so the low/false fallback won.
  expect(h.inputs[0]!.config).toMatchObject({ model: "first", effort: "low", fast: false });

  h.setRosterOptions({ reasoning: ["low", "high"] });
  const steered = await steer(h, runId);
  expect(steered.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
  expect(h.handles[1]!.startTurns[0]!.config).toMatchObject({
    model: "first",
    effort: "low",
    fast: false,
  });
  answer(h.handles[1]!, "Recovered result");
  const receipt = JSON.parse(steered.content[0]!.text) as { run_id: string };
  await h.manager.waitForSettlement(PARENT, receipt.run_id);
});

it("refuses steering when the winning duplicate is removed", async () => {
  const h = setup({ role: DUPLICATE_ROLE, models: ["first"], createFailures: 1 });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);

  h.patchRole({ fallbacks: [] });
  const steered = await steer(h, runId);
  expect(steered.isError).toBe(true);
  const message = steered.content[0]?.text ?? "";
  expect(message).toContain("duplicate/equivalent configured option count");
  expect(message).toContain("(original 2, current 1)");
  expect(message).toContain("automatic remapping/continuation is refused");
  expect(message).not.toContain("changed provider, model or context length");
  expect(h.inputs).toHaveLength(2);
  expect(h.manager.listRuns(PARENT)[0]?.continued_by).toBeUndefined();
});

it("refuses a duplicate count increase even when the winning primary is still present", async () => {
  const h = setup({ role: { ...DUPLICATE_ROLE, fallbacks: [] }, models: ["first"] });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);
  // Primary won; adding a same-identity fallback changes the duplicate count
  // even though the winning occurrence still exists.
  h.patchRole({
    fallbacks: [{ agentKind: "codex", model: "first", effort: "low", fast: false }],
  });
  const steered = await steer(h, runId);
  expect(steered.isError).toBe(true);
  const message = steered.content[0]?.text ?? "";
  expect(message).toContain("duplicate/equivalent configured option count");
  expect(message).toContain("(original 1, current 2)");
  expect(message).toContain("automatic remapping/continuation is refused");
  expect(message).not.toContain("changed provider, model or context length");
  expect(message).not.toContain("ambiguous");
  expect(h.inputs).toHaveLength(1);
  expect(h.manager.listRuns(PARENT)[0]?.continued_by).toBeUndefined();
});

it("refuses a nonwinning duplicate removal without claiming an identity change", async () => {
  const h = setup({ role: DUPLICATE_ROLE, models: ["first"] });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);
  // Primary (ordinal 0) won; removing the duplicate fallback changes the
  // duplicate count but leaves the winning occurrence present.
  h.patchRole({ fallbacks: [] });
  const steered = await steer(h, runId);
  expect(steered.isError).toBe(true);
  const message = steered.content[0]?.text ?? "";
  expect(message).toContain("duplicate/equivalent configured option count");
  expect(message).toContain("(original 2, current 1)");
  expect(message).toContain("automatic remapping/continuation is refused");
  expect(message).not.toContain("changed provider, model or context length");
  expect(message).not.toContain("ambiguous");
  expect(h.inputs).toHaveLength(1);
  expect(h.manager.listRuns(PARENT)[0]?.continued_by).toBeUndefined();
});

it("maps a running fallback through interrupt/restart with an inserted unrelated fallback", async () => {
  const h = setup({
    role: FALLBACK_ROLE,
    models: ["first", "second", "third"],
    createFailures: 1,
  });
  const runId = await spawnRole(h);
  expect(h.manager.listRuns(PARENT)[0]).toMatchObject({ attempt: 2 });
  const handle = h.handles[0]!;
  handle.interruptTurn = async () => {
    handle.interrupted = true;
    handle.completeTurn("interrupted");
  };
  h.patchRole({
    fallbacks: [
      { agentKind: "codex", model: "third", effort: "low" },
      { agentKind: "codex", model: "second", effort: "low" },
    ],
  });

  const steered = await dispatchTool(
    "steer_agent",
    { run_id: runId, prompt: "Correct while running", background: true },
    h.ctx,
  );
  expect(steered.isError).not.toBe(true);
  await vi.waitFor(() => expect(handle.startTurns).toHaveLength(2));
  expect(handle.startTurns[1]!.config).toMatchObject({
    model: "second",
    effort: "low",
  });
  expect(handle.interrupted).toBe(true);
  answer(handle, "Corrected result");
  await h.manager.waitForSettlement(PARENT, runId);

  const continued = await steer(h, runId, "After restart");
  expect(continued.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
  expect(h.inputs[h.inputs.length - 1]!.sessionRef?.providerSessionId).toBe("helper-session");
  expect(h.handles[1]!.startTurns[0]!.config).toMatchObject({
    model: "second",
    effort: "low",
  });
  const receipt = JSON.parse(continued.content[0]!.text) as { run_id: string };
  answer(h.handles[1]!, "Continued result");
  await h.manager.waitForSettlement(PARENT, receipt.run_id);
});

it("rejects a primary identity edit instead of reusing a still-configured fallback", async () => {
  const h = setup({ role: FALLBACK_ROLE, models: ["first", "second"], createFailures: 1 });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);

  h.patchRole({
    selection: { agentKind: "codex", model: "third", effort: "high", contextSize: "1m" },
  });
  const steered = await steer(h, runId);
  expect(steered.isError).toBe(true);
  const message = steered.content[0]?.text ?? "";
  expect(message).toContain("original codex/first");
  expect(message).toContain("current codex/third/1m");
  expect(message).toContain("active worker codex/second");
  expect(message).toContain("self-contained task brief");
  expect(h.inputs).toHaveLength(2);
  expect(h.manager.listRuns(PARENT)[0]?.continued_by).toBeUndefined();
});

it.each([
  { change: "removes", fallbacks: [] },
  {
    change: "replaces",
    fallbacks: [{ agentKind: "codex", model: "second", contextSize: "272k" }],
  },
])("rejects steering when the role $change the winning fallback", async ({ fallbacks }) => {
  const h = setup({ role: FALLBACK_ROLE, models: ["first", "second"], createFailures: 1 });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);

  h.patchRole({ fallbacks });
  const steered = await steer(h, runId);
  expect(steered.isError).toBe(true);
  const message = steered.content[0]?.text ?? "";
  expect(message).toContain("duplicate/equivalent configured option count");
  expect(message).toContain("(original 1, current 0)");
  expect(message).not.toContain("changed provider, model or context length");
  expect(h.inputs).toHaveLength(2);
  expect(h.manager.listRuns(PARENT)[0]?.continued_by).toBeUndefined();
});

it("reuses the winning fallback session from same-role spawn_agent", async () => {
  const h = setup({ role: FALLBACK_ROLE, models: ["first", "second"], createFailures: 1 });
  const runId = await spawnRole(h);
  await completeFirst(h, runId);

  const spawned = await dispatchTool(
    "spawn_agent",
    { role: "sidekick", prompt: "Second task", background: true },
    h.ctx,
  );
  expect(spawned.isError).not.toBe(true);
  await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
  expect(h.inputs[h.inputs.length - 1]!.sessionRef?.providerSessionId).toBe("helper-session");
  expect(h.handles[1]!.startTurns[0]!.config.model).toBe("second");
  const receipt = JSON.parse(spawned.content[0]!.text) as {
    run_id: string;
    continued_from: string;
  };
  expect(receipt.continued_from).toBe(runId);
  answer(h.handles[1]!, "Second result");
  await h.manager.waitForSettlement(PARENT, receipt.run_id);
});

it("rejects an active capability change before interrupting the current turn", async () => {
  const caps = capabilities({ modelContextSizes: { first: ["1m"] } });
  const h = setup({ role: wide(SINGLE_ROLE), caps });
  const runId = await spawnRole(h);
  const handle = h.handles[0]!;
  expect(handle.startTurns).toHaveLength(1);

  caps.modelContextSizes = {};
  const steered = await steer(h, runId);
  expect(steered.isError).toBe(true);
  expect(steered.content[0]?.text).toContain("no longer available");
  expect(handle.interrupted).toBe(false);
  expect(handle.startTurns).toHaveLength(1);
  expect(h.manager.getStatus(runId).status).toBe("running");
  h.manager.cancelAllForThread(PARENT);
  await flush();
});

it("keeps the previous safe comparison for legacy crew metadata", async () => {
  const h = makeHarness({
    resume: { sessionId: "helper-session" },
    statusCapabilities: capabilities(),
  });
  const legacyRole = { id: "sidekick", label: "Sidekick", parallel: 1 };
  const { runId } = h.manager.spawn(PARENT, {
    agent: "codex",
    model: "first",
    effort: "high",
    prompt: "First task",
    crewRole: legacyRole,
  });
  await vi.waitFor(() => expect(h.handles[0]?.startTurns).toHaveLength(1));
  answer(h.handles[0]!, "First result");
  await h.manager.waitForSettlement(PARENT, runId);

  const legacyRequest: SpawnAgentRequest = {
    agent: "codex",
    model: "first",
    effort: "low",
    prompt: "Second task",
    crewRole: legacyRole,
  };
  const next = await h.manager.steer(runId, "Second task", PARENT, true, undefined, legacyRequest);
  await vi.waitFor(() => expect(h.handles[1]?.startTurns).toHaveLength(1));
  expect(h.inputs[h.inputs.length - 1]!.sessionRef?.providerSessionId).toBe("helper-session");
  expect(h.handles[1]!.startTurns[0]!.config.effort).toBe("low");
  answer(h.handles[1]!, "Second result");
  await h.manager.waitForSettlement(PARENT, next.runId);

  await expect(
    h.manager.steer(next.runId, "Third task", PARENT, true, undefined, {
      ...legacyRequest,
      model: "second",
      prompt: "Third task",
    }),
  ).rejects.toThrow("self-contained task brief");
  expect(h.inputs).toHaveLength(2);
});
