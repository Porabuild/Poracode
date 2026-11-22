import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { COMPUTER_USE_CORE_SKILL, COMPUTER_USE_MCP_INSTRUCTIONS } from "./instructions";
import computerUsePlugin from "../../../../resources/plugins/computer-use/plugin.json";
import { PORACODE_EXTENSION_NAMESPACE } from "@/shared/plugins/spec/extensions";

const CORE_SKILL_BODY = readFileSync(
  new URL(
    "../../../../resources/plugins/computer-use/skills/computer-use/SKILL.md",
    import.meta.url,
  ),
  "utf8",
);

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
    const walk = CORE_SKILL_BODY.indexOf("the host walks up");
    expect(walk).toBeGreaterThan(-1);
    expect(CORE_SKILL_BODY.slice(0, walk)).toContain("On macOS");
    expect(CORE_SKILL_BODY).toContain(
      "On Windows and Linux, use a node whose `find_elements` actions list includes `scroll`",
    );
  });

  it("treats set_value and clipped nodes as tree conventions, not click targets", () => {
    expect(CORE_SKILL_BODY).toContain("`scroll`, `context_menu` and `set_value` on every node");
    expect(CORE_SKILL_BODY).toContain("A node marked `clipped`");
    expect(CORE_SKILL_BODY).toContain("consecutive clipped siblings collapse to a count");
    expect(CORE_SKILL_BODY).toContain(
      "When a webarea sits beside browser chrome the text starts at the page",
    );
  });

  it("does not treat unverified invoke as a reason to fire the button twice", () => {
    expect(CORE_SKILL_BODY).toContain(
      "if a bundled observation already shows the effect, treat that as the check and do not retry",
    );
  });

  it("tells the agent to ask for a takeover rather than take one", () => {
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "stop and ask the user for a takeover instead of taking one",
    );
  });

  it("continues through a host unlock and stops when the Mac stays locked", () => {
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "If locked, call enable once before inspection",
    );
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "if still screen_locked or a locked_use_ note, stop and ask the user to unlock.",
    );
  });

  it("does not contradict the enabled locked-desktop flow", () => {
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).not.toContain("Locked desktops,");
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "Secure prompts, permission prompts, and password surfaces require the user.",
    );
  });

  it("ties idle locking to the user setting without changing it", () => {
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).toContain(
      "Prevent screen lock setting only stops idle locking; never change it yourself",
    );
    expect(COMPUTER_USE_MCP_INSTRUCTIONS).not.toContain("keepAwake:true");
  });

  // Testers paid this string on every session before the first tool call.
  // Keep the safety wording; detailed tree/scroll reference stays in the core skill.
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

  it("keeps bootstrap instructions compact while preserving safety rules", () => {
    expect(COMPUTER_USE_MCP_INSTRUCTIONS.length).toBeLessThan(2_200);
    expect(COMPUTER_USE_MCP_INSTRUCTIONS.length).toBeGreaterThan(900);
  });
});
