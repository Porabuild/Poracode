// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentCapability } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { RENDERER_PROVIDER_MODULE_PATHS } from "./bootstrap";
import { getCommitGenDefaults } from "./commitGen";
import { getConflictResolverDefaults } from "./conflictResolver";
import {
  getProviderManifest,
  getProviderManifests,
  getProviderModelPickerRank,
  getProviderUtilityRank,
} from "./providerManifest";
import { getComposerControls, getConfigNormalizer } from "./providerComposer";
import { getGuiSlashCommands } from "./providerSlashCommands";
import { getTitleGenDefaults } from "./titleGen";
import { sortByAutoPreference } from "./utilityTask";

const EXPECTED_PROVIDER_ORDER = [
  "claude",
  "codex",
  "gemini",
  "qwen",
  "qoder",
  "grok",
  "kimi",
  "muse",
  "antigravity",
  "commandcode",
  "opencode",
  "pi",
  "cursor",
  "copilot",
  "factory",
] as const;

describe("renderer provider manifests", () => {
  it("discovers every chat provider in canonical order", () => {
    const manifests = getProviderManifests();

    expect(manifests.map((manifest) => manifest.kind)).toEqual(EXPECTED_PROVIDER_ORDER);
    expect(
      manifests.every((manifest) =>
        RENDERER_PROVIDER_MODULE_PATHS.includes(`./${manifest.kind}/index.tsx`),
      ),
    ).toBe(true);
  });

  it("keeps usage-only providers out of chat discovery and uses canonical labels", () => {
    expect(getProviderManifest("zai")).toBeUndefined();
    expect(i18n._(getProviderManifest("copilot")!.label)).toBe("GitHub Copilot");
    expect(i18n._(getProviderManifest("factory")!.label)).toBe("Factory Droid");
    expect(i18n._(getProviderManifest("pi")!.label)).toBe("Pi");
  });

  it("inherits base-provider ranks for scoped kinds and leaves unknown providers at the tail", () => {
    expect(getProviderManifest("claude:work")?.kind).toBe("claude");
    expect(getProviderModelPickerRank("claude:work")).toBe(getProviderModelPickerRank("claude"));
    expect(getProviderModelPickerRank("acp-generic:custom")).toBe(Number.MAX_SAFE_INTEGER);
    expect(getProviderUtilityRank("acp-generic:custom")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("uses the explicit utility order and preserves unknown-provider stability", () => {
    const candidates = [
      { kind: "acp-generic:first" },
      { kind: "antigravity" },
      { kind: "grok" },
      { kind: "claude:work" },
      { kind: "codex" },
      { kind: "acp-generic:second" },
    ];

    expect(sortByAutoPreference(candidates).map((candidate) => candidate.kind)).toEqual([
      "codex",
      "claude:work",
      "grok",
      "antigravity",
      "acp-generic:first",
      "acp-generic:second",
    ]);
  });

  it("bootstraps every provider-owned renderer registration", () => {
    for (const kind of EXPECTED_PROVIDER_ORDER) {
      expect(getComposerControls(kind), `${kind} composer controls`).toBeDefined();
      expect(getCommitGenDefaults(kind), `${kind} commit defaults`).toBeDefined();
      expect(getTitleGenDefaults(kind), `${kind} title defaults`).toBeDefined();
      expect(getConflictResolverDefaults(kind), `${kind} conflict defaults`).toBeDefined();
    }
    expect(getConfigNormalizer("codex")).toBeDefined();
    expect(getConfigNormalizer("antigravity")).toBeDefined();
    expect(getGuiSlashCommands("codex")).toBeDefined();
  });

  it("maps Antigravity permission aliases between terminal and ACP runtimes", () => {
    const normalize = getConfigNormalizer("antigravity")!;
    const baseCapabilities = {
      defaultApprovalPolicy: "default",
    } as AgentCapability;

    expect(
      normalize({
        capabilities: {
          ...baseCapabilities,
          approvalPolicies: [
            { id: "default", label: "Default" },
            { id: "auto_edit", label: "Auto Edit" },
            { id: "never", label: "YOLO" },
          ],
        },
        config: { model: "gemini-3.7-flash", approvalPolicy: "yolo" },
        presentationMode: "gui",
      }),
    ).toEqual({ approvalPolicy: "never" });

    expect(
      normalize({
        capabilities: {
          ...baseCapabilities,
          approvalPolicies: [
            { id: "default", label: "Default" },
            { id: "yolo", label: "YOLO" },
          ],
        },
        config: { model: "gemini-3.7-flash", approvalPolicy: "never" },
        presentationMode: "terminal",
      }),
    ).toEqual({ approvalPolicy: "yolo" });
  });

  it("never shows Antigravity Chat a permission id the server did not advertise", () => {
    const capabilities = {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [
        { id: "default", label: "Default" },
        { id: "auto_edit", label: "Auto Edit" },
        { id: "never", label: "YOLO" },
      ],
      sandboxModes: [],
      defaultApprovalPolicy: "never",
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      settingDefs: [],
    } as unknown as AgentCapability;
    const permissionControl = (approvalPolicy: string | undefined) =>
      getComposerControls("antigravity")!({
        capabilities,
        config: { model: "gemini-3.7-flash", ...(approvalPolicy ? { approvalPolicy } : {}) },
        isDisabled: false,
        onConfigChange: () => {},
        presentationMode: "gui",
      }).find((control) => "options" in control && control.iconKind === "permission");

    expect(permissionControl("auto_edit")).toMatchObject({ value: "auto_edit" });
    // A thread carrying the CLI's `yolo` used to render the raw id as its
    // label; it resolves to the equivalent advertised policy instead.
    expect(permissionControl("yolo")).toMatchObject({ value: "never" });
    expect(permissionControl(undefined)).toMatchObject({ value: "never" });
  });
});
