import { describe, expect, it } from "vitest";
import type { ThreadCrewBinding } from "@/shared/crew";
import type { SpawnableAgent } from "./types";
import { crewListDescription, resolveCrewRoleSpawn } from "./crewRoles";

function agent(provider: string, model: string, reasoning = ["high"]): SpawnableAgent {
  return {
    provider: { value: provider, label: provider },
    models: [
      {
        value: model,
        label: model,
        reasoning: { values: reasoning },
        fast: { available: true },
      },
    ],
    reasoningOptions: reasoning.map((value) => ({ value, label: value })),
    defaultModel: model,
    permissions: {
      options: [{ value: "full-access", label: "Full access" }],
      default: "full-access",
    },
    execution: "structured",
  };
}

const roster = [agent("codex", "gpt-5.5"), agent("claude", "sonnet-5")];

const crew: ThreadCrewBinding = {
  version: 1,
  name: "Ship crew",
  policy: "crew-only",
  roles: [
    {
      id: "builder",
      label: "Builder",
      brief: "Implements changes",
      noEdits: true,
      selection: { agentKind: "codex", model: "gpt-5.5", effort: "high" },
      fallbacks: [{ agentKind: "claude", model: "sonnet-5", effort: "high" }],
      parallel: 2,
    },
  ],
};

describe("crew role descriptions", () => {
  it("describes availability and running counts with the crew-only instructions", () => {
    expect(
      crewListDescription(crew, roster, [
        { role: "builder", status: "running" },
        { role: "builder", status: "completed" },
      ]),
    ).toEqual({
      crew: {
        name: "Ship crew",
        policy: "crew-only",
        instructions:
          "Spawn work with role=<id>; the role sets provider, model, reasoning and Fast. Crew only: use roles for automatic delegation. When the user explicitly requests other agents or models, omit role and pass user_requested=true with the requested selection; no crew change or additional confirmation is needed.",
        roles: [
          {
            role: "builder",
            label: "Builder",
            brief: "Implements changes",
            provider: "codex",
            model: "gpt-5.5",
            reasoning: "high",
            fast: false,
            parallel: 2,
            running: 1,
            available: true,
            no_edits: true,
          },
        ],
      },
    });
  });

  it("omits an unsaved crew name and builds crew-first instructions", () => {
    const first: ThreadCrewBinding = {
      version: 1,
      policy: "crew-first",
      roles: crew.roles,
    };
    const result = crewListDescription(first, roster, []);
    expect(result).not.toHaveProperty("crew.name");
    expect((result.crew as Record<string, unknown>).instructions).toContain("Crew first:");
  });
});

