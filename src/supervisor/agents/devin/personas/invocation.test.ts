import { describe, expect, it } from "vitest";
import {
  DEVIN_PERSONA_SKILL_PRECEDENCE,
  describeDevinPersonaInvocation,
  describeDevinSubagentSkillInvocation,
  devinPersonaRootAgentSupported,
} from "./invocation";

describe("native persona invocation", () => {
  it("targets a custom persona through the skill agent bridge", () => {
    const invocation = describeDevinPersonaInvocation({ id: "reviewer" });
    expect(invocation).toEqual({
      kind: "skill-agent",
      skillFrontmatter: { agent: "reviewer" },
      promptText: "Use the reviewer subagent for this task.",
    });
  });

  it("targets the built-in general child through subagent: true", () => {
    expect(describeDevinSubagentSkillInvocation().skillFrontmatter).toEqual({ subagent: true });
  });

  it("never offers custom personas as root agent types", () => {
    expect(devinPersonaRootAgentSupported()).toBe(false);
  });

  it("encodes the documented skill-vs-profile precedence", () => {
    expect(DEVIN_PERSONA_SKILL_PRECEDENCE).toEqual({
      modelWins: "skill",
      toolsWin: "persona",
      nesting: "subagent-skills-never-nest",
    });
  });
});
