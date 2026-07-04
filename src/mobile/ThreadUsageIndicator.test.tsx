// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveThreadUsageProviderId } from "./ThreadUsageIndicator";

describe("resolveThreadUsageProviderId", () => {
  it("matches a plain provider by its agentKind", () => {
    expect(resolveThreadUsageProviderId({ agentKind: "claude" }, ["claude", "codex"])).toBe(
      "claude",
    );
  });

  it("prefers a <base>:<instance> composite when the plain kind is absent", () => {
    expect(
      resolveThreadUsageProviderId({ agentKind: "claude", agentInstanceId: "work" }, [
        "claude:work",
        "codex",
      ]),
    ).toBe("claude:work");
  });

  it("matches an instance-scoped agentKind directly", () => {
    expect(resolveThreadUsageProviderId({ agentKind: "claude:work" }, ["claude:work"])).toBe(
      "claude:work",
    );
  });

  it("falls back to any snapshot sharing the base provider", () => {
    expect(resolveThreadUsageProviderId({ agentKind: "codex" }, ["codex:acct1"])).toBe(
      "codex:acct1",
    );
  });

  it("returns the raw kind when nothing matches (ring still renders empty)", () => {
    expect(resolveThreadUsageProviderId({ agentKind: "gemini" }, ["claude"])).toBe("gemini");
  });
});
