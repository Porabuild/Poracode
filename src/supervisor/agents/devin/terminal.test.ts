import { describe, expect, it } from "vitest";
import { detectDevinTerminalStatus } from "./terminal";

/** Pin the 3000.10.21-era heuristics: they are still the launch gate. */
describe("Devin terminal status detection", () => {
  it("reads idle from the TUI hint footer", () => {
    const hint = detectDevinTerminalStatus(
      "? for shortcuts                                        / for commands",
    );
    expect(hint?.status).toBe("idle");
  });

  it("reads working from the interrupt hint", () => {
    expect(detectDevinTerminalStatus("esc again to interrupt")?.status).toBe("working");
    expect(detectDevinTerminalStatus("Thinking...")?.status).toBe("working");
  });

  it("reads needs_approval from permission prompts", () => {
    expect(detectDevinTerminalStatus("Allow this command? [y/n]")?.attention).toBe(
      "needs_approval",
    );
  });

  it("returns null for unrelated scrollback", () => {
    expect(detectDevinTerminalStatus("some random output line")).toBeNull();
  });
});
