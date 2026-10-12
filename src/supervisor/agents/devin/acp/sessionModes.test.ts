import { describe, expect, it } from "vitest";
import { resolveDevinAcpMode } from "./sessionModes";

// Live 3000.11.3 session mode ids (tmp/devin/acp-contracts.md §3).
const LIVE_MODES = ["accept-edits", "smart", "ask", "plan", "bypass"];

describe("Devin negotiated ACP mode mapping", () => {
  it("keeps the legacy GUI Bypass default for unconfigured turns", () => {
    expect(resolveDevinAcpMode({ model: "", mode: "agent" }, LIVE_MODES)).toBe("bypass");
  });
  it("sends every explicit negotiated selection verbatim", () => {
    for (const modeId of LIVE_MODES) {
      const config =
        modeId === "plan"
          ? { model: "", mode: "plan" as const }
          : { model: "", mode: "agent" as const, approvalPolicy: modeId };
      expect(resolveDevinAcpMode(config, LIVE_MODES)).toBe(modeId);
    }
  });
  it("maps stored canonical and CLI alias policies onto negotiated ids", () => {
    expect(
      resolveDevinAcpMode({ model: "", mode: "agent", approvalPolicy: "auto_edit" }, LIVE_MODES),
    ).toBe("accept-edits");
    expect(
      resolveDevinAcpMode({ model: "", mode: "agent", approvalPolicy: "default" }, LIVE_MODES),
    ).toBe("accept-edits");
    expect(
      resolveDevinAcpMode({ model: "", mode: "agent", approvalPolicy: "never" }, LIVE_MODES),
    ).toBe("bypass");
    expect(
      resolveDevinAcpMode({ model: "", mode: "agent", approvalPolicy: "normal" }, LIVE_MODES),
    ).toBe("smart");
    expect(
      resolveDevinAcpMode({ model: "", mode: "agent", approvalPolicy: "yolo" }, LIVE_MODES),
    ).toBe("bypass");
    expect(
      resolveDevinAcpMode(
        { model: "", mode: "autopilot", approvalPolicy: "autopilot" },
        LIVE_MODES,
      ),
    ).toBe("bypass");
  });
  it("round-trips the raw ids the shared mapper stores from Devin's mode list", () => {
    // mapAcpModes stores unmapped Devin ids verbatim as approval policies;
    // those stored ids must resolve back to the same negotiated mode.
    for (const stored of ["accept-edits", "smart", "ask", "bypass"]) {
      expect(
        resolveDevinAcpMode({ model: "", mode: "agent", approvalPolicy: stored }, LIVE_MODES),
      ).toBe(stored);
    }
  });
  it("keeps the agent's own mode when an explicit selection is not offered", () => {
    expect(
      resolveDevinAcpMode({ model: "", mode: "agent", approvalPolicy: "ask" }, [
        "accept-edits",
        "bypass",
      ]),
    ).toBeUndefined();
    expect(
      resolveDevinAcpMode({ model: "", mode: "plan" }, ["accept-edits", "bypass"]),
    ).toBeUndefined();
  });
  it("falls back to the shared generic mapper when Devin stops offering Bypass", () => {
    expect(resolveDevinAcpMode({ model: "", mode: "agent" }, ["accept-edits", "ask"])).toBe(
      "accept-edits",
    );
    expect(resolveDevinAcpMode({ model: "", mode: "agent" }, ["code"])).toBe("code");
    expect(resolveDevinAcpMode({ model: "", mode: "agent" }, [])).toBeUndefined();
  });
});
