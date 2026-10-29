import { describe, expect, it } from "vitest";
import type { OscProgramStatus } from "@/shared/osc";
import { programStatusOscHint } from "./terminalHints";

function status(
  state: OscProgramStatus["state"],
  kind: string | undefined = undefined,
): OscProgramStatus {
  return { code: 7501, state, kind, app: "demo", message: undefined };
}

describe("programStatusOscHint", () => {
  it("maps working to working", () => {
    expect(programStatusOscHint(status("working"))).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("maps blocked with permission kind to needs_approval", () => {
    expect(programStatusOscHint(status("blocked", "permission"))).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("maps blocked with question kind to needs_reply", () => {
    expect(programStatusOscHint(status("blocked", "question"))).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    });
  });

  it("maps blocked with an unknown kind to needs_reply", () => {
    expect(programStatusOscHint(status("blocked", "input"))).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    });
  });

  it("maps blocked without a kind to needs_reply", () => {
    expect(programStatusOscHint(status("blocked"))).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    });
  });

  it.each(["idle", "done", "error"] as const)("maps %s to idle", (state) => {
    expect(programStatusOscHint(status(state))).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("maps clear to null", () => {
    expect(programStatusOscHint(status("clear"))).toBeNull();
  });
});
