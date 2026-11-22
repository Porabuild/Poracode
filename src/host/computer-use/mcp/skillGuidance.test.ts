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

  // Tree conventions and verified/refusal semantics live once in the core
  // computer-use skill (loaded on demand) instead of being paid on every
  // session's MCP initialize instructions or duplicated into secondary skills.
  it("keeps the tree and verified contract once in the core skill, not duplicated in secondary skills", () => {
    for (const [path, body] of SKILLS) {
      const isCore = path.endsWith("skills/computer-use/SKILL.md");
      expect({ path, hasContract: body.includes("consecutive clipped") }).toEqual({
        path,
        hasContract: isCore,
      });
      expect({ path, hasContract: body.includes("webarea sits beside") }).toEqual({
        path,
        hasContract: isCore,
      });
      expect({ path, hasContract: /`?"confirmed"`? means it watched/i.test(body) }).toEqual({
        path,
        hasContract: isCore,
      });
    }
  });
});
