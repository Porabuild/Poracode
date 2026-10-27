import { describe, expect, it } from "vitest";
import type { SavedCrew, ThreadCrewBinding } from "@/shared/crew";
import {
  addRole,
  crewMenuMeta,
  crewPickerEntry,
  crewSummary,
  draftCrewFromConfig,
  isCrewEdited,
  isCrewNameValid,
  isLeadEdited,
  isRoleEdited,
  leadSelectionOf,
  newCrewBinding,
  removeRole,
  resetBinding,
  saveAsNewCrew,
  saveToCrew,
  savedCrewFor,
  setPolicy,
  updateRole,
} from "./crewComposerModel";
import type { CrewRoleTemplate } from "./crewRoleTemplates";

const templates: CrewRoleTemplate[] = [
  { id: "builder", label: "Builder", brief: "Build", tone: "builder" },
  { id: "reviewer", label: "Reviewer", brief: "Review", tone: "reviewer" },
  { id: "scout", label: "Scout", brief: "Explore", noEdits: true, tone: "scout" },
  { id: "helper", label: "Helper", tone: "custom" },
];
const helper = { agentKind: "codex", model: "gpt-5.5", effort: "high" };
const binding: ThreadCrewBinding = {
  version: 1,
  name: "Ship crew",
  policy: "crew-only",
  roles: [
    {
      id: "builder",
      label: "Builder",
      brief: "Build",
      selection: helper,
    },
  ],
};
const saved: SavedCrew = {
  id: "ship",
  name: "Ship crew",
  lead: { agentKind: "claude", model: "opus-5.5", effort: "high" },
  roles: binding.roles,
  policy: "crew-only",
  updatedAt: 1,
};
const labelOf = (selection: { model: string }) => selection.model;

describe("crewComposerModel", () => {
  it("derives a lead selection and finds a saved crew by id", () => {
    expect(leadSelectionOf("claude", { model: "opus-5.5", effort: "", fast: false })).toEqual({
      agentKind: "claude",
      model: "opus-5.5",
      effort: "",
      fast: false,
    });
    expect(savedCrewFor({ ...binding, crewId: "ship" }, [saved])).toBe(saved);
  });

  it("refreshes a saved draft binding, retains an unsaved/deleted binding, and drops unsupported crews", () => {
    const persisted = { ...binding, crewId: "ship" };
    expect(draftCrewFromConfig(persisted, [saved])).toMatchObject({
      crewId: "ship",
      roles: saved.roles,
    });
    expect(draftCrewFromConfig({ ...binding, crewId: "deleted" }, [saved])).toMatchObject(binding);
    expect(draftCrewFromConfig({ version: 99 }, [saved])).toBeUndefined();
    expect(draftCrewFromConfig(null, [saved])).toBeUndefined();
  });

  it("marks saved members and policy edits without marking an unsaved crew", () => {
    expect(isRoleEdited(binding.roles[0]!, saved)).toBe(false);
    expect(isLeadEdited(saved.lead, saved)).toBe(false);
    expect(isCrewEdited({ ...binding, crewId: "ship" }, saved.lead, saved)).toBe(false);
    expect(isRoleEdited({ ...binding.roles[0]!, label: "Changed" }, saved)).toBe(true);
    expect(isLeadEdited({ ...saved.lead, effort: undefined }, saved)).toBe(true);
    expect(isCrewEdited({ ...binding, policy: "crew-first" }, saved.lead, saved)).toBe(true);
    expect(isCrewEdited(binding, saved.lead, undefined)).toBe(false);
  });

  it("creates, adds, edits and removes role bindings within limits", () => {
    const fresh = newCrewBinding(helper, templates[0]!);
    expect(fresh).toMatchObject({ policy: "crew-only", roles: [{ id: "builder" }] });
    const reviewer = addRole(fresh, templates, helper);
    expect(reviewer.roleId).toBe("reviewer");
    const scout = addRole(reviewer.binding, templates, helper);
    expect(scout.roleId).toBe("scout");
    const helperRole = addRole(scout.binding, templates, helper);
    expect(helperRole.roleId).toBe("helper");
    expect(addRole(helperRole.binding, templates, helper).roleId).toBe("helper-2");
    const updated = updateRole(scout.binding, "reviewer", { parallel: 2 });
    expect(updated.roles.find((role) => role.id === "reviewer")?.parallel).toBe(2);
    expect(removeRole(fresh, "builder")).toBe(fresh);
    expect(removeRole(updated, "builder").roles).toHaveLength(2);
  });

  it("resets and saves existing or new crews with trimmed names", () => {
    expect(resetBinding(saved)).toMatchObject({ crewId: "ship", name: "Ship crew" });
    expect(saveToCrew(saved, setPolicy(binding, "crew-first"), saved.lead, 2)).toMatchObject({
      id: "ship",
      policy: "crew-first",
      updatedAt: 2,
    });
    expect(
      saveAsNewCrew("  Night shift ", binding, saved.lead, { id: "crew-0123456789" }),
    ).toMatchObject({
      id: "crew-0123456789",
      name: "Night shift",
    });
    expect(saveAsNewCrew("Crew", binding, saved.lead).id).toMatch(/^crew-[0-9a-f]{10}$/u);
    expect(isCrewNameValid("  Night shift ")).toBe(true);
    expect(isCrewNameValid(" ")).toBe(false);
    expect(isCrewNameValid("a".repeat(41))).toBe(false);
  });

  it("summarizes a single helper model or the role count", () => {
    expect(crewSummary("Opus 5.5", binding.roles, labelOf)).toBe("Opus 5.5 + gpt-5.5");
    expect(
      crewMenuMeta(
        { ...saved, roles: [...saved.roles, { ...saved.roles[0]!, id: "reviewer" }] },
        labelOf,
      ),
    ).toBe("opus-5.5 + 2");
  });
});

describe("crewPickerEntry", () => {
  it("keeps the lead icon separate, lists helper providers once, and details every member", () => {
    const entry = crewPickerEntry(
      {
        ...saved,
        roles: [
          {
            ...saved.roles[0]!,
            parallel: 2,
            fallbacks: [{ agentKind: "gemini", model: "gemini-3-pro" }],
          },
          { ...saved.roles[0]!, id: "reviewer", label: "Reviewer" },
          {
            ...saved.roles[0]!,
            id: "scout",
            label: "Scout",
            noEdits: true,
            selection: { agentKind: "claude", model: "opus-5.5" },
          },
        ],
      },
      labelOf,
      { lead: "Lead", readOnly: "Read-only" },
    );
    expect(entry).toEqual({
      crewId: "ship",
      name: "Ship crew",
      leadLabel: "opus-5.5",
      leadKind: "claude",
      helperKinds: ["codex", "claude"],
      details: [
        "Lead: opus-5.5 · High",
        "Builder ×2: gpt-5.5 · High",
        "Reviewer: gpt-5.5 · High",
        "Scout: opus-5.5 · Read-only",
      ].join("\n"),
    });
  });
});
