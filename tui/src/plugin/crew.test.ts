import { expect, test } from "bun:test";
import type { ThreadCrewBinding } from "@/shared/crew";
import {
  memberDetail,
  registerCrewUi,
  roleName,
  withContextSize,
  withModel,
  withRole,
} from "./crew";

test("role names show how many run at once", () => {
  const selection = { agentKind: "codex", model: "gpt" };
  expect(roleName({ id: "builder", label: "Builder", selection })).toBe("Builder");
  expect(roleName({ id: "builder", label: "Builder", selection, parallel: 2 })).toBe("Builder ×2");
});

test("member details list reasoning, Fast, and read-only", () => {
  expect(memberDetail({ agentKind: "codex", model: "gpt", effort: "high", fast: true }, true)).toBe(
    "high · fast · read-only",
  );
  expect(memberDetail({ agentKind: "codex", model: "gpt" })).toBe("");
});

test("changing a model keeps reasoning and Fast only when the new model supports them", () => {
  const selection = { agentKind: "codex", model: "gpt", effort: "high", fast: true };
  expect(
    withModel(selection, {
      agentKind: "claude",
      providerLabel: "Claude Code",
      model: "opus",
      label: "Opus",
      efforts: ["low", "high"],
      supportsFast: true,
      contextSizes: [
        { id: "200k", label: "200k" },
        { id: "1m", label: "1M" },
      ],
    }),
  ).toEqual({ agentKind: "claude", model: "opus", effort: "high", fast: true });
  expect(
    withModel(selection, {
      agentKind: "claude",
      providerLabel: "Claude Code",
      model: "haiku",
      label: "Haiku",
      efforts: [],
      supportsFast: false,
      contextSizes: [],
    }),
  ).toEqual({ agentKind: "claude", model: "haiku" });
});

test("context length is set, cleared, and shown in the member detail", () => {
  const selection = { agentKind: "claude", model: "opus", effort: "high" };
  const withSize = withContextSize(selection, "1m");
  expect(withSize).toEqual({ ...selection, contextSize: "1m" });
  expect(withContextSize(withSize, "")).toEqual(selection);
  expect(memberDetail(withSize, true)).toBe("high · 1m · read-only");
});

test("role updates replace or remove only the targeted role", () => {
  const binding: ThreadCrewBinding = {
    version: 1,
    policy: "crew-only",
    roles: [
      { id: "builder", label: "Builder", selection: { agentKind: "codex", model: "gpt" } },
      { id: "reviewer", label: "Reviewer", selection: { agentKind: "claude", model: "haiku" } },
    ],
  };
  expect(
    withRole(binding, "reviewer", (role) => ({ ...role, noEdits: true })).roles[1],
  ).toMatchObject({ id: "reviewer", noEdits: true });
  expect(withRole(binding, "builder", () => undefined).roles.map((role) => role.id)).toEqual([
    "reviewer",
  ]);
});

import type { Plugin } from "@opencode/plugin/tui";
import { createPoracodePlugin } from "./index";

type FakeHarness = {
  context: Plugin.Context;
  layers: {
    mode?: string;
    commands: { id: string; palette?: boolean; slash?: { name: string }; run: () => unknown }[];
  }[];
  dispatched: string[];
  toasts: { message: string; variant?: string }[];
  alerts: { title: string; message: string }[];
  modelSets: { providerID: string; modelID: string; variant?: string }[];
  syncs: string[];
  selects: (string | undefined)[];
  prompts: (string | undefined)[];
};

const fakeContext = (route: { type: string; sessionID?: string }, modelSetResult = true) => {
  const layers: FakeHarness["layers"] = [];
  const dispatched: string[] = [];
  const toasts: { message: string; variant?: string }[] = [];
  const alerts: { title: string; message: string }[] = [];
  const modelSets: FakeHarness["modelSets"] = [];
  const syncs: string[] = [];
  const selects: (string | undefined)[] = [];
  const prompts: (string | undefined)[] = [];
  const collection = (name: string) => ({
    invalidate: () => undefined,
    sync: async () => {
      syncs.push(name);
    },
  });
  const context = {
    ui: {
      slot: () => undefined,
      router: { current: () => route },
      dialog: {
        alert: async (input: { title: string; message: string }) => {
          alerts.push(input);
        },
        select: async () => selects.shift(),
        prompt: async () => prompts.shift(),
      },
      toast: { show: (toast: { message: string; variant?: string }) => toasts.push(toast) },
      model: {
        set: (model: { providerID: string; modelID: string; variant?: string }) => {
          modelSets.push(model);
          return modelSetResult;
        },
      },
    },
    keymap: {
      layer: (factory: () => FakeHarness["layers"][number]) => layers.push(factory()),
      dispatch: (id: string) => dispatched.push(id),
    },
    data: {
      session: { list: () => [] },
      location: { model: collection("model"), provider: collection("provider") },
    },
  } as unknown as Plugin.Context;
  return { context, layers, dispatched, toasts, alerts, modelSets, syncs, selects, prompts };
};

