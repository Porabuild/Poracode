import { describe, expect, it } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import {
  countDiscoveredAgentGroups,
  discoveryCardRows,
  groupDiscoveredAgents,
  profileRowLabel,
} from "./agentDiscoveryGroups";

function makeStatus(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: "gpt-5.5", label: "5.5" }],
      efforts: ["low", "medium"],
      modelEfforts: {},
      modes: ["agent", "plan"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal", "gui"],
      settingDefs: [],
    },
    ...overrides,
  };
}

describe("groupDiscoveredAgents", () => {
  it("nests profiles under their base agent instead of separate cards", () => {
    const groups = groupDiscoveredAgents([
      makeStatus({ kind: "claude:qwen", label: "Claude Qwen" }),
      makeStatus({ kind: "claude", label: "Claude Code" }),
      makeStatus({ kind: "claude:zai", label: "Claude Z.AI" }),
      makeStatus({ kind: "cursor:work", label: "Cursor Work" }),
      makeStatus({ kind: "cursor", label: "Cursor" }),
    ]);

    expect(groups.map((group) => group.kind)).toEqual(["claude", "cursor"]);
    // The base status leads its group even though a profile arrived first.
    expect(groups[0]?.statuses.map((status) => status.kind)).toEqual([
      "claude",
      "claude:qwen",
      "claude:zai",
    ]);
    expect(groups[1]?.statuses.map((status) => status.kind)).toEqual(["cursor", "cursor:work"]);
  });

  it("keys a profile-only group by the base kind", () => {
    const groups = groupDiscoveredAgents([makeStatus({ kind: "codex:work", label: "Codex Work" })]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("codex");
    expect(groups[0]?.statuses.map((status) => status.kind)).toEqual(["codex:work"]);
  });

  it("keeps standalone registry agents as their own cards", () => {
    const groups = groupDiscoveredAgents([
      makeStatus({ kind: "acp-generic:opencode-2", label: "OpenCode 2" }),
      makeStatus({ kind: "acp-generic:muse-code", label: "Muse Code" }),
    ]);

    expect(groups.map((group) => group.kind)).toEqual([
      "acp-generic:opencode-2",
      "acp-generic:muse-code",
    ]);
  });

  it("keeps one kind found in several environments in one card, native first", () => {
    const groups = groupDiscoveredAgents([
      makeStatus({ kind: "claude", envKind: "wsl", envDistro: "Ubuntu" }),
      makeStatus({ kind: "claude", envKind: "wsl", envDistro: "Debian" }),
      makeStatus({ kind: "claude" }),
      makeStatus({
        kind: "claude:qwen",
        label: "Claude Qwen",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(
      groups[0]?.statuses.map((status) => `${status.kind}@${status.envDistro ?? "native"}`),
    ).toEqual(["claude@native", "claude@Debian", "claude@Ubuntu", "claude:qwen@Ubuntu"]);
  });

  it("preserves first-arrival order across unrelated agents", () => {
    const groups = groupDiscoveredAgents([
      makeStatus({ kind: "gemini", label: "Gemini" }),
      makeStatus({ kind: "claude:qwen", label: "Claude Qwen" }),
      makeStatus({ kind: "claude", label: "Claude Code" }),
    ]);

    expect(groups.map((group) => group.kind)).toEqual(["gemini", "claude"]);
  });
});

describe("discoveryCardRows", () => {
  const claudeGroup = () =>
    groupDiscoveredAgents([
      makeStatus({ kind: "claude:qwen", label: "Claude Qwen" }),
      makeStatus({ kind: "claude", label: "Claude Code" }),
    ])[0]!;

  it("single-env: header carries the base badge, profiles are the rows", () => {
    const rows = discoveryCardRows(claudeGroup(), false);
    expect(rows.header.kind).toBe("claude");
    expect(rows.base?.kind).toBe("claude");
    expect(rows.detail.map((status) => status.kind)).toEqual(["claude:qwen"]);
  });

  it("single-env without profiles: no detail rows", () => {
    const group = groupDiscoveredAgents([makeStatus({ kind: "codex" })])[0]!;
    const rows = discoveryCardRows(group, false);
    expect(rows.base?.kind).toBe("codex");
    expect(rows.detail).toEqual([]);
  });

  it("finds the base status even in a hand-built profile-first group", () => {
    const rows = discoveryCardRows(
      {
        kind: "claude",
        statuses: [
          makeStatus({ kind: "claude:qwen", label: "Claude Qwen" }),
          makeStatus({ kind: "claude", label: "Claude Code" }),
        ],
      },
      false,
    );
    expect(rows.header.kind).toBe("claude");
    expect(rows.base?.kind).toBe("claude");
    expect(rows.detail.map((status) => status.kind)).toEqual(["claude:qwen"]);
  });

  it("profile-only: no base for a header badge, profiles are the rows", () => {
    const group = groupDiscoveredAgents([
      makeStatus({ kind: "codex:work", label: "Codex Work" }),
    ])[0]!;
    const rows = discoveryCardRows(group, false);
    expect(rows.header.kind).toBe("codex:work");
    expect(rows.base).toBeUndefined();
    expect(rows.detail.map((status) => status.kind)).toEqual(["codex:work"]);
  });

  it("multi-env: every status is a row, base machines included", () => {
    const group = groupDiscoveredAgents([
      makeStatus({ kind: "claude", envKind: "wsl", envDistro: "Ubuntu" }),
      makeStatus({ kind: "claude" }),
      makeStatus({ kind: "claude:qwen", label: "Claude Qwen" }),
    ])[0]!;
    const rows = discoveryCardRows(group, true);
    expect(rows.detail).toHaveLength(3);
    expect(rows.detail).toBe(group.statuses);
  });
});

describe("profileRowLabel", () => {
  it("recovers the display name by stripping the driver word first", () => {
    expect(
      profileRowLabel(makeStatus({ kind: "claude:qwen", label: "Claude Qwen" }), "Claude Code"),
    ).toBe("Qwen");
    // A display name starting with the base label's second word survives.
    expect(
      profileRowLabel(
        makeStatus({ kind: "claude:review", label: "Claude Code Review" }),
        "Claude Code",
      ),
    ).toBe("Code Review");
  });

  it("falls back to the base label, then to the whole label", () => {
    // A label built from a base display name that does not start with the
    // driver word still shortens; anything else stays whole.
    expect(
      profileRowLabel(makeStatus({ kind: "claude:work", label: "Anthropic Work" }), "Anthropic"),
    ).toBe("Work");
    expect(
      profileRowLabel(makeStatus({ kind: "claude:work", label: "Work account" }), "Claude Code"),
    ).toBe("Work account");
  });
});

describe("countDiscoveredAgentGroups", () => {
  it("counts each base agent once, ignoring profiles, envs, and missing agents", () => {
    expect(
      countDiscoveredAgentGroups([
        makeStatus({ kind: "claude" }),
        makeStatus({ kind: "claude:qwen", label: "Claude Qwen" }),
        makeStatus({ kind: "claude", envKind: "wsl", envDistro: "Ubuntu" }),
        makeStatus({ kind: "acp-generic:opencode-2", label: "OpenCode 2" }),
        makeStatus({ kind: "gemini", label: "Gemini", installed: false }),
      ]),
    ).toBe(2);
  });
});
