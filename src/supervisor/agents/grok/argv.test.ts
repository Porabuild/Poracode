import { describe, expect, it } from "vitest";
import { buildGrokArgs, buildGrokAcpArgs } from "./argv";

describe("buildGrokArgs (TUI/PTY)", () => {
  it("emits nothing for a bare default config", () => {
    expect(buildGrokArgs({ mode: "agent" } as any, "", undefined)).toEqual([]);
  });

  it("passes -r <id> when the session id is known", () => {
    expect(buildGrokArgs({ mode: "agent" } as any, "", "abc-123")).toEqual(["-r", "abc-123"]);
  });

  it("never emits -c, --no-plan, --permission-mode, or --effort", () => {
    const cases: Array<Partial<{ mode: string; approvalPolicy: string; effort: string }>> = [
      { mode: "agent" },
      { mode: "plan" },
      { mode: "agent", approvalPolicy: "bypassPermissions" },
      { mode: "agent", approvalPolicy: "default", effort: "high" },
    ];
    for (const c of cases) {
      const args = buildGrokArgs(c as any, "", undefined);
      expect(args).not.toContain("-c");
      expect(args).not.toContain("--no-plan");
      expect(args).not.toContain("--permission-mode");
      expect(args).not.toContain("--effort");
      expect(args).not.toContain("--reasoning-effort");
    }
  });

  it("adds --always-approve when approval policy bypasses permissions", () => {
    expect(
      buildGrokArgs({ mode: "agent", approvalPolicy: "bypassPermissions" } as any, "", undefined),
    ).toEqual(["--always-approve"]);
  });

  it("treats legacy 'never' and 'yolo' policies as bypass", () => {
    for (const policy of ["never", "yolo"]) {
      expect(
        buildGrokArgs({ mode: "agent", approvalPolicy: policy } as any, "", undefined),
      ).toContain("--always-approve");
    }
  });

  it("does not pass --always-approve for non-bypass policies", () => {
    expect(
      buildGrokArgs({ mode: "agent", approvalPolicy: "default" } as any, "", undefined),
    ).not.toContain("--always-approve");
  });

  it("passes -m <model> when set", () => {
    expect(buildGrokArgs({ mode: "agent", model: "grok-build" } as any, "", undefined)).toEqual([
      "-m",
      "grok-build",
    ]);
  });
});

describe("buildGrokAcpArgs (`grok agent stdio` prefix)", () => {
  it("emits nothing for a bare default config", () => {
    expect(buildGrokAcpArgs({} as any)).toEqual([]);
  });

  it("never emits --permission-mode, --no-plan, --effort, or --reasoning-effort", () => {
    const args = buildGrokAcpArgs({
      mode: "plan",
      approvalPolicy: "bypassPermissions",
      effort: "high",
    } as any);
    expect(args).not.toContain("--permission-mode");
    expect(args).not.toContain("--no-plan");
    expect(args).not.toContain("--effort");
    expect(args).not.toContain("--reasoning-effort");
  });

  it("adds --always-approve when approval policy bypasses permissions", () => {
    expect(buildGrokAcpArgs({ approvalPolicy: "bypassPermissions" } as any)).toEqual([
      "--always-approve",
    ]);
  });

  it("passes -m <model> when set", () => {
    expect(buildGrokAcpArgs({ model: "grok-build" } as any)).toEqual(["-m", "grok-build"]);
  });
});
