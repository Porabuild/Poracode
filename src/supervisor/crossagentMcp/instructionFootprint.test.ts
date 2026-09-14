import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { CROSSAGENT_MCP_INSTRUCTIONS_BASE } from "./toolRegistry";

// Real hosts repeat initialize instructions in discovered tool descriptions.
// Budget the maintained source so detailed policies cannot silently move back there.
it("bounds repeated bootstrap and once-loaded coordination guidance", () => {
  const core = readFileSync(
    new URL(
      "../../../resources/plugins/subagent-delegation/skills/subagent-delegation/SKILL.md",
      import.meta.url,
    ),
    "utf8",
  );
  const review = readFileSync(
    new URL(
      "../../../resources/plugins/subagent-delegation/skills/parallel-review/SKILL.md",
      import.meta.url,
    ),
    "utf8",
  );
  expect(CROSSAGENT_MCP_INSTRUCTIONS_BASE.length * 5).toBeLessThan(3250);
  expect(core.length).toBeLessThan(5500);
  expect(review.length).toBeLessThan(1600);
  expect(core).toContain("Active steering is rare");
  expect(core).toContain("same provider session/context");
  expect(core).toContain("read-only research first");
  expect(core).toContain("Waits default to 480 seconds");
  expect(core).toContain("only for a specific missing fact");
});
