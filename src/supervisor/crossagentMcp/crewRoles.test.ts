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
          "Spawn work with role=<id>; the role sets provider, model, reasoning and Fast. Crew only: spawns without a role are refused.",
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
    ]) {
      expect(() => resolveCrewRoleSpawn({ role: "builder", ...selection }, crew, roster)).toThrow(
        "role=builder sets provider, model, reasoning and Fast; omit them.",
      );
    }
    expect(
      resolveCrewRoleSpawn(
        { role: "builder", provider: "codex", model: "gpt-5.5", reasoning: "high", fast: false },
        crew,
        roster,
      ),
    ).toBeDefined();
    expect(() => resolveCrewRoleSpawn({ role: "builder", fallbacks: [] }, crew, roster)).toThrow(
      "role=builder uses the role's own fallbacks; omit fallbacks.",
    );
  });

  it("requires a role in crew-only mode and leaves crew-first unroled calls available", () => {
    expect(() => resolveCrewRoleSpawn({}, crew, roster)).toThrow(
      "This thread's crew is Crew only: spawn with role=<id> (builder).",
    );
    expect(resolveCrewRoleSpawn({}, { ...crew, policy: "crew-first" }, roster)).toBeUndefined();
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
});
