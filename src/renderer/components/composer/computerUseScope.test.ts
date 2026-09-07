import { describe, expect, it } from "vitest";
import { getComputerUseScope } from "./computerUseScope";

// Adapter-declared scope shapes (see src/supervisor/agents/*/detection.ts):
// most providers declare nothing and inherit the generic gui="launch" /
// terminal="none" fallback; Codex opts terminal in, OpenCode/Antigravity opt
// everything out.
const undeclared = {};
const codexLike = { mcpScope: { terminal: "launch", gui: "launch" } } as const;
const optedOut = { mcpScope: { terminal: "none", gui: "none" } } as const;

describe("getComputerUseScope", () => {
  it("disables Computer Use for WSL projects", () => {
    expect(
      getComputerUseScope(codexLike, "terminal", {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\repo",
      }),
    ).toBe("none");
  });

  it("allows Computer Use for native Linux projects", () => {
    expect(getComputerUseScope(undeclared, "gui", { kind: "posix", path: "/tmp" })).toBe("launch");
  });

  it("disables Computer Use for adapters that opt out in every presentation", () => {
    expect(getComputerUseScope(optedOut, "gui", { kind: "windows", path: "C:\\repo" })).toBe(
      "none",
    );
  });

  it("allows Computer Use from remote/mobile sessions when the host is Windows", () => {
    // Remote is not a scope gate — agents run on the paired desktop.
    expect(getComputerUseScope(undeclared, "gui", { kind: "windows", path: "C:\\repo" })).toBe(
      "launch",
    );
  });

  it("hides the toggle for terminal threads when the adapter declares no scope", () => {
    expect(getComputerUseScope(undeclared, "terminal", { kind: "posix", path: "/tmp" })).toBe(
      "none",
    );
  });

  it("allows Computer Use for terminal threads when the adapter opts in (Codex)", () => {
    expect(getComputerUseScope(codexLike, "terminal", { kind: "posix", path: "/tmp" })).toBe(
      "launch",
    );
  });
});
// @vitest-environment node
