import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAgentRegistry } from "./registry";
import { buildUnrestrictedChildConfig } from "@/supervisor/crossagentMcp/types";

const EXPECTED_BUILT_IN_ORDER = [
  "claude",
  "copilot",
  "codex",
  "gemini",
  "qwen",
  "qoder",
  "grok",
  "kimi",
  "muse",
  "antigravity",
  "commandcode",
  "cursor",
  "opencode",
  "pi",
  "factory",
] as const;

const EXPECTED_SUBAGENT_APPROVAL_POLICY: Record<(typeof EXPECTED_BUILT_IN_ORDER)[number], string> =
  {
    claude: "bypassPermissions",
    copilot: "never",
    codex: "never",
    gemini: "never",
    qwen: "never",
    qoder: "bypassPermissions",
    grok: "bypassPermissions",
    kimi: "yolo",
    muse: "yolo",
    antigravity: "yolo",
    commandcode: "yolo",
    cursor: "never",
    opencode: "yolo",
    pi: "never",
    factory: "auto-high",
  };

const EXPECTED_DEFAULT_APPROVAL_POLICY: Record<(typeof EXPECTED_BUILT_IN_ORDER)[number], string> = {
  claude: "auto",
  copilot: "never",
  codex: "on-request",
  gemini: "never",
  qwen: "auto",
  qoder: "bypassPermissions",
  grok: "bypassPermissions",
  kimi: "auto",
  muse: "on-request",
  antigravity: "yolo",
  commandcode: "yolo",
  cursor: "never",
  opencode: "yolo",
  pi: "never",
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
    "uses an automatic or bypass permission default for %s",
    (kind, adapter) => {
      expect(adapter.capabilities.defaultApprovalPolicy).toBe(
        EXPECTED_DEFAULT_APPROVAL_POLICY[kind as keyof typeof EXPECTED_DEFAULT_APPROVAL_POLICY],
      );
    },
  );

  it("defaults Codex to the Auto-review UI preset", () => {
    const codex = adapters.find((adapter) => adapter.kind === "codex");
    expect(codex?.capabilities.defaultApprovalsReviewer).toBe("auto_review");
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
