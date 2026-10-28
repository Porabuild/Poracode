import { expect, test } from "bun:test";
import type { SavedCrew, ThreadCrewBinding } from "@/shared/crew";
import {
  NEW_CREW_MODEL_ID,
  defaultHelperSelection,
  resolveCrewPick,
  type CrewModelChoice,
} from "./crews";

const choice = (agentKind: string, model: string): CrewModelChoice => ({
  agentKind,
  providerLabel: agentKind,
  model,
  label: model.toUpperCase(),
  efforts: ["low", "high"],
  supportsFast: false,
});

const leadChoices = [choice("claude", "opus")];
const helperChoices = [choice("claude", "opus"), choice("codex", "gpt")];
const saved: SavedCrew = {
  id: "crew-ship",
  name: "Ship crew",
  lead: { agentKind: "claude", model: "opus", effort: "high" },
  roles: [{ id: "builder", label: "Builder", selection: { agentKind: "codex", model: "gpt" } }],
  policy: "crew-only",
};

test("a saved crew pick takes the crew's lead and binding", () => {
  const pick = resolveCrewPick({
    pickedModel: "crew-ship",
    sessionCrew: undefined,
    sessionLead: { agentKind: "codex", model: "gpt" },
    saved: [saved],
    leadChoices,
    helperChoices,
  });
  expect(pick).toMatchObject({
    lead: { agentKind: "claude", model: "opus", effort: "high" },
    binding: { crewId: "crew-ship", name: "Ship crew", policy: "crew-only" },
  });
});

test("the same crew pick keeps the session's edited crew and lead", () => {
  const edited: ThreadCrewBinding = {
    version: 1,
    crewId: "crew-ship",
    name: "Ship crew",
    policy: "crew-first",
    roles: [{ id: "builder", label: "Builder", selection: { agentKind: "claude", model: "opus" } }],
  };
  const lead = { agentKind: "claude", model: "opus", effort: "low" };
  expect(
    resolveCrewPick({
      pickedModel: "crew-ship",
      sessionCrew: edited,
      sessionLead: lead,
      saved: [saved],
      leadChoices,
      helperChoices,
    }),
  ).toEqual({ binding: edited, lead });
});

test("a new crew needs a lead-capable model and adds a Builder on another provider", () => {
  expect(
    resolveCrewPick({
      pickedModel: NEW_CREW_MODEL_ID,
      sessionCrew: undefined,
      sessionLead: { agentKind: "codex", model: "gpt" },
      saved: [],
      leadChoices,
      helperChoices,
    }),
  ).toEqual({ error: "Pick a model that can lead a crew first, then choose New crew." });
  expect(
    resolveCrewPick({
      pickedModel: NEW_CREW_MODEL_ID,
      sessionCrew: undefined,
      sessionLead: { agentKind: "claude", model: "opus" },
      saved: [],
      leadChoices,
      helperChoices,
    }),
  ).toMatchObject({
    lead: { agentKind: "claude", model: "opus" },
    binding: {
      policy: "crew-only",
      roles: [{ id: "builder", label: "Builder", selection: { agentKind: "codex", model: "gpt" } }],
    },
  });
});

test("a missing saved crew is an error, not a guess", () => {
  expect(
    resolveCrewPick({
      pickedModel: "crew-gone",
      sessionCrew: undefined,
      sessionLead: { agentKind: "claude", model: "opus" },
      saved: [saved],
      leadChoices,
      helperChoices,
    }),
  ).toEqual({ error: "That crew is no longer available." });
});

test("new-crew keeps a session crew that has a crewId", () => {
  const sessionCrew: ThreadCrewBinding = {
    version: 1,
    crewId: "crew-ship",
    name: "Ship crew",
    policy: "crew-first",
    roles: [{ id: "builder", label: "Builder", selection: { agentKind: "codex", model: "gpt" } }],
  };
  const lead = { agentKind: "claude", model: "opus" };
  expect(
    resolveCrewPick({
      pickedModel: NEW_CREW_MODEL_ID,
      sessionCrew,
      sessionLead: lead,
      saved: [saved],
      leadChoices,
      helperChoices,
    }),
  ).toEqual({ binding: sessionCrew, lead });
});

test("the default helper prefers another provider than the lead", () => {
  expect(defaultHelperSelection(helperChoices, "claude")).toEqual({
    agentKind: "codex",
    model: "gpt",
  });
  expect(defaultHelperSelection([choice("claude", "opus")], "claude")).toEqual({
    agentKind: "claude",
    model: "opus",
  });
});
