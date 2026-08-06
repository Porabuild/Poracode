import { describe, expect, it } from "vitest";
import { buildGrokArgs, buildGrokAcpArgs } from "./argv";

describe("buildGrokArgs (TUI/PTY)", () => {
  it("disables auto-update for a bare default config", () => {
    expect(buildGrokArgs({ mode: "agent" } as any, "", undefined)).toEqual(["--no-auto-update"]);
  });

  it("passes -r <id> when resuming a materialized session", () => {
    expect(
      buildGrokArgs({ mode: "agent" } as any, "", { kind: "resume", sessionId: "abc-123" }),
    ).toEqual(["--no-auto-update", "-r", "abc-123"]);
  });

  it("passes -s <id> when pre-assigning a new session id", () => {
    expect(
      buildGrokArgs({ mode: "agent" } as any, "", { kind: "new", sessionId: "abc-123" }),
    ).toEqual(["--no-auto-update", "-s", "abc-123"]);
  });

  it("never emits -c, --no-plan, or --permission-mode", () => {
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
    }
  });

  it("forwards config.effort as --reasoning-effort", () => {
    expect(buildGrokArgs({ mode: "agent", effort: "low" } as any, "", undefined)).toEqual([
      "--no-auto-update",
      "--reasoning-effort",
      "low",
    ]);
  });

  it("omits --reasoning-effort when effort is unset", () => {
    expect(buildGrokArgs({ mode: "agent" } as any, "", undefined)).not.toContain(
      "--reasoning-effort",
    );
  });

  it("adds --always-approve when approval policy bypasses permissions", () => {
    expect(
      buildGrokArgs({ mode: "agent", approvalPolicy: "bypassPermissions" } as any, "", undefined),
    ).toEqual(["--no-auto-update", "--always-approve"]);
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
    expect(buildGrokArgs({ mode: "agent", model: "grok-4.5" } as any, "", undefined)).toEqual([
      "--no-auto-update",
      "-m",
      "grok-4.5",
    ]);
  });

  it("combines session, model, effort, and bypass flags", () => {
    expect(
      buildGrokArgs(
        {
          mode: "agent",
          model: "grok-4.5",
          effort: "high",
          approvalPolicy: "bypassPermissions",
        } as any,
        "",
        { kind: "new", sessionId: "abc-123" },
      ),
    ).toEqual([
      "--no-auto-update",
      "-s",
      "abc-123",
      "-m",
      "grok-4.5",
      "--reasoning-effort",
      "high",
      "--always-approve",
    ]);
  });
});

describe("buildGrokAcpArgs (`grok agent stdio` prefix)", () => {
  it("disables auto-update for a bare default config", () => {
    expect(buildGrokAcpArgs({} as any)).toEqual(["--no-auto-update"]);
  });

  it("never emits --permission-mode or --no-plan", () => {
    const args = buildGrokAcpArgs({
      mode: "plan",
      approvalPolicy: "bypassPermissions",
      effort: "high",
    } as any);
    expect(args).not.toContain("--permission-mode");
    expect(args).not.toContain("--no-plan");
  });

  it("forwards config.effort as --reasoning-effort", () => {
    expect(buildGrokAcpArgs({ effort: "medium" } as any)).toEqual([
      "--no-auto-update",
      "--reasoning-effort",
      "medium",
    ]);
  });

  it("adds --always-approve when approval policy bypasses permissions", () => {
    expect(buildGrokAcpArgs({ approvalPolicy: "bypassPermissions" } as any)).toEqual([
      "--no-auto-update",
      "--always-approve",
    ]);
  });

  it("passes -m <model> when set", () => {
    expect(buildGrokAcpArgs({ model: "grok-4.5" } as any)).toEqual([
      "--no-auto-update",
      "-m",
      "grok-4.5",
    ]);
  });
});
