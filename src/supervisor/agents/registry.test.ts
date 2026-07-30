import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentRegistry, createAgentRegistry } from "./registry";
import { buildUnrestrictedChildConfig } from "@/supervisor/subagentMcp/types";

const EXPECTED_BUILT_IN_ORDER = [
  "claude",
  "copilot",
  "codex",
  "gemini",
  "grok",
  "antigravity",
  "commandcode",
  "cursor",
  "opencode",
  "factory",
] as const;

const EXPECTED_SUBAGENT_APPROVAL_POLICY: Record<(typeof EXPECTED_BUILT_IN_ORDER)[number], string> =
  {
    claude: "bypassPermissions",
    copilot: "never",
    codex: "never",
    gemini: "never",
    grok: "bypassPermissions",
    antigravity: "yolo",
    commandcode: "yolo",
    cursor: "never",
    opencode: "yolo",
    factory: "auto-high",
  };

function detectionProviderKinds(): string[] {
  return readdirSync(import.meta.dirname, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(import.meta.dirname, entry.name, "detection.ts")),
    )
    .map((entry) => entry.name)
    .sort();
}

describe("built-in agent registry", () => {
  const adapters = createAgentRegistry();
  const kinds = adapters.map((adapter) => adapter.kind);

  it("preserves the intentional provider order", () => {
    expect(kinds).toEqual(EXPECTED_BUILT_IN_ORDER);
  });

  it("covers every provider directory with a detection spec", () => {
    expect([...kinds].sort()).toEqual(detectionProviderKinds());
  });

  it("registers every kind exactly once", () => {
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it.each(adapters.map((adapter) => [adapter.kind, adapter] as const))(
    "exposes nonempty identity metadata for %s",
    (_kind, adapter) => {
      expect(adapter.label.trim().length).toBeGreaterThan(0);
      expect(adapter.binary?.trim().length).toBeGreaterThan(0);
    },
  );

  it.each(adapters.map((adapter) => [adapter.kind, adapter] as const))(
    "declares an unrestricted subagent posture for %s",
    (kind, adapter) => {
      const approvalPolicy =
        EXPECTED_SUBAGENT_APPROVAL_POLICY[kind as keyof typeof EXPECTED_SUBAGENT_APPROVAL_POLICY];
      expect(approvalPolicy).toBeDefined();
      expect(buildUnrestrictedChildConfig({ model: "test" }, adapter.capabilities)).toMatchObject({
        model: "test",
        approvalPolicy,
        ...(kind === "codex" ? { sandboxMode: "danger-full-access" } : {}),
      });
    },
  );
});

describe("profile agent registry", () => {
  it("registers every supported home-isolated profile as a synthetic provider", () => {
    const adapters = buildAgentRegistry(
      (["codex", "copilot", "gemini", "grok"] as const).map((driver) => ({
        id: `${driver}-work`,
        driver,
        displayName: "Work",
        config: { homeDir: `~/.poracode/${driver}-profiles/work` },
      })),
    );

    expect(adapters.map((adapter) => adapter.kind)).toEqual(
      expect.arrayContaining([
        "codex:codex-work",
        "copilot:copilot-work",
        "gemini:gemini-work",
        "grok:grok-work",
      ]),
    );
  });

  it("skips malformed and disabled profiles", () => {
    const adapters = buildAgentRegistry([
      { id: "bad", driver: "codex", config: {} },
      {
        id: "disabled",
        driver: "grok",
        enabled: false,
        config: { homeDir: "~/.poracode/grok-profiles/disabled" },
      },
    ]);

    expect(adapters.some((adapter) => adapter.kind === "codex:bad")).toBe(false);
    expect(adapters.some((adapter) => adapter.kind === "grok:disabled")).toBe(false);
  });
});
