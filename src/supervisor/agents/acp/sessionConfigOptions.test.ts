import { describe, expect, it } from "vitest";
import {
  describeConfigOptions,
  describeConfigOptionsWithRoles,
  findAdvertisedConfigOption,
  listAdvertisedSelectValueIds,
  listBooleanConfigOptions,
} from "./sessionConfigOptions";

describe("describeConfigOptions", () => {
  it("describes a flat select with its values and current value", () => {
    expect(
      describeConfigOptions([
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "model-b",
          options: [
            { value: "model-a", name: "Model A" },
            { value: "model-b", name: "Model B" },
          ],
        },
      ]),
    ).toEqual([
      {
        type: "select",
        id: "model",
        name: "Model",
        category: "model",
        currentValue: "model-b",
        values: [
          { value: "model-a", name: "Model A" },
          { value: "model-b", name: "Model B" },
        ],
        groups: [],
      },
    ]);
  });

  it("describes grouped selects with group ids and per-value group attribution", () => {
    expect(
      describeConfigOptions([
        {
          id: "reasoning",
          category: "thought_level",
          type: "select",
          currentValue: "high",
          options: [
            {
              group: "standard",
              name: "Standard",
              options: [
                { value: "low", name: "Low" },
                { value: "medium", name: "Medium" },
              ],
            },
            { group: "extended", options: [{ value: "high", name: "High" }] },
          ],
        },
      ]),
    ).toEqual([
      {
        type: "select",
        id: "reasoning",
        category: "thought_level",
        currentValue: "high",
        values: [
          { value: "low", name: "Low", group: "standard" },
          { value: "medium", name: "Medium", group: "standard" },
          { value: "high", name: "High", group: "extended" },
        ],
        groups: [{ id: "standard", name: "Standard" }, { id: "extended" }],
      },
    ]);
  });

  it("describes a boolean option with its boolean state", () => {
    expect(
      describeConfigOptions([
        {
          id: "turbo",
          name: "Turbo",
          category: "model_config",
          type: "boolean",
          currentValue: true,
        },
      ]),
    ).toEqual([
      { type: "boolean", id: "turbo", name: "Turbo", category: "model_config", currentValue: true },
    ]);
  });

  it("marks a boolean option without a boolean state as unsupported", () => {
    expect(describeConfigOptions([{ id: "turbo", type: "boolean", currentValue: "true" }])).toEqual(
      [{ type: "unsupported", id: "turbo", controlType: "boolean" }],
    );
  });

  it("marks an unaddressable select as unsupported instead of dropping it", () => {
    expect(
      describeConfigOptions([{ type: "select", category: "model", options: [{ value: "a" }] }]),
    ).toEqual([{ type: "unsupported", category: "model", controlType: "select" }]);
  });

  it("marks unknown control types as unsupported without inventing a control", () => {
    expect(
      describeConfigOptions([
        { id: "picker", name: "Picker", type: "radio", currentValue: "a" },
        { id: "mystery" },
      ]),
    ).toEqual([
      { type: "unsupported", id: "picker", name: "Picker", controlType: "radio" },
      { type: "unsupported", id: "mystery" },
    ]);
  });

  it("skips corrupt entries and accepts only array input", () => {
    expect(describeConfigOptions("not-an-array")).toEqual([]);
    expect(
      describeConfigOptions([
        42,
        null,
        "option",
        { id: "keep", type: "boolean", currentValue: false },
      ]),
    ).toEqual([{ type: "boolean", id: "keep", currentValue: false }]);
  });
});

describe("listBooleanConfigOptions", () => {
  it("returns only the boolean descriptors", () => {
    const configOptions = [
      {
        id: "model",
        category: "model",
        type: "select",
        currentValue: "model-a",
        options: [{ value: "model-a", name: "Model A" }],
      },
      { id: "turbo", type: "boolean", currentValue: true },
      { id: "broken", type: "boolean", currentValue: "yes" },
    ];

    expect(listBooleanConfigOptions(configOptions)).toEqual([
      { type: "boolean", id: "turbo", currentValue: true },
    ]);
    expect(listBooleanConfigOptions([])).toEqual([]);
  });
});

describe("findAdvertisedConfigOption", () => {
  it("finds an option by its exact wire id and keeps the raw entry lossless", () => {
    const entry = {
      id: "picker",
      type: "select",
      currentValue: "",
      options: [{ value: "", name: "Empty" }],
      _meta: { "fixture/tag": { kept: true } },
    };
    const configOptions = [{ id: "other", type: "select", currentValue: "x", options: [] }, entry];

    expect(findAdvertisedConfigOption(configOptions, "picker")).toBe(entry);
    expect(findAdvertisedConfigOption(configOptions, "missing")).toBeUndefined();
  });

  it("skips corrupt entries instead of throwing", () => {
    expect(findAdvertisedConfigOption([42, null, "option", { id: "keep" }], "keep")).toEqual({
      id: "keep",
    });
  });
});

