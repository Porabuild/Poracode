import { describe, expect, it } from "vitest";

import { COMPUTER_USE_CORE_SKILL, COMPUTER_USE_MCP_INSTRUCTIONS } from "./instructions";
import computerUsePlugin from "../../../../resources/plugins/computer-use/plugin.json";
import { PORACODE_EXTENSION_NAMESPACE } from "@/shared/plugins/spec/extensions";

describe("computer use instructions", () => {
  // Wording order is the whole mechanism here: an agent that reads about
  // takeover before it reads the background-only rule treats foreground mode as
  // the sanctioned way out of a refusal, and every takeover interrupts the user.
  it("states the background-only rule before it mentions takeover", () => {
    const rule = COMPUTER_USE_MCP_INSTRUCTIONS.indexOf(
      "Background is the only mode you may choose on your own",
    );
    const takeover = COMPUTER_USE_MCP_INSTRUCTIONS.indexOf('mode:"foreground"');
    expect(rule).toBeGreaterThan(-1);
    expect(rule).toBeLessThan(takeover);
  });

  it("forbids window activation and mode switching as a workaround", () => {
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "Never activate or raise a window to make an action land",
    );
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "never alternate between background and foreground",
    );
  });

  // A browser window is the case that used to dead-end into takeover: it
  // refuses background coordinate input, so the instructions have to name the
  // element route that does work.
  it("routes a browser or Electron refusal to elements instead of takeover", () => {
    const browsers = COMPUTER_USE_MCP_INSTRUCTIONS.indexOf("A browser or Electron window");
    expect(browsers).toBeGreaterThan(-1);
    const recovery = COMPUTER_USE_MCP_INSTRUCTIONS.slice(browsers);
    expect(recovery).toContain("find_elements");
    expect(recovery).toContain("That refusal is not a reason to take the window over.");
  });

  it("does not promise a macOS-only scroll walk on every platform", () => {
    const walk = COMPUTER_USE_MCP_INSTRUCTIONS.indexOf("the host walks up");
    expect(walk).toBeGreaterThan(-1);
    expect(COMPUTER_USE_MCP_INSTRUCTIONS.slice(0, walk)).toContain("on macOS");
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "On Windows and Linux, use a node whose find_elements actions list includes scroll",
    );
  });

  it("treats set_value and clipped nodes as tree conventions, not click targets", () => {
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "scroll, context_menu and set_value on every node",
    );
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain("A node marked clipped");
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "consecutive clipped siblings collapse to a count",
    );
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "When a webarea sits beside browser chrome the text starts at the page",
    );
  });

  it("does not treat unverified invoke as a reason to fire the button twice", () => {
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "if a bundled observation already shows the effect, treat that as the check and do not retry",
    );
  });

  it("tells the agent to ask for a takeover rather than take one", () => {
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "stop and ask the user for a takeover instead of taking one",
    );
  });

  // Testers paid this string on every session before the first tool call.
  // Keep the safety wording; do not grow the tax back to a second page.
  it("tells the agent to load the plugin core skill before acting", () => {
    expect(COMPUTER_USE_CORE_SKILL).toBe(
      computerUsePlugin.extensions[PORACODE_EXTENSION_NAMESPACE].coreSkill,
    );
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      `load the ${COMPUTER_USE_CORE_SKILL} skill by name`,
    );
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "These instructions are the contract for every tool result",
    );
  });

  it("stays short enough to leave room for the task", () => {
    expect(COMPUTER_USE_MCP_INSTRUCTIONS.length).toBeLessThan(5_800);
    expect(COMPUTER_USE_MCP_INSTRUCTIONS.length).toBeGreaterThan(4_000);
  });
});
