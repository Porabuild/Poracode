import { registerPrimaryModelChoices } from "@/renderer/components/providers/modelPickerLayout";
import { afterEach, describe, expect, it } from "vitest";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import type { ProviderModelMenuProvider } from "../ProviderModelMenu";
import { registerModelDescriptionFormatter } from "@/renderer/components/providers/modelDescription";
import type { ProviderModelItem } from "./types";
import { buildProviderModelItems } from "./buildItems";

interface TestModel {
  id: string;
  label: string;
  description?: string;
}

function makeProvider(
  kind: string,
  label: string,
  models: ReadonlyArray<TestModel>,
  subProviders?: ReadonlyArray<{ id: string; label: string }>,
): ProviderModelMenuProvider {
  return {
    kind,
    label,
    capabilities: {
      models: [...models],
      ...(subProviders ? { subProviders: [...subProviders] } : {}),
      efforts: [],
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      settingDefs: [],
    },
  };
}

function makeCapability(
  models: ReadonlyArray<TestModel>,
  extra: Partial<ProviderModelMenuProvider["capabilities"]> = {},
): ProviderModelMenuProvider["capabilities"] {
  return {
    models: [...models],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    settingDefs: [],
    ...extra,
  };
}

describe("buildProviderModelItems", () => {
  it("keeps meaningful groups and exact choices without repeating singleton model names", () => {
    const provider = makeProvider("agent", "Agent", [
      { id: "adaptive", label: "Adaptive" },
      { id: "pair-a", label: "Pair A" },
      { id: "pair-b", label: "Pair B" },
      { id: "solo", label: "Solo model" },
    ]);
    provider.capabilities.subProviders = [
      { id: "adaptive-group", label: " Adaptive " },
      { id: "pairs", label: "Pairs" },
      { id: "family", label: "Family" },
    ];
    provider.capabilities.modelSubProvider = {
      adaptive: "adaptive-group",
      "pair-a": "pairs",
      "pair-b": "pairs",
      solo: "family",
    };
    const items = buildProviderModelItems({ providers: [provider], search: "" });
    expect(items.filter((item) => item.type === "header-sub").map((item) => item.label)).toEqual([
      "Pairs",
      "Family",
    ]);
    expect(items.filter((item) => item.type === "model").map((item) => item.modelId)).toEqual([
      "adaptive",
      "pair-a",
      "pair-b",
      "solo",
    ]);
    const searched = buildProviderModelItems({ providers: [provider], search: "Adaptive" });
    const rows = searched.filter((item) => item.type === "model");
    expect(rows.map((item) => item.modelId)).toEqual(["adaptive"]);
    expect(rows[0]?.subProviderLabel).toBeUndefined();
  });

  it("does not treat inherited object keys as model group membership", () => {
    const provider = makeProvider("agent", "Agent", [
      { id: "constructor", label: "Constructor model" },
      { id: "__proto__", label: "Proto model" },
    ]);
    provider.capabilities.modelSubProvider = {};
    const items = buildProviderModelItems({ providers: [provider], search: "" });
    expect(items.filter((item) => item.type === "header-sub")).toEqual([]);
    expect(items.filter((item) => item.type === "model").map((item) => item.modelId)).toEqual([
      "constructor",
      "__proto__",
    ]);
  });

  it("retains provider disambiguation when a searched group label repeats the model label", () => {
    const make = (kind: string, label: string) => {
      const provider = makeProvider(kind, label, [{ id: "same", label: "Same" }]);
      provider.capabilities.subProviders = [{ id: "same-group", label: "Same" }];
      provider.capabilities.modelSubProvider = { same: "same-group" };
      return provider;
    };
    const items = buildProviderModelItems({
      providers: [make("a", "Alpha"), make("b", "Beta")],
      search: "same",
    });
    expect(
      items.filter((item) => item.type === "model").map((item) => item.subProviderLabel),
    ).toEqual(["Alpha", "Beta"]);
  });

  it("decorates searched rows with the provider label when several providers offer the same model", () => {
    const shared = [{ id: "go/shared-model", label: "Shared Model" }];
    const items = buildProviderModelItems({
      providers: [
        makeProvider("alpha", "Alpha", shared, [{ id: "go", label: "Go" }]),
        makeProvider("beta", "Beta", shared, [{ id: "go", label: "Go" }]),
        makeProvider("gamma", "Gamma", [{ id: "gamma-unique", label: "Unique Model" }]),
      ],
      search: "model",
      currentAgentKind: "alpha",
      currentModel: "",
    });

    const rows = items.filter((item) => item.type === "model");
    const byKind = new Map(rows.map((item) => [item.providerKind, item]));
    expect(byKind.get("alpha")?.subProviderLabel).toBe("Go · Alpha");
    expect(byKind.get("beta")?.subProviderLabel).toBe("Go · Beta");
    // A model offered by a single provider stays undecorated.
    expect(byKind.get("gamma")?.subProviderLabel).toBeUndefined();
  });

  it("leaves the unsearched grouped picker undecorated", () => {
    const shared = [{ id: "go/shared-model", label: "Shared Model" }];
    const items = buildProviderModelItems({
      providers: [
        makeProvider("alpha", "Alpha", shared, [{ id: "go", label: "Go" }]),
        makeProvider("beta", "Beta", shared, [{ id: "go", label: "Go" }]),
      ],
      search: "",
      currentAgentKind: "alpha",
      currentModel: "",
    });

    // Unsearched rows group under sub-provider headers, so the row itself
    // carries no sub-provider label and needs no decoration.
    for (const item of items.filter((entry) => entry.type === "model")) {
      expect(item.subProviderLabel).toBeUndefined();
    }
  });

  it("decorates favorite rows while searching ambiguous models", () => {
    const shared = [{ id: "go/shared-model", label: "Shared Model" }];
    const items = buildProviderModelItems({
      providers: [
        makeProvider("alpha", "Alpha", shared, [{ id: "go", label: "Go" }]),
        makeProvider("beta", "Beta", shared, [{ id: "go", label: "Go" }]),
      ],
      search: "shared",
      favorites: [
        { agentKind: "alpha", modelId: "go/shared-model" },
        { agentKind: "beta", modelId: "go/shared-model" },
      ],
      currentAgentKind: "alpha",
      currentModel: "",
    });

    const favRows = items.filter(
      (item): item is Extract<typeof item, { type: "model" }> =>
        item.type === "model" && item.id.startsWith("fav:"),
    );
    expect(favRows).toHaveLength(2);
    const byKind = new Map(favRows.map((item) => [item.providerKind, item]));
    expect(byKind.get("alpha")?.subProviderLabel).toBe("Go · Alpha");
    expect(byKind.get("beta")?.subProviderLabel).toBe("Go · Beta");
  });

  it("omits selectable or Default context from parameterized ACP model rows", () => {
    const items = buildProviderModelItems({
      providers: [
        {
          kind: "cursor",
          label: "Cursor",
          presentationMode: "gui",
          capabilities: makeCapability(
            [
              { id: "gpt-5.5", label: "GPT-5.5" },
              { id: "composer-2.5", label: "Composer 2.5" },
              { id: "gpt-5.2", label: "GPT-5.2" },
            ],
            {
              efforts: ["low", "medium", "high"],
              modelEfforts: { "gpt-5.5": ["low", "medium", "high"] },
              fastModels: ["gpt-5.5", "composer-2.5"],
              contextSizes: [
                { id: "default", label: "Default" },
                { id: "272k", label: "272K" },
                { id: "1m", label: "1M" },
              ],
              modelContextSizes: {
                "gpt-5.5": ["default", "272k", "1m"],
                "composer-2.5": ["default"],
                "gpt-5.2": ["272k"],
              },
            },
          ),
        },
      ],
      search: "",
      currentAgentKind: "cursor",
      currentModel: "gpt-5.5",
      lockedAgentKind: "cursor",
    });

    const rows = items.filter((item) => item.type === "model");
    const gpt = rows.find((item) => item.modelId === "gpt-5.5");
    const composer = rows.find((item) => item.modelId === "composer-2.5");
    const gpt52 = rows.find((item) => item.modelId === "gpt-5.2");
    expect(gpt?.label).toBe("GPT-5.5");
    expect(gpt?.contextDescription).toBeUndefined();
    expect(composer?.label).toBe("Composer 2.5");
    expect(composer?.contextDescription).toBeUndefined();
    expect(gpt52?.contextDescription).toBe("272K");
  });
});

