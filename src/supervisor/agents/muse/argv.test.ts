import { describe, expect, it } from "vitest";
import { buildMuseArgs, buildMuseConfigFlags, buildMuseResumeArgs } from "./argv";

describe("buildMuseConfigFlags", () => {
  it("always includes --trust-workspace", () => {
    expect(buildMuseConfigFlags({} as any)).toEqual(["--trust-workspace"]);
  });

  it("maps model and effort", () => {
    expect(buildMuseConfigFlags({ model: "muse-spark-1.2", effort: "xhigh" } as any)).toEqual([
      "--trust-workspace",
      "--model",
      "muse-spark-1.2",
      "--reasoning-effort",
      "xhigh",
    ]);
  });

  it("maps untrusted / on-request / never approval modes", () => {
    for (const policy of ["untrusted", "on-request", "never"] as const) {
      const args = buildMuseConfigFlags({ approvalPolicy: policy } as any);
      expect(args).toEqual(["--trust-workspace", "--approval-mode", policy]);
      expect(args).not.toContain("--yolo");
    }
  });

  it("maps yolo / bypassPermissions to --yolo", () => {
    for (const policy of ["yolo", "bypassPermissions"] as const) {
      const args = buildMuseConfigFlags({ approvalPolicy: policy } as any);
      expect(args).toContain("--yolo");
      expect(args).not.toContain("--approval-mode");
    }
  });
});

describe("buildMuseArgs", () => {
  it("appends a non-empty prompt as a trailing positional", () => {
    expect(buildMuseArgs({ model: "muse-spark-1.1" } as any, "hello")).toEqual([
      "--trust-workspace",
      "--model",
      "muse-spark-1.1",
      "hello",
    ]);
  });

  it("omits an empty / whitespace prompt", () => {
    expect(buildMuseArgs({} as any, "   ")).toEqual(["--trust-workspace"]);
    expect(buildMuseArgs({} as any)).toEqual(["--trust-workspace"]);
  });
});

describe("buildMuseResumeArgs", () => {
  it("emits resume <uuid> plus config flags", () => {
    expect(
      buildMuseResumeArgs("966713f1-794f-480e-aa37-713e8387fe8e", {
        model: "muse-spark-1.2",
        effort: "high",
        approvalPolicy: "on-request",
      } as any),
    ).toEqual([
      "resume",
      "966713f1-794f-480e-aa37-713e8387fe8e",
      "--trust-workspace",
      "--model",
      "muse-spark-1.2",
      "--reasoning-effort",
      "high",
      "--approval-mode",
      "on-request",
    ]);
  });

  it("maps bypass to --yolo on resume", () => {
    const args = buildMuseResumeArgs("sess", { approvalPolicy: "yolo" } as any);
    expect(args.slice(0, 2)).toEqual(["resume", "sess"]);
    expect(args).toContain("--yolo");
  });
});
