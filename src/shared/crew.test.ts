import { describe, expect, it } from "vitest";
import {
  CREW_BINDING_VERSION,
  canLeadCrew,
  crewBindingFromSavedCrew,
  crewFingerprint,
  crewRoleMatches,
  hasUnsupportedCrewBinding,
  isThreadConfigCrewEqual,
  nextCrewRoleId,
  normalizeCrewRoles,
  savedCrewSchema,
  threadCrewBinding,
  threadCrewBindingSchema,
  threadConfigCrewSchema,
} from "./crew";
import type { CrewRole, SavedCrew } from "./crew";

const builder: CrewRole = {
  id: "builder",
  label: " Builder ",
  brief: "  Implements   changes\nand runs tests ",
  selection: { agentKind: "codex", model: "gpt-5.5" },
};

const binding = {
  version: CREW_BINDING_VERSION,
  name: "Ship crew",
  policy: "crew-only" as const,
  roles: [builder],
};

describe("crew schemas", () => {
  it("uses closed v1 bindings and accepts loose future bindings for preservation", () => {
    expect(threadCrewBindingSchema.safeParse(binding).success).toBe(true);
    expect(threadCrewBindingSchema.safeParse({ ...binding, unknown: true }).success).toBe(false);
    const future = { version: 2, futureField: { retained: true } };
    expect(threadConfigCrewSchema.parse(future)).toEqual(future);
    expect(threadConfigCrewSchema.parse(null)).toBeNull();
  });
});

describe("crew helpers", () => {
  it("normalizes labels, briefs, duplicate ids and labels", () => {
    const roleWithoutBrief = {
      id: builder.id,
      label: builder.label,
      selection: builder.selection,
    };
    expect(
      normalizeCrewRoles([
        builder,
        { ...builder, id: "builder-two", label: "builder" },
        { ...builder, id: "reviewer", label: "Reviewer", brief: " \n " },
      ]),
    ).toEqual([
      {
        ...builder,
        label: "Builder",
        brief: "Implements changes and runs tests",
      },
      {
        ...roleWithoutBrief,
        id: "reviewer",
        label: "Reviewer",
      },
    ]);
  });

  it("returns supported normalized bindings and ignores absent or future bindings", () => {
    expect(threadCrewBinding({ crew: binding })).toEqual({
      ...binding,
      roles: [{ ...builder, label: "Builder", brief: "Implements changes and runs tests" }],
    });
    expect(threadCrewBinding(undefined)).toBeUndefined();
    expect(threadCrewBinding({ crew: null })).toBeUndefined();
    expect(threadCrewBinding({ crew: { version: 2, futureField: "preserve" } })).toBeUndefined();
    expect(hasUnsupportedCrewBinding({ crew: { version: 2 } })).toBe(true);
    expect(hasUnsupportedCrewBinding({ crew: binding })).toBe(false);
  });

  it("converts a saved crew without carrying saved-role unknown fields", () => {
    const parsed = savedCrewSchema.parse({
      id: "ship",
      name: "Ship crew",
      lead: { agentKind: "claude", model: "opus-5.5" },
      policy: "crew-only",
      roles: [{ ...builder, savedOnly: true }],
    });
    const saved = {
      ...parsed,
      roles: parsed.roles.map((role) => ({ ...role, savedOnly: true })),
    } as SavedCrew;
    expect(crewBindingFromSavedCrew(saved)).toEqual({
      version: 1,
      crewId: "ship",
      name: "Ship crew",
      policy: "crew-only",
      roles: [{ ...builder, label: "Builder", brief: "Implements changes and runs tests" }],
    });
  });

  it("fingerprints name, policy and roles canonically but not binding identity", () => {
    const left = { ...binding, crewId: "one" };
    const right = {
      roles: [{ ...builder, brief: "Implements   changes\nand runs tests", label: " Builder " }],
      policy: "crew-only" as const,
      name: "Ship crew",
      version: 1 as const,
      crewId: "two",
    };
    expect(crewFingerprint(threadCrewBinding({ crew: left }))).toBe(
      crewFingerprint(threadCrewBinding({ crew: right })),
    );
    expect(crewFingerprint()).toBe("");
  });

  it("compares null and absent as equal and compares binding structure", () => {
    expect(isThreadConfigCrewEqual(null, undefined)).toBe(true);
    expect(isThreadConfigCrewEqual(binding, { ...binding, crewId: "different" })).toBe(false);
    expect(isThreadConfigCrewEqual(binding, { ...binding, roles: [builder] })).toBe(true);
  });

  it("creates stable unique ids and matches role id or label", () => {
    expect(nextCrewRoleId([], "Code Reviewer")).toBe("code-reviewer");
    expect(nextCrewRoleId(["code-reviewer"], "Code Reviewer")).toBe("code-reviewer-2");
    expect(nextCrewRoleId(["role"], "!!!")).toBe("role-2");
    expect(crewRoleMatches(builder, " BUILDER ")).toBe(true);
    expect(crewRoleMatches(builder, "builder")).toBe(true);
    expect(crewRoleMatches(builder, "reviewer")).toBe(false);
  });

  it("allows crews wherever the presentation has a reachable Crossagents path", () => {
    expect(canLeadCrew({ mcpScope: { gui: "always" } }, "gui")).toBe(true);
    expect(canLeadCrew({ mcpScope: { gui: "none" } }, "gui")).toBe(false);
    expect(canLeadCrew({ mcpConfigSource: "agentSettings" }, "gui")).toBe(false);
    expect(
      canLeadCrew(
        { mcpConfigSource: "agentSettings", crossagentMcpRouting: "provider-session" },
        "gui",
      ),
    ).toBe(true);
    expect(canLeadCrew({ mcpScope: { gui: "always" } }, "terminal")).toBe(false);
    expect(canLeadCrew({ mcpScope: { terminal: "launch", gui: "always" } }, "terminal")).toBe(true);
    expect(canLeadCrew({ mcpScope: { terminal: "none", gui: "launch" } }, "terminal")).toBe(false);
    expect(
      canLeadCrew(
        {
          mcpConfigSource: "agentSettings",
          crossagentMcpRouting: "provider-session",
          mcpScope: { terminal: "none", gui: "none" },
        },
        "terminal",
      ),
    ).toBe(false);
  });
});

describe("crew member context length", () => {
  it("keeps a member's context length on saved crews and bindings", () => {
    const parsed = threadCrewBindingSchema.parse({
      version: CREW_BINDING_VERSION,
      policy: "crew-only",
      roles: [
        {
          id: "builder",
          label: "Builder",
          selection: { agentKind: "claude", model: "opus", contextSize: "1m" },
          fallbacks: [{ agentKind: "codex", model: "gpt", contextSize: "272k" }],
        },
      ],
    });
    expect(parsed.roles[0]?.selection.contextSize).toBe("1m");
    expect(parsed.roles[0]?.fallbacks?.[0]?.contextSize).toBe("272k");
  });
});