describe("buildProviderModelItems family projection", () => {
  afterEach(async () => {
    await dynamicActivate("en");
  });

  const pairMembers = [
    { id: "pair-a-x", label: "Fusion (Alpha Low + X)" },
    { id: "pair-a-x-fast", label: "Fusion (Alpha Low + X Fast)" },
    { id: "pair-a-y", label: "Fusion (Alpha Low + Y)" },
    { id: "pair-b-x", label: "Fusion (Beta Low + X)" },
  ];
  const familyCapabilities = () =>
    makeCapability([{ id: "adaptive", label: "Adaptive" }, ...pairMembers], {
      subProviders: [
        { id: "adaptive-group", label: "Adaptive" },
        { id: "fusion", label: "Fusion" },
      ],
      modelSubProvider: {
        adaptive: "adaptive-group",
        "pair-a-x": "fusion",
        "pair-a-x-fast": "fusion",
        "pair-a-y": "fusion",
        "pair-b-x": "fusion",
      },
      modelFamilies: [
        {
          model: "pair-a-x",
          label: "Fusion",
          selectors: [
            {
              id: "lead",
              labelKey: "modelSelection.lead",
              options: [
                { id: "alpha", label: "Alpha" },
                { id: "beta", label: "Beta" },
              ],
            },
            {
              id: "sidekick",
              labelKey: "modelSelection.sidekick",
              options: [
                { id: "x", label: "X" },
                { id: "y", label: "Y" },
              ],
            },
          ],
          bindings: { effort: "model", fast: "model" },
          members: [
            {
              model: "pair-a-x",
              selections: { lead: "alpha", sidekick: "x" },
              effort: "low",
              fast: false,
            },
            {
              model: "pair-a-x-fast",
              selections: { lead: "alpha", sidekick: "x" },
              effort: "low",
              fast: true,
            },
            {
              model: "pair-a-y",
              selections: { lead: "alpha", sidekick: "y" },
              effort: "low",
              fast: false,
            },
            {
              model: "pair-b-x",
              selections: { lead: "beta", sidekick: "x" },
              effort: "low",
              fast: false,
            },
          ],
        },
      ],
    });

  it("refreshes localized selector search tokens when the same capability changes locale", async () => {
    const provider: ProviderModelMenuProvider = {
      kind: "agent",
      label: "Agent",
      capabilities: familyCapabilities(),
    };
    const search = (query: string) =>
      buildProviderModelItems({ providers: [provider], search: query })
        .filter((item) => item.type === "model")
        .map((item) => item.modelId);

    await dynamicActivate("en");
    expect(search("Lead")).toEqual(["pair-a-x"]);
    expect(search("Principal")).toEqual([]);
    await dynamicActivate("fr");
    expect(search("Principal")).toEqual(["pair-a-x"]);
    expect(search("Lead")).toEqual([]);
    await dynamicActivate("en");
    expect(search("Lead")).toEqual(["pair-a-x"]);
    expect(search("Principal")).toEqual([]);
  });

  it("refreshes exact favorite and recent labels without changing family membership or shortcut semantics", async () => {
    const capability = familyCapabilities();
    for (const member of capability.modelFamilies![0]!.members) member.effort = "xhigh";
    const provider: ProviderModelMenuProvider = {
      kind: "agent",
      label: "Agent",
      capabilities: capability,
    };
    const favorites = [{ agentKind: "agent", modelId: "pair-a-x-fast" }];
    const recents = [
      ...favorites,
      { agentKind: "agent", modelId: "pair-a-y" },
      { agentKind: "agent", modelId: "pair-b-x" },
    ];
    // A second provider enables the separate favorites/recents sections.
    const providers = [provider, makeProvider("other", "Other", [{ id: "solo", label: "Solo" }])];
    const build = () =>
      buildProviderModelItems({
        providers,
        search: "",
        favorites,
        recents,
        recentsLimit: 1,
      }).filter((item) => item.type === "model");

    await dynamicActivate("en");
    const english = build();
    expect(english.find((row) => row.id === "fav:agent:pair-a-x-fast")?.label).toBe(
      "Fusion · Alpha · X · Fast · Extra High",
    );
    expect(english.find((row) => row.id === "recent:agent:pair-a-y")?.label).toBe(
      "Fusion · Alpha · Y · Extra High",
    );
    await dynamicActivate("fr");
    const french = build();
    expect(french.find((row) => row.id === "fav:agent:pair-a-x-fast")?.label).toBe(
      "Fusion · Alpha · X · Rapide · Très élevé",
    );
    expect(french.find((row) => row.id === "recent:agent:pair-a-y")?.label).toBe(
      "Fusion · Alpha · Y · Très élevé",
    );
    expect(french.map(({ label: _label, ...row }) => row)).toEqual(
      english.map(({ label: _label, ...row }) => row),
    );
    expect(french.filter((row) => row.id.startsWith("recent:")).map((row) => row.modelId)).toEqual([
      "pair-a-y",
    ]);
    expect(french.find((row) => row.id === "fav:agent:pair-a-x-fast")).toMatchObject({
      modelId: "pair-a-x-fast",
      isFavorite: true,
    });
    expect(
      french.find((row) => row.id === "fav:agent:pair-a-x-fast")?.familyModelIds,
    ).toBeUndefined();
    expect(french.find((row) => row.id === "model:agent:pair-a-x")?.familyModelIds).toEqual(
      pairMembers.map((member) => member.id),
    );
    await dynamicActivate("en");
    expect(build()).toEqual(english);
  });

  it("collapses family members into one labeled family row and keeps other choices", () => {
    const provider: ProviderModelMenuProvider = {
      kind: "agent",
      label: "Agent",
      capabilities: familyCapabilities(),
    };
    const items = buildProviderModelItems({ providers: [provider], search: "" });
    const rows = items.filter((item) => item.type === "model");
    expect(rows.map((item) => item.modelId)).toEqual(["adaptive", "pair-a-x"]);
    const familyRow = rows[1]!;
    expect(familyRow.label).toBe("Fusion");
    expect(familyRow.familyModelIds).toEqual(["pair-a-x", "pair-a-x-fast", "pair-a-y", "pair-b-x"]);
    // The family row sits in the fusion group, but the group label repeats the
    // family label so no redundant header is emitted.
    expect(items.filter((item) => item.type === "header-sub").map((item) => item.label)).toEqual(
      [],
    );
  });

  it("searches the family row by its label and selector options, still one row", () => {
    const provider: ProviderModelMenuProvider = {
      kind: "agent",
      label: "Agent",
      capabilities: familyCapabilities(),
    };
    for (const query of ["fusion", "beta", "x", "fast"]) {
      const rows = buildProviderModelItems({
        providers: [provider],
        search: query,
      }).filter((item) => item.type === "model");
      expect(rows.map((item) => item.modelId)).toEqual(["pair-a-x"]);
    }
    // Raw member ids never surface as their own rows, even when searched.
    const memberRows = buildProviderModelItems({
      providers: [provider],
      search: "pair-a-x-fast",
    }).filter((item) => item.type === "model");
    expect(memberRows.map((item) => item.modelId)).toEqual([]);
  });

  it("labels favorite member rows with the family summary plus encoded Effort/Fast at an exact id", () => {
    const provider: ProviderModelMenuProvider = {
      kind: "agent",
      label: "Agent",
      capabilities: familyCapabilities(),
    };
    const items = buildProviderModelItems({
      providers: [provider],
      search: "",
      favorites: [{ agentKind: "agent", modelId: "pair-a-x-fast" }],
    });
    const favRow = items.find(
      (item): item is Extract<ProviderModelItem, { type: "model" }> =>
        item.type === "model" && item.modelId === "pair-a-x-fast",
    );
    expect(favRow?.id).toBe("model-exact:agent:pair-a-x-fast");
    // Shortcut labels distinguish exact members on their own: the encoded
    // Effort coordinate joins the selectors and Fast.
    expect(favRow?.label).toBe("Fusion · Alpha · X · Fast · Low");
    expect(favRow?.isFavorite).toBe(true);
    // The family label already names the group; no sub label repeats it.
    expect(favRow?.subProviderLabel).toBeUndefined();
    // The favorite is an explicit exact-member row, not the collapsed family row.
    expect(favRow?.familyModelIds).toBeUndefined();
  });

  it("emits a distinct exact row for a favorite of the family representative", () => {
    const provider: ProviderModelMenuProvider = {
      kind: "agent",
      label: "Agent",
      capabilities: familyCapabilities(),
    };
    const items = buildProviderModelItems({
      providers: [provider],
      search: "",
      favorites: [{ agentKind: "agent", modelId: "pair-a-x" }],
    });
    const rows = items.filter(
      (item): item is Extract<ProviderModelItem, { type: "model" }> => item.type === "model",
    );
    // The projected family row keeps its representative id and family metadata…
    const familyRow = rows.find((row) => row.id === `model:agent:pair-a-x`);
    expect(familyRow?.familyModelIds).toBeDefined();
    // …and the favorite gets its own exact row with the same UID, no family
    // metadata, so its click selects the exact member instead of retaining
    // the family's current selection.
    const exactRow = rows.find((row) => row.id === `model-exact:agent:pair-a-x`);
    expect(exactRow?.modelId).toBe("pair-a-x");
    expect(exactRow?.familyModelIds).toBeUndefined();
    expect(exactRow?.isFavorite).toBe(true);
    // The exact label names the encoded coordinates that distinguish it from
    // the compact family row.
    expect(exactRow?.label).toBe("Fusion · Alpha · X · Low");
    // Exact favorite rows also surface while searching.
    const searched = buildProviderModelItems({
      providers: [provider],
      search: "fusion",
      favorites: [{ agentKind: "agent", modelId: "pair-a-x" }],
    }).filter(
      (item): item is Extract<ProviderModelItem, { type: "model" }> => item.type === "model",
    );
    expect(searched.some((row) => row.id === `model-exact:agent:pair-a-x`)).toBe(true);
  });

  it("keeps raw rows and labels untouched when the surface declares no relation", () => {
    const provider: ProviderModelMenuProvider = {
      kind: "agent",
      label: "Agent",
      capabilities: makeCapability(pairMembers),
    };
    const items = buildProviderModelItems({ providers: [provider], search: "" });
    expect(items.filter((item) => item.type === "model").map((item) => item.modelId)).toEqual(
      pairMembers.map((model) => model.id),
    );
  });
});