describe("listAdvertisedSelectValueIds", () => {
  it("lists flat values including legitimate empty strings", () => {
    expect(
      listAdvertisedSelectValueIds({
        type: "select",
        options: [
          { value: "a", name: "A" },
          { value: "", name: "Empty" },
        ],
      }),
    ).toEqual(["a", ""]);
  });

  it("flattens grouped values with their ids", () => {
    expect(
      listAdvertisedSelectValueIds({
        type: "select",
        options: [
          { group: "g1", name: "Group", options: [{ value: "a", name: "A" }] },
          { value: "b", name: "B" },
        ],
      }),
    ).toEqual(["a", "b"]);
  });

  it("yields nothing for non-select options", () => {
    expect(listAdvertisedSelectValueIds({ type: "boolean", currentValue: true })).toEqual([]);
    expect(listAdvertisedSelectValueIds(undefined)).toEqual([]);
  });
});

describe("describeConfigOptionsWithRoles", () => {
  function fullOptionSet() {
    return [
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "model-a",
        options: [{ value: "model-a", name: "Model A" }],
      },
      {
        id: "thought_level",
        category: "thought_level",
        type: "select",
        currentValue: "low",
        options: [
          { value: "low", name: "Low" },
          { value: "high", name: "High" },
        ],
      },
      {
        id: "mode",
        category: "mode",
        type: "select",
        currentValue: "code",
        options: [{ value: "code", name: "Code" }],
      },
      {
        id: "thinking_toggle",
        category: "thought_level",
        type: "select",
        name: "Thinking",
        currentValue: "on",
        _meta: { "some-provider/reasoning": { toggleOnly: true } },
        options: [
          { value: "off", name: "Off" },
          { value: "on", name: "On" },
        ],
      },
      {
        id: "fast",
        category: "model_config",
        type: "select",
        currentValue: "false",
        options: [
          { value: "false", name: "False" },
          { value: "true", name: "True" },
        ],
      },
      {
        id: "context",
        category: "model_config",
        type: "select",
        currentValue: "200k",
        options: [{ value: "200k", name: "200K" }],
      },
    ];
  }

  it("marks the composer field each standard control feeds and nothing else", () => {
    const roles = describeConfigOptionsWithRoles(fullOptionSet()).map((descriptor) => ({
      id: descriptor.id,
      role: descriptor.role,
    }));
    expect(roles).toEqual([
      { id: "model", role: "model" },
      { id: "thought_level", role: "effort" },
      { id: "mode", role: "mode" },
      { id: "thinking_toggle", role: "thinking" },
      { id: "fast", role: "fast" },
      { id: "context", role: "context" },
    ]);
  });

  it("keeps native ids, labels, groups and current values exact", () => {
    expect(describeConfigOptionsWithRoles(fullOptionSet())).toEqual(
      describeConfigOptions(fullOptionSet()).map((descriptor) => ({
        ...descriptor,
        role: expect.any(String),
      })),
    );
    const effort = describeConfigOptionsWithRoles(fullOptionSet()).find(
      (descriptor) => descriptor.id === "thought_level",
    );
    expect(effort).toMatchObject({
      type: "select",
      id: "thought_level",
      category: "thought_level",
      currentValue: "low",
      values: [
        { value: "low", name: "Low" },
        { value: "high", name: "High" },
      ],
      groups: [],
    });
  });

  it("never gives an unsupported option a role", () => {
    const options = [
      ...fullOptionSet(),
      { id: "weird", name: "Weird", category: "model", type: "hyperspace" },
    ];
    const weird = describeConfigOptionsWithRoles(options).find(
      (descriptor) => descriptor.id === "weird",
    );
    expect(weird).toMatchObject({ type: "unsupported", id: "weird" });
    expect(weird).not.toHaveProperty("role");
  });

  it("does not give the model role to a reasoning selector filed under the model category", () => {
    const effort = describeConfigOptionsWithRoles([
      {
        id: "reasoning_effort",
        category: "model",
        type: "select",
        currentValue: "high",
        options: [
          { value: "low", name: "Low" },
          { value: "high", name: "High" },
        ],
      },
    ]);
    expect(effort).toHaveLength(1);
    expect(effort[0]).toMatchObject({ id: "reasoning_effort", role: "effort" });
  });

  it("marks a toggle-only thought-level select as thinking", () => {
    const descriptors = describeConfigOptionsWithRoles([
      {
        id: "thought_level",
        category: "thought_level",
        type: "select",
        name: "Reasoning",
        currentValue: "default",
        _meta: { reasoning: { toggleOnly: true } },
        options: [
          { value: "none", name: "None" },
          { value: "default", name: "Default" },
        ],
      },
    ]);
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toMatchObject({ id: "thought_level", role: "thinking" });
  });

  it("keeps the plain projection role-free", () => {
    for (const descriptor of describeConfigOptions(fullOptionSet())) {
      expect(descriptor).not.toHaveProperty("role");
    }
  });

  it("still describes grouped values and group infos when roles are marked", () => {
    const descriptors = describeConfigOptionsWithRoles([
      {
        id: "model",
        category: "model",
        type: "select",
        currentValue: "m2",
        options: [
          {
            group: "family",
            name: "Family",
            options: [{ value: "m1", name: "Model One" }],
          },
          { group: "other", options: [{ value: "m2", name: "Model Two" }] },
        ],
      },
    ]);
    expect(descriptors[0]).toMatchObject({
      id: "model",
      role: "model",
      groups: [{ id: "family", name: "Family" }, { id: "other" }],
      values: [
        { value: "m1", name: "Model One", group: "family" },
        { value: "m2", name: "Model Two", group: "other" },
      ],
    });
  });
  it("preserves legitimate empty select values and current values", () => {
    expect(
      describeConfigOptions([
        {
          id: "choice",
          type: "select",
          currentValue: "",
          options: [{ value: "", name: "Default" }, { value: "other" }],
        },
      ]),
    ).toEqual([
      {
        id: "choice",
        type: "select",
        currentValue: "",
        values: [{ value: "", name: "Default" }, { value: "other" }],
        groups: [],
      },
    ]);
  });
  it("does not tag a toggle marker whose wire values cannot drive thinking", () => {
    const options = [
      {
        id: "thought_level",
        category: "thought_level",
        type: "select",
        _meta: { reasoning: { toggleOnly: true } },
        options: [{ value: "alpha" }, { value: "beta" }],
      },
    ];
    expect(describeConfigOptionsWithRoles(options)[0]).not.toHaveProperty("role");
  });
});