const fakeAdapter = (overrides: Record<string, unknown> = {}) =>
  ({
    subscribeCrew: () => () => undefined,
    subscribeGoal: () => () => undefined,
    crewState: async () => ({}),
    updateCrew: async () => ({ ok: true }),
    startNewCrew: async () => ({ ok: true }),
    setCrewLead: async () => ({ ok: true }),
    saveCrew: async () => ({ ok: true, crewId: "crew-new" }),
    crewLine: () => undefined,
    crewSidebar: () => undefined,
    goalLine: () => undefined,
    ...overrides,
  }) as never;

const crewCommand = (harness: FakeHarness) =>
  harness.layers
    .flatMap((layer) => layer.commands)
    .find((command) => command.id === "poracode.crew");

test("every Poracode keymap layer registers global commands", () => {
  const harness = fakeContext({ type: "home" });
  createPoracodePlugin({ adapter: fakeAdapter() }).setup(harness.context);
  expect(harness.layers.length).toBeGreaterThan(0);
  for (const layer of harness.layers) expect(layer.mode).toBe("global");
  const crew = crewCommand(harness)!;
  expect(crew.palette).toBe(true);
  expect(crew.slash).toEqual({ name: "crew" });
});

test("/crew on the home route opens the model list with a hint", async () => {
  const harness = fakeContext({ type: "home" });
  registerCrewUi(harness.context, fakeAdapter());
  await crewCommand(harness)!.run();
  expect(harness.dispatched).toEqual(["model.list"]);
  expect(harness.toasts).toEqual([
    { message: "Pick a crew under Poracode, then send your first message.", variant: "info" },
  ]);
});

test("a new crew selects the Poracode New crew model", async () => {
  const harness = fakeContext({ type: "session", sessionID: "ses_1" });
  const binding = {
    version: 1,
    policy: "crew-only",
    roles: [{ id: "builder", label: "Builder", selection: { agentKind: "codex", model: "m1" } }],
  };
  const states = [
    {
      binding: undefined,
      lead: { agentKind: "codex", model: "m1" },
      saved: [],
      leadChoices: [],
      helperChoices: [],
    },
    {
      binding,
      lead: { agentKind: "codex", model: "m1" },
      saved: [],
      leadChoices: [],
      helperChoices: [],
    },
  ];
  harness.selects.push("new", undefined);
  registerCrewUi(harness.context, fakeAdapter({ crewState: async () => states.shift() }));
  await crewCommand(harness)!.run();
  expect(harness.modelSets).toEqual([{ providerID: "poracode", modelID: "new-crew" }]);
});

test("removing the crew selects the lead model with its variant", async () => {
  const harness = fakeContext({ type: "session", sessionID: "ses_1" });
  const state = {
    binding: {
      version: 1,
      policy: "crew-only",
      roles: [{ id: "builder", label: "Builder", selection: { agentKind: "codex", model: "m1" } }],
    },
    lead: { agentKind: "codex", model: "m1", effort: "high" },
    saved: [],
    leadChoices: [],
    helperChoices: [],
  };
  harness.selects.push("remove");
  registerCrewUi(harness.context, fakeAdapter({ crewState: async () => state }));
  await crewCommand(harness)!.run();
  expect(harness.modelSets).toEqual([{ providerID: "codex", modelID: "m1", variant: "high" }]);
});

test("saving as a new crew syncs the catalog and selects the saved id", async () => {
  const harness = fakeContext({ type: "session", sessionID: "ses_1" });
  const state = {
    binding: {
      version: 1,
      policy: "crew-only",
      roles: [{ id: "builder", label: "Builder", selection: { agentKind: "codex", model: "m1" } }],
    },
    lead: { agentKind: "codex", model: "m1" },
    saved: [],
    leadChoices: [],
    helperChoices: [],
  };
  harness.selects.push("save-new", undefined);
  harness.prompts.push("My crew");
  registerCrewUi(harness.context, fakeAdapter({ crewState: async () => state }));
  await crewCommand(harness)!.run();
  expect(harness.syncs).toEqual(["model", "provider"]);
  expect(harness.modelSets).toEqual([{ providerID: "poracode", modelID: "crew-new" }]);
});