describe("buildProviderModelItems price lines", () => {
  const priceKind = "pricing-rows-fixture";
  registerModelDescriptionFormatter(priceKind, (description) => {
    const free = description.trim() === "Free";
    const match = free ? null : /^\$(\d+) in \/ \$(\d+) out$/.exec(description.trim());
    if (!free && !match) return undefined;
    const input = free ? 0 : Number(match![1]);
    const output = free ? 0 : Number(match![2]);
    return {
      hint: free ? "Free" : `$${input} / $${output} · 1M`,
      explanation: { id: "fixture-pricing-units", message: "units" },
      price: { inputMin: input, inputMax: input, outputMin: output, outputMax: output, free },
    };
  });

  const pricedFamilyCapability = (descriptions: Record<string, string | undefined>) =>
    makeCapability(
      [
        {
          id: "pair-a-x",
          label: "Fusion (Alpha + X)",
          ...(descriptions["pair-a-x"] ? { description: descriptions["pair-a-x"] } : {}),
        },
        {
          id: "pair-a-y",
          label: "Fusion (Alpha + Y)",
          ...(descriptions["pair-a-y"] ? { description: descriptions["pair-a-y"] } : {}),
        },
        {
          id: "pair-b-x",
          label: "Fusion (Beta + X)",
          ...(descriptions["pair-b-x"] ? { description: descriptions["pair-b-x"] } : {}),
        },
      ],
      {
        modelFamilies: [
          {
            model: "pair-a-x",
            label: "Fusion",
            selectors: [
              {
                id: "lead",
                labelKey: "modelSelection.lead",
                options: [
                  { id: "alpha", label: "Alpha" },
                  { id: "beta", label: "Beta" },
                ],
              },
              {
                id: "sidekick",
                labelKey: "modelSelection.sidekick",
                options: [
                  { id: "x", label: "X" },
                  { id: "y", label: "Y" },
                ],
              },
            ],
            bindings: { effort: "model", fast: "model" },
            members: [
              {
                model: "pair-a-x",
                selections: { lead: "alpha", sidekick: "x" },
                effort: "low",
                fast: false,
              },
              {
                model: "pair-a-y",
                selections: { lead: "alpha", sidekick: "y" },
                effort: "low",
                fast: false,
              },
              {
                model: "pair-b-x",
                selections: { lead: "beta", sidekick: "x" },
                effort: "low",
                fast: false,
              },
            ],
          },
        ],
      },
    );

  it("shows an exact row's own provider price and omits rows with unknown terms", () => {
    const provider = makeProvider(priceKind, "Fixture", [
      { id: "priced", label: "Priced", description: "$5 in / $25 out" },
      { id: "mystery", label: "Mystery", description: "ask your accountant" },
    ]);
    const rows = buildProviderModelItems({ providers: [provider], search: "" }).filter(
      (item): item is Extract<ProviderModelItem, { type: "model" }> => item.type === "model",
    );
    expect(rows.find((row) => row.modelId === "priced")?.priceLine).toBe("$5 / $25 · 1M");
    // Unknown provider text is never turned into a fabricated hint.
    expect(rows.find((row) => row.modelId === "mystery")?.priceLine).toBeUndefined();
  });

  it("aggregates a family row's price range only when every member's price is known", () => {
    const pricedProvider: ProviderModelMenuProvider = {
      kind: priceKind,
      label: "Fixture",
      capabilities: pricedFamilyCapability({
        "pair-a-x": "$1 in / $2 out",
        "pair-a-y": "$3 in / $6 out",
        "pair-b-x": "Free",
      }),
    };
    const priced = buildProviderModelItems({ providers: [pricedProvider], search: "" }).filter(
      (item): item is Extract<ProviderModelItem, { type: "model" }> => item.type === "model",
    );
    const familyRow = priced.find((row) => row.familyModelIds);
    expect(familyRow?.priceLine).toBe("$0–3 / $0–6 · 1M");

    // One member without parseable terms: no range is implied at all.
    const partialProvider: ProviderModelMenuProvider = {
      kind: priceKind,
      label: "Fixture",
      capabilities: pricedFamilyCapability({
        "pair-a-x": "$1 in / $2 out",
        "pair-a-y": undefined,
        "pair-b-x": "Free",
      }),
    };
    const partial = buildProviderModelItems({ providers: [partialProvider], search: "" }).filter(
      (item): item is Extract<ProviderModelItem, { type: "model" }> => item.type === "model",
    );
    expect(partial.find((row) => row.familyModelIds)?.priceLine).toBeUndefined();
  });

  it.each([
    ["pair-a-x", "$1 / $2 · 1M"],
    ["pair-b-x", "Free"],
  ])("keeps exact favorite %s on its own price beside the family range", (modelId, price) => {
    const provider: ProviderModelMenuProvider = {
      kind: priceKind,
      label: "Fixture",
      capabilities: pricedFamilyCapability({
        "pair-a-x": "$1 in / $2 out",
        "pair-a-y": "$3 in / $6 out",
        "pair-b-x": "Free",
      }),
    };
    const items = buildProviderModelItems({
      providers: [provider],
      search: "",
      favorites: [{ agentKind: priceKind, modelId }],
    }).filter(
      (item): item is Extract<ProviderModelItem, { type: "model" }> => item.type === "model",
    );
    // The exact favorite keeps the member's own price, not the family range.
    const exactRow = items.find((row) => row.id === `model-exact:${priceKind}:${modelId}`);
    expect(exactRow?.priceLine).toBe(price);
    // The collapsed family row keeps the honest aggregate.
    expect(items.find((row) => row.familyModelIds)?.priceLine).toBe("$0–3 / $0–6 · 1M");
  });
});

