import { afterEach, describe, expect, it } from "vitest";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import { formatEffortLabel } from "./effortLabel";

afterEach(async () => dynamicActivate("en"));

describe("effort display labels", () => {
  it("translates the canonical reasoning ladder and refreshes it across locale changes", async () => {
    const ids = ["minimal", "low", "medium", "high", "max"];
    await dynamicActivate("en");
    expect(ids.map(formatEffortLabel)).toEqual(["Minimal", "Low", "Medium", "High", "Max"]);
    await dynamicActivate("fr");
    expect(ids.map(formatEffortLabel)).toEqual(["Minimal", "Faible", "Moyen", "Élevé", "Maximal"]);
    expect(formatEffortLabel("none")).not.toBe("None");
    expect(formatEffortLabel("xHigh")).toBe("Très élevé");
    expect(formatEffortLabel("extra-high")).toBe("Très élevé");
    await dynamicActivate("en");
    expect(ids.map(formatEffortLabel)).toEqual(["Minimal", "Low", "Medium", "High", "Max"]);
  });

  it("preserves native custom labels and the branded effort name", async () => {
    await dynamicActivate("fr");
    expect(formatEffortLabel("adaptive-custom")).toBe("Adaptive-custom");
    expect(formatEffortLabel("ultracode")).toBe("Ultracode");
    expect(formatEffortLabel("constructor")).toBe("Constructor");
  });
});