describe("describeConfigOptionsWithRoles — declared fast binding", () => {
  const binding = { configId: "pace", disabled: "steady", enabled: "rapid" };

  function paceOption(overrides: Record<string, unknown> = {}) {
    return {
      id: "pace",
      name: "Pace",
      category: "model_config",
      type: "select",
      currentValue: "steady",
      options: [
        { value: "steady", name: "Steady" },
        { value: "rapid", name: "Rapid" },
      ],
      ...overrides,
    };
  }

  function legacyBooleanFast() {
    return {
      id: "fast",
      name: "Fast",
      category: "model_config",
      type: "select",
      currentValue: "false",
      options: [
        { value: "false", name: "False" },
        { value: "true", name: "True" },
      ],
    };
  }

  it("marks the bound native select as the fast field and keeps every wire detail raw", () => {
    expect(describeConfigOptionsWithRoles([paceOption()], binding)).toEqual([
      {
        type: "select",
        id: "pace",
        name: "Pace",
        category: "model_config",
        role: "fast",
        currentValue: "steady",
        values: [
          { value: "steady", name: "Steady" },
          { value: "rapid", name: "Rapid" },
        ],
        groups: [],
      },
    ]);
  });

  it("marks a bound grouped select as fast and keeps its group info", () => {
    const grouped = paceOption({
      options: [
        { group: "lane", name: "Lane", options: [{ value: "steady", name: "Steady" }] },
        { value: "rapid", name: "Rapid" },
      ],
    });
    expect(describeConfigOptionsWithRoles([grouped], binding)[0]).toMatchObject({
      id: "pace",
      role: "fast",
      groups: [{ id: "lane", name: "Lane" }],
      values: [
        { value: "steady", name: "Steady", group: "lane" },
        { value: "rapid", name: "Rapid" },
      ],
    });
  });

  it("displaces the boolean-pair sniff while a binding is declared", () => {
    const descriptors = describeConfigOptionsWithRoles(
      [legacyBooleanFast(), paceOption()],
      binding,
    );
    expect(descriptors.find((descriptor) => descriptor.id === "pace")?.role).toBe("fast");
    expect(descriptors.find((descriptor) => descriptor.id === "fast")).not.toHaveProperty("role");
  });

  it.each([
    ["select missing", [legacyBooleanFast()]],
    ["one declared value missing", [paceOption({ options: [{ value: "rapid", name: "Rapid" }] })]],
    ["boolean wrong type", [paceOption({ type: "boolean", currentValue: true })]],
    ["unsupported control type", [paceOption({ type: "hyperspace" })]],
    [
      "extra ladder value",
      [
        paceOption({
          options: [
            { value: "steady", name: "Steady" },
            { value: "rapid", name: "Rapid" },
            { value: "hyperspeed", name: "Hyperspeed" },
          ],
        }),
      ],
    ],
  ])("never tags an undrivable binding target with the fast role: %s", (_label, configOptions) => {
    const descriptors = describeConfigOptionsWithRoles(configOptions, binding);
    for (const descriptor of descriptors) {
      expect(descriptor.role).not.toBe("fast");
    }
  });

  it("never tags anything when the declared values are not distinct", () => {
    const descriptors = describeConfigOptionsWithRoles([paceOption()], {
      configId: "pace",
      disabled: "rapid",
      enabled: "rapid",
    });
    for (const descriptor of descriptors) {
      expect(descriptor).not.toHaveProperty("role");
    }
  });
});
