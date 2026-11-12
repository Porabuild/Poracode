import { describe, expect, it } from "vitest";
import { buildKimiAcpArgs, buildKimiArgs, buildKimiContinueArgs, resolveKimiAcpMode } from "./argv";

describe("buildKimiArgs (TUI/PTY)", () => {
  it("emits nothing for a bare default config", () => {
    expect(buildKimiArgs({ mode: "agent" } as any, "", undefined)).toEqual([]);
  });

  it("passes --session <id> when resuming a discovered session", () => {
    expect(buildKimiArgs({ mode: "agent" } as any, "", "sess-123")).toEqual([
      "--session",
      "sess-123",
    ]);
  });

  it("passes -m <model> when set", () => {
    expect(buildKimiArgs({ mode: "agent", model: "k3" } as any, "", undefined)).toEqual([
      "-m",
      "k3",
    ]);
  });

  it("maps plan mode to --plan and never emits approval flags alongside it", () => {
    const args = buildKimiArgs({ mode: "plan", approvalPolicy: "yolo" } as any, "", undefined);
    expect(args).toContain("--plan");
    expect(args).not.toContain("--yolo");
    expect(args).not.toContain("--auto");
  });

  it("maps the most permissive policies to --auto", () => {
    for (const policy of ["auto", "bypassPermissions"]) {
      expect(
        buildKimiArgs({ mode: "agent", approvalPolicy: policy } as any, "", undefined),
      ).toEqual(["--auto"]);
    }
  });

  it("maps the terminal and saved GUI ask-when-needed policies to --yolo", () => {
    for (const policy of ["yolo", "never"]) {
      expect(
        buildKimiArgs({ mode: "agent", approvalPolicy: policy } as any, "", undefined),
      ).toEqual(["--yolo"]);
    }
  });

  it("does not emit an approval flag for the default policy", () => {
    const args = buildKimiArgs({ mode: "agent", approvalPolicy: "default" } as any, "", undefined);
    expect(args).not.toContain("--auto");
    expect(args).not.toContain("--yolo");
  });

  it("never combines --auto with --yolo", () => {
    for (const policy of ["auto", "yolo", "never", "bypassPermissions"]) {
      const args = buildKimiArgs({ mode: "agent", approvalPolicy: policy } as any, "", undefined);
      expect(args.includes("--auto") && args.includes("--yolo")).toBe(false);
    }
  });

  it("combines session, model, and approval flags", () => {
    expect(
      buildKimiArgs({ mode: "agent", model: "k3", approvalPolicy: "yolo" } as any, "", "sess-123"),
    ).toEqual(["--session", "sess-123", "-m", "k3", "--yolo"]);
  });
});

describe("buildKimiContinueArgs", () => {
  it("resumes the most recent session with --continue", () => {
    expect(buildKimiContinueArgs({ mode: "agent" } as any)).toEqual(["--continue"]);
  });

  it("forwards model and approval flags", () => {
    expect(
      buildKimiContinueArgs({ mode: "agent", model: "k3", approvalPolicy: "auto" } as any),
    ).toEqual(["--continue", "-m", "k3", "--auto"]);
  });
});

describe("buildKimiAcpArgs (`kimi acp` prefix)", () => {
  it("emits nothing for a bare default config", () => {
    expect(buildKimiAcpArgs({} as any)).toEqual([]);
  });

  it("never emits --plan or --session", () => {
    const args = buildKimiAcpArgs({ mode: "plan", approvalPolicy: "yolo" } as any);
    expect(args).not.toContain("--plan");
    expect(args).not.toContain("--session");
  });

  it("passes -m <model> and the approval flag", () => {
    expect(buildKimiAcpArgs({ model: "k3", approvalPolicy: "auto" } as any)).toEqual([
      "-m",
      "k3",
      "--auto",
    ]);
  });
});

describe("resolveKimiAcpMode", () => {
  it("maps full access and saved GUI selections to their native ACP modes", () => {
    const modes = ["default", "plan", "auto", "yolo"];
    expect(resolveKimiAcpMode({ model: "", approvalPolicy: "bypassPermissions" }, modes)).toBe(
      "auto",
    );
    expect(resolveKimiAcpMode({ model: "", approvalPolicy: "never" }, modes)).toBe("yolo");
    expect(
      resolveKimiAcpMode({ model: "", mode: "plan", approvalPolicy: "bypassPermissions" }, modes),
    ).toBe("plan");
  });
});
