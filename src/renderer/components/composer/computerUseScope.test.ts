import { describe, expect, it } from "vitest";
import { getComputerUseScope } from "./computerUseScope";

describe("getComputerUseScope", () => {
  it("disables Computer Use for WSL projects", () => {
    expect(
      getComputerUseScope("codex", "terminal", {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\repo",
      }),
    ).toBe("none");
  });
});