describe("crew role resolution", () => {
  it("refuses role without crew, unknown roles, mismatched selections and caller fallbacks", () => {
    expect(() => resolveCrewRoleSpawn({ role: "builder" }, undefined, roster)).toThrow(
      "This thread has no crew; omit role.",
    );
    expect(() => resolveCrewRoleSpawn({ role: "missing" }, crew, roster)).toThrow(
      "Unknown crew role: missing. Roles: builder.",
    );
    for (const selection of [
      { provider: "claude" },
      { model: "different" },
      { reasoning: "low" },
      { fast: true },
      { context_size: "1m" },
    ]) {
      expect(() => resolveCrewRoleSpawn({ role: "builder", ...selection }, crew, roster)).toThrow(
        "role=builder sets provider, model, reasoning, Fast and context length; omit them.",
      );
    }
    expect(
      resolveCrewRoleSpawn(
        { role: "builder", provider: "codex", model: "gpt-5.5", reasoning: "high", fast: false },
        crew,
        roster,
      ),
    ).toBeDefined();
    const wideCrew: ThreadCrewBinding = {
      ...crew,
      roles: [
        {
          ...crew.roles[0]!,
          selection: { agentKind: "codex", model: "gpt-5.5", effort: "high", contextSize: "1m" },
        },
      ],
    };
    expect(
      resolveCrewRoleSpawn({ role: "builder", context_size: "1m" }, wideCrew, roster),
    ).toBeDefined();
    expect(() =>
      resolveCrewRoleSpawn({ role: "builder", context_size: "272k" }, wideCrew, roster),
    ).toThrow("context length");
    expect(() => resolveCrewRoleSpawn({ role: "builder", fallbacks: [] }, crew, roster)).toThrow(
      "role=builder uses the role's own fallbacks; omit fallbacks.",
    );
  });

  it("requires a role in crew-only mode and leaves crew-first unroled calls available", () => {
    expect(() => resolveCrewRoleSpawn({}, crew, roster)).toThrow(
      "This thread's crew is Crew only: spawn with role=<id> (builder) for automatic delegation. If the user explicitly requested other agents or models, omit role and pass user_requested=true with their requested selection.",
    );
    expect(resolveCrewRoleSpawn({}, { ...crew, policy: "crew-first" }, roster)).toBeUndefined();
  });

  it("honors explicit user requests on existing v1 crews without changing role routing", () => {
    expect(crew.version).toBe(1);
    expect(
      resolveCrewRoleSpawn(
        { user_requested: true, provider: "claude", model: "sonnet-5" },
        crew,
        roster,
      ),
    ).toBeUndefined();
    for (const user_requested of [undefined, false, "true", 1]) {
      expect(() =>
        resolveCrewRoleSpawn({ user_requested, provider: "claude" }, crew, roster),
      ).toThrow("for automatic delegation");
    }
    expect(() =>
      resolveCrewRoleSpawn(
        { user_requested: true, role: "builder", model: "sonnet-5" },
        crew,
        roster,
      ),
    ).toThrow("role=builder sets provider");
    expect(() =>
      resolveCrewRoleSpawn({ user_requested: true, role: "missing" }, crew, roster),
    ).toThrow("Unknown crew role");
  });

  it("promotes the first available fallback and retains the rest in order", () => {
    const fallbackCrew: ThreadCrewBinding = {
      ...crew,
      roles: [
        {
          ...crew.roles[0]!,
          selection: { agentKind: "missing", model: "missing-model" },
          fallbacks: [
            { agentKind: "claude", model: "sonnet-5", effort: "high" },
            { agentKind: "codex", model: "gpt-5.5", effort: "high" },
          ],
        },
      ],
    };
    const resolved = resolveCrewRoleSpawn(
      { role: "builder", prompt: "Implement" },
      fallbackCrew,
      roster,
    );
    expect(resolved).toMatchObject({
      args: {
        provider: "claude",
        model: "sonnet-5",
        reasoning: "high",
        fallbacks: [{ provider: "codex", model: "gpt-5.5", reasoning: "high" }],
      },
      crewRole: {
        id: "builder",
        label: "Builder",
        parallel: 2,
      },
    });
  });

  it("reports unavailable roles and offers unroled fallback only for crew-first", () => {
    const unavailable: ThreadCrewBinding = {
      ...crew,
      roles: [
        { ...crew.roles[0]!, selection: { agentKind: "missing", model: "missing" }, fallbacks: [] },
      ],
    };
    expect(() => resolveCrewRoleSpawn({ role: "builder" }, unavailable, roster)).toThrow(
      "Role Builder has no available agent right now (missing/missing and its fallbacks are unavailable).",
    );
    expect(() =>
      resolveCrewRoleSpawn({ role: "builder" }, { ...unavailable, policy: "crew-first" }, roster),
    ).toThrow(
      "Role Builder has no available agent right now (missing/missing and its fallbacks are unavailable). Crew first: you may spawn without a role.",
    );
  });

  it("requires the configured effort and Fast choice to resolve on the model", () => {
    const effortCrew: ThreadCrewBinding = {
      ...crew,
      roles: [
        {
          ...crew.roles[0]!,
          selection: { agentKind: "codex", model: "gpt-5.5", effort: "low" },
          fallbacks: [],
        },
      ],
    };
    expect(
      crewListDescription(effortCrew, [agent("codex", "gpt-5.5", ["high"])], []),
    ).toMatchObject({
      crew: { roles: [{ available: false }] },
    });
    expect(() =>
      resolveCrewRoleSpawn({ role: "builder" }, effortCrew, [agent("codex", "gpt-5.5", ["high"])]),
    ).toThrow("Role Builder has no available agent right now");

    const fastCrew: ThreadCrewBinding = {
      ...crew,
      roles: [
        {
          ...crew.roles[0]!,
          selection: { agentKind: "codex", model: "gpt-5.5", fast: true },
          fallbacks: [],
        },
      ],
    };
    const noFast = {
      ...agent("codex", "gpt-5.5"),
      models: [
        {
          ...agent("codex", "gpt-5.5").models[0]!,
          fast: { available: false },
        },
      ],
    };
    expect(crewListDescription(fastCrew, [noFast], [])).toMatchObject({
      crew: { roles: [{ available: false }] },
    });
  });

  it("explains missing provider/model, unsupported reasoning and unavailable Fast", () => {
    const roleWith = (
      selection: ThreadCrewBinding["roles"][number]["selection"],
      fallbacks: ThreadCrewBinding["roles"][number]["fallbacks"] = [],
    ): ThreadCrewBinding => ({
      ...crew,
      roles: [{ ...crew.roles[0]!, selection, fallbacks }],
    });

    expect(() =>
      resolveCrewRoleSpawn(
        { role: "builder" },
        roleWith({ agentKind: "missing", model: "missing-model" }),
        roster,
      ),
    ).toThrow("missing/missing-model: provider unavailable");
    expect(() =>
      resolveCrewRoleSpawn(
        { role: "builder" },
        roleWith({ agentKind: "codex", model: "missing-model" }),
        roster,
      ),
    ).toThrow("codex/missing-model: model unavailable");

    const invalidReasoning = roleWith({
      agentKind: "codex",
      model: "gpt-5.5",
      effort: "max",
    });
    expect(() =>
      resolveCrewRoleSpawn({ role: "builder" }, invalidReasoning, [
        agent("codex", "gpt-5.5", ["low", "high"]),
      ]),
    ).toThrow('reasoning "max" is not supported (supported: low, high)');

    const noReasoning = roleWith({ agentKind: "codex", model: "gpt-5.5", effort: "high" });
    expect(() =>
      resolveCrewRoleSpawn({ role: "builder" }, noReasoning, [agent("codex", "gpt-5.5", [])]),
    ).toThrow('reasoning "high" is not supported (no reasoning controls)');

    const fastRole = roleWith({ agentKind: "codex", model: "gpt-5.5", fast: true });
    const noFast = {
      ...agent("codex", "gpt-5.5"),
      models: [{ ...agent("codex", "gpt-5.5").models[0]!, fast: { available: false } }],
    };
    expect(() => resolveCrewRoleSpawn({ role: "builder" }, fastRole, [noFast])).toThrow(
      "codex/gpt-5.5: Fast unavailable",
    );
  });

  it("selects a valid fallback while reporting the invalid primary", () => {
    const invalidPrimary: ThreadCrewBinding = {
      ...crew,
      roles: [
        {
          ...crew.roles[0]!,
          selection: { agentKind: "codex", model: "gpt-5.5", effort: "max" },
          fallbacks: [{ agentKind: "claude", model: "sonnet-5", effort: "high" }],
        },
      ],
    };
    const resolved = resolveCrewRoleSpawn({ role: "builder" }, invalidPrimary, [
      agent("codex", "gpt-5.5", ["low", "high"]),
      agent("claude", "sonnet-5"),
    ]);
    expect(resolved?.args).toMatchObject({ provider: "claude", model: "sonnet-5" });
    expect(resolved?.crewRole.optionIndices).toEqual([1]);
  });

  it("captures an immutable configured option snapshot before availability filtering", () => {
    const mutable = structuredClone(crew);
    const resolved = resolveCrewRoleSpawn(
      { role: "builder", prompt: "Implement" },
      mutable,
      roster,
    );
    expect(resolved?.crewRole).toMatchObject({
      selection: { provider: "codex", model: "gpt-5.5", effort: "high" },
      fallbacks: [{ provider: "claude", model: "sonnet-5", effort: "high" }],
      optionIndices: [0, 1],
    });

    mutable.roles[0]!.selection.model = "changed";
    mutable.roles[0]!.fallbacks![0]!.effort = "low";
    mutable.roles[0]!.fallbacks!.push({ agentKind: "codex", model: "gpt-5.5", effort: "low" });

    expect(resolved?.crewRole).toMatchObject({
      selection: { provider: "codex", model: "gpt-5.5", effort: "high" },
      fallbacks: [{ provider: "claude", model: "sonnet-5", effort: "high" }],
      optionIndices: [0, 1],
    });
    expect(resolved?.crewRole.fallbacks).toHaveLength(1);
  });
});
