import { describe, expect, it } from "vitest";
import {
  findContextConfigOption,
  findFastConfigOption,
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
