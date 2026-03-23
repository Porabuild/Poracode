import { describe, expect, it } from "vitest";
import { normalizeWslListOutput, toWslUncPath } from "./wsl";

describe("wsl helpers", () => {
  it("normalizes WSL distro output that contains NUL characters", () => {
    expect(normalizeWslListOutput("U\u0000b\u0000u\u0000n\u0000t\u0000u\u0000\r\n\u0000")).toEqual([
      "Ubuntu",
    ]);
  });

  it("builds a UNC path for a WSL project", () => {
    expect(toWslUncPath("Ubuntu", "/home/demo/project")).toBe(
      "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
    );
  });
});
