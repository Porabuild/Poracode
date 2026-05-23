import { describe, expect, it } from "vitest";
import { buildProjectDraftConfig } from "./draftConfig";

describe("buildProjectDraftConfig", () => {
  it("preserves explicit empty approvalPolicy and sandboxMode so 'Default permissions' survives reload", () => {
    const built = buildProjectDraftConfig({
      agentKind: "codex",
      config: {
        model: "gpt-5.5",
        approvalPolicy: "",
        sandboxMode: "",
      },
      worktreeMode: false,
    });
    expect(built.approvalPolicy).toBe("");
    expect(built.sandboxMode).toBe("");
  });

  it("preserves thread creation config fields used by later drafts", () => {
    expect(
      buildProjectDraftConfig({
        agentKind: "cursor",
        config: {
          model: "gpt-5.5",
          effort: "high",
          contextSize: "1m",
          fast: true,
          thinking: true,
          mode: "agent",
          approvalPolicy: "default",
          sandboxMode: "danger-full-access",
        },
        worktreeMode: true,
      }),
    ).toEqual({
      agentKind: "cursor",
      model: "gpt-5.5",
      effort: "high",
      contextSize: "1m",
      fast: true,
      thinking: true,
      mode: "agent",
      approvalPolicy: "default",
      sandboxMode: "danger-full-access",
      worktreeMode: true,
    });
  });
});