it("separates provider-declared primary choices above regular models without changing exact IDs", () => {
  registerPrimaryModelChoices("primary-fixture", () => ["auto", "pair", "absent", "pair"]);
  const provider = makeProvider("primary-fixture", "Fixture", [
    { id: "regular", label: "Regular" },
    { id: "pair", label: "Pair" },
    { id: "auto", label: "Auto" },
  ]);
  const rows = buildProviderModelItems({ providers: [provider], search: "" });
  expect(rows.filter((row) => row.type === "model").map((row) => row.modelId)).toEqual([
    "auto",
    "pair",
    "regular",
  ]);
  expect(rows.map((row) => row.id)).toEqual([
    "model:primary-fixture:auto",
    "model:primary-fixture:pair",
    "models:primary-fixture",
    "model:primary-fixture:regular",
  ]);
  const search = buildProviderModelItems({ providers: [provider], search: "Regular" });
  expect(search.filter((row) => row.type === "model").map((row) => row.modelId)).toEqual([
    "regular",
  ]);
  expect(search.some((row) => row.type === "header-plain")).toBe(false);
  provider.capabilities = {
    ...provider.capabilities,
    models: provider.capabilities.models.filter((row) => row.id !== "auto"),
  };
  expect(
    buildProviderModelItems({ providers: [provider], search: "" })
      .filter((row) => row.type === "model")
      .map((row) => row.modelId),
  ).toEqual(["pair", "regular"]);
});

it("removes primary group headers while retaining regular model groups", () => {
  registerPrimaryModelChoices("grouped-primary-fixture", () => ["pair"]);
  const provider = makeProvider("grouped-primary-fixture", "Fixture", [
    { id: "pair", label: "Pair" },
    { id: "regular", label: "Regular" },
  ]);
  provider.capabilities.modelSubProvider = { pair: "workflow", regular: "standard" };
  provider.capabilities.subProviders = [
    { id: "workflow", label: "Workflow" },
    { id: "standard", label: "Standard" },
  ];
  const rows = buildProviderModelItems({ providers: [provider], search: "" });
  expect(rows.some((row) => row.type === "header-sub" && row.subId === "workflow")).toBe(false);
  expect(rows.find((row) => row.type === "header-sub" && row.subId === "standard")).toBeDefined();
  expect(rows[0]?.id).toBe("model:grouped-primary-fixture:pair");
});
