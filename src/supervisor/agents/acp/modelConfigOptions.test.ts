import { describe, expect, it } from "vitest";
import {
  findContextConfigOption,
  findFastConfigOption,
  flattenSelectOptionValues,
  resolveAdvertisedSelectValue,
} from "./modelConfigOptions";

const options = [
  {
    id: "fast",
    category: "model_config",
    type: "select",
    currentValue: "true",
    options: [
      { value: "false", name: "Off" },
      { value: "true", name: "Fast" },
    ],
  },
  {
    id: "context",
    category: "model_config",
    type: "select",
    currentValue: "272k",
    options: [
      { value: "272k", name: "272K" },
      { value: "1m", name: "1M" },
    ],
  },
  {
    id: "effort",
    category: "thought_level",
    type: "select",
    options: [
      { value: "high", name: "High" },
      { value: "extra-high", name: "Extra High" },
    ],
  },
];

describe("model config option classification", () => {
  it("finds the boolean fast selector and the context-size selector", () => {
    expect(findFastConfigOption(options)?.id).toBe("fast");
    expect(findContextConfigOption(options)?.id).toBe("context");
  });

  it("maps xhigh onto an advertised extra-high value", () => {
    expect(resolveAdvertisedSelectValue(options[2], "xhigh")).toBe("extra-high");
    expect(resolveAdvertisedSelectValue(options[1], "1m")).toBe("1m");
  });
});

describe("declared fast binding classification", () => {
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

  it("claims the exact bound select and keeps every wire value native", () => {
    const found = findFastConfigOption([options[0], paceOption(), options[1]], binding);
    expect(found?.id).toBe("pace");
    expect(found?.currentValue).toBe("steady");
    expect(flattenSelectOptionValues(found?.options)).toEqual(["steady", "rapid"]);
  });

  it("accepts grouped values when the flatten yields exactly the declared pair", () => {
    const grouped = paceOption({
      options: [
        { group: "lane", name: "Lane", options: [{ value: "steady", name: "Steady" }] },
        { value: "rapid", name: "Rapid" },
      ],
    });
    expect(findFastConfigOption([grouped], binding)?.id).toBe("pace");
  });

  it("selects the bound control by exact id without consulting its category", () => {
    expect(findFastConfigOption([paceOption({ category: null })], binding)?.id).toBe("pace");
    expect(findFastConfigOption([paceOption({ category: "quality" })], binding)?.id).toBe("pace");
  });

  it.each([
    ["select missing", [options[0]]],
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
    [
      "one value duplicated",
      [
        paceOption({
          options: [
            { value: "rapid", name: "Rapid" },
            { value: "rapid", name: "Rapid again" },
          ],
        }),
      ],
    ],
  ])("refuses to claim an undrivable binding target: %s", (_label, configOptions) => {
    expect(findFastConfigOption(configOptions, binding)).toBeUndefined();
  });

  it("refuses a binding whose declared values are not distinct", () => {
    expect(
      findFastConfigOption([paceOption()], {
        configId: "pace",
        disabled: "rapid",
        enabled: "rapid",
      }),
    ).toBeUndefined();
  });

  it("keeps the default boolean-pair classification when no binding is declared", () => {
    expect(findFastConfigOption(options)?.id).toBe("fast");
    expect(findFastConfigOption([paceOption()])).toBeUndefined();
  });
});
