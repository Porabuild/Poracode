import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentRegistry, createAgentRegistry } from "./registry";
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

describe("profile agent registry", () => {
  it("registers Cursor profiles with their own adapter kinds", () => {
    const adapters = buildAgentRegistry([
      {
        id: "work",
        driver: "cursor",
        displayName: "Work",
        environment: { CURSOR_API_KEY: { value: "profile-key", sensitive: true } },
      },
    ]);

    expect(adapters.find((adapter) => adapter.kind === "cursor:work")).toMatchObject({
      label: "Cursor Work",
    });
    expect(
      adapters.find((adapter) => adapter.kind === "cursor:work")?.baseSpawnEnv,
    ).toBeUndefined();
  });
});

describe("first-class ACP registry aliases", () => {
  it("adopts antigravity-acp into the built-in adapter without a duplicate generic provider", () => {
    const adapters = buildAgentRegistry([
      {
        id: "antigravity-acp",
        driver: "acp-generic",
        displayName: "Google Antigravity",
        version: "1.0.0",
        config: { binary: "agy_acp_server.par", args: ["--uid="] },
      },
    ]);

    expect(adapters.filter((adapter) => adapter.kind === "antigravity")).toHaveLength(1);
    expect(adapters.some((adapter) => adapter.kind === "acp-generic:antigravity-acp")).toBe(false);
    expect(adapters.find((adapter) => adapter.kind === "antigravity")).toMatchObject({
      firstClassAcpRegistryId: "antigravity-acp",
      capabilities: { presentationModes: ["terminal", "gui"] },
    });
  });

  it("does not enable Chat from a disabled antigravity-acp instance", () => {
    const adapters = buildAgentRegistry([
      {
        id: "antigravity-acp",
        driver: "acp-generic",
        enabled: false,
        config: { binary: "agy_acp_server.par" },
      },
    ]);

    expect(adapters.find((adapter) => adapter.kind === "antigravity")?.capabilities).toMatchObject({
      presentationModes: ["terminal"],
    });
    expect(adapters.some((adapter) => adapter.kind === "acp-generic:antigravity-acp")).toBe(false);
  });
});
