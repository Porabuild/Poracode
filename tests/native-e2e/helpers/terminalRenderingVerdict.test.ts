import { describe, expect, it } from "vitest";
import { terminalRenderingVerdict } from "./terminalRenderingVerdict.ts";

describe("terminal rendering evidence", () => {
  it("does not credit a delivered second command whose output is missing", () => {
    expect(
      terminalRenderingVerdict({
        firstOutputFound: true,
        secondOutputFound: false,
        productionDefectRecorded: false,
      }),
    ).toBe("rendered-output-missing");
  });

  it.each([
    [false, true],
    [false, false],
  ])("requires both outputs (first=%s, second=%s)", (firstOutputFound, secondOutputFound) => {
    expect(
      terminalRenderingVerdict({
        firstOutputFound,
        secondOutputFound,
        productionDefectRecorded: false,
      }),
    ).toBe("rendered-output-missing");
  });

  it("credits both observed outputs", () => {
    expect(
      terminalRenderingVerdict({
        firstOutputFound: true,
        secondOutputFound: true,
        productionDefectRecorded: false,
      }),
    ).toBe("rendered-pass");
  });

  it("preserves an explicitly recorded production defect", () => {
    expect(
      terminalRenderingVerdict({
        firstOutputFound: false,
        secondOutputFound: false,
        productionDefectRecorded: true,
      }),
    ).toBe("production-defect-reported");
  });
});
