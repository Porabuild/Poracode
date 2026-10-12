import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

// The bundled skills are the procedure an agent loads before it touches the
// desktop, so they are part of this contract even though they ship as prose.
// They drifted once already: after the helper hints and the MCP instructions
// stopped offering `mode:"foreground"` as the way out of a refusal, both skills
// still said a refusal required it — leaving the refusal code itself reading as
// the licence to take over the user's desktop.
const SKILLS = [
  "resources/plugins/computer-use/skills/computer-use/SKILL.md",
  "resources/plugins/computer-use/skills/desktop-app-testing/SKILL.md",
].map((path) => [path, readFileSync(join(repoRoot, path), "utf8")] as const);

describe("bundled computer-use skills", () => {
  it("never treats a refusal as permission to take over", () => {
    for (const [path, body] of SKILLS) {
      expect({ path, licences: /refusal recommends it/i.test(body) }).toEqual({
        path,
        licences: false,
      });
      expect({
        path,
        licences: /background_unavailable[^.]*(requires|needs) explicit foreground/i.test(body),
      }).toEqual({ path, licences: false });
    }
  });

  it("ties takeover to the user asking for it, and names the background recovery", () => {
    for (const [path, body] of SKILLS) {
      expect({ path, asks: /only when the user asked for a takeover/i.test(body) }).toEqual({
        path,
        asks: true,
      });
      expect({ path, recovers: /invoke_element|set_element_value/.test(body) }).toEqual({
        path,
        recovers: true,
      });
    }
  });

  // Tree conventions and verified/refusal semantics are the MCP contract: they
  // are paid on every attached session. Skills that copy them drift and double
  // the token tax when a mention loads both layers.
  it("leaves the tree and verified contract to the MCP instructions", () => {
    for (const [path, body] of SKILLS) {
      expect({ path, restates: body.includes("consecutive clipped") }).toEqual({
        path,
        restates: false,
      });
      expect({ path, restates: body.includes("webarea sits beside") }).toEqual({
        path,
        restates: false,
      });
      expect({ path, restates: /"confirmed" means it watched/i.test(body) }).toEqual({
        path,
        restates: false,
      });
    }
  });
});
