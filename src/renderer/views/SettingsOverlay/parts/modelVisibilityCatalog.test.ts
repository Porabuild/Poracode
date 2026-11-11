import { describe, expect, it } from "vitest";
import type { AgentCapability, AgentStatus } from "@/shared/contracts";
import type { NativeAgentRuntimeSlots } from "./nativeAgentRuntimes";
import {
  buildProviderVisibilityCatalog,
  computeSetAllVisibilityUpdates,
  computeTargetToggleUpdates,
  countVisibleModels,
  modelGroupCheckState,
  modelRowCheckState,
  resolveEffectiveHiddenIdsByKey,
} from "./modelVisibilityCatalog";

function makeCapabilities(overrides: Partial<AgentCapability> = {}): AgentCapability {
  return {
    models: [{ id: "m1", label: "Model 1" }],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    settingDefs: [],
    ...overrides,
  };
}

describe("buildProviderVisibilityCatalog", () => {
  it("collapses unnamed CLI and Chat catalogs into one provider with case-insensitive sub-provider grouping", () => {
    const agent: AgentStatus = {
      kind: "acme",
      label: "Acme",
      installed: true,
      authState: "authenticated",
      capabilities: makeCapabilities({
        presentationModes: ["terminal", "gui"],
        models: [
          { id: "vendor/shared-pro", label: "Shared Pro" },
          { id: "vendor/cli-only", label: "CLI Exclusive" },
        ],
        defaultHiddenModels: ["vendor/cli-only"],
        presentationCapabilities: {
          gui: {
            presentationMode: "gui",
            liveInputMode: "server",
            models: [
              // Mixed-case ID from structured catalog matching lowercase CLI ID.
              { id: "Vendor/Shared-Pro", label: "Shared Pro" },
              { id: "Vendor/Chat-Only", label: "Chat Exclusive" },
            ],
            defaultHiddenModels: [],
          },
        },
      }),
    };

    const { groups } = buildProviderVisibilityCatalog({ agents: [agent] });
    expect(groups).toHaveLength(1);
    const group = groups[0]!;
    expect(group.label).toBe("Acme");
    expect(group.surfaces.map((s) => s.label)).toEqual(["Terminal", "Chat"]);

    expect(
      group.unifiedModels.map((row) => ({
        label: row.label,
        surfaceBadges: row.surfaceBadges,
        targetIds: row.targets.flatMap((t) => t.modelIds),
      })),
    ).toEqual([
      {
        label: "Shared Pro",
        surfaceBadges: [],
        targetIds: ["Vendor/Shared-Pro", "vendor/shared-pro"],
      },
      {
        label: "Chat Exclusive",
        surfaceBadges: ["Chat"],
        targetIds: ["Vendor/Chat-Only"],
      },
      {
        label: "CLI Exclusive",
        surfaceBadges: ["Terminal"],
        targetIds: ["vendor/cli-only"],
      },
    ]);

    // Case-differing `Vendor` (GUI) and `vendor` (Terminal) merge into a single sub-header.
    const subHeaders = group.unifiedItems.filter((item) => item.type === "header-sub");
    expect(subHeaders).toHaveLength(1);
    expect(subHeaders[0]?.label).toBe("Vendor");
    expect(subHeaders[0]?.modelRows.map((row) => row.label)).toEqual([
      "Shared Pro",
      "Chat Exclusive",
      "CLI Exclusive",
    ]);
  });

  it("keeps a single-model redundant-label sub-provider independent from the preceding sub-provider", () => {
    const agent: AgentStatus = {
      kind: "multi-vendor",
      label: "Multi Vendor",
      installed: true,
      authState: "authenticated",
      capabilities: makeCapabilities({
        models: [
          { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5" },
          { id: "anthropic/claude-opus-5", label: "Claude Opus 5" },
          { id: "deepseek/deepseek", label: "DeepSeek" },
        ],
      }),
    };

    const { groups } = buildProviderVisibilityCatalog({ agents: [agent] });
    const items = groups[0]!.unifiedItems;
    const subHeaders = items.filter((item) => item.type === "header-sub");
    expect(subHeaders).toHaveLength(1);
    expect(subHeaders[0]?.label).toBe("Anthropic");
    expect(subHeaders[0]?.modelRows.map((row) => row.label)).toEqual([
      "Claude Sonnet 5",
      "Claude Opus 5",
    ]);

    const deepseekRow = groups[0]!.unifiedModels.find((row) => row.label === "DeepSeek");
    expect(deepseekRow?.subId).toBe("deepseek");
  });

  it("merges multi-runtime variants under one provider and tracks per-surface check states", () => {
    const cliCaps = makeCapabilities({
      runtimeLabel: "CLI",
      presentationMode: "terminal",
      presentationModes: ["terminal"],
      models: [
        { id: "shared-fast", label: "Shared Fast" },
        { id: "cli-legacy", label: "CLI Legacy" },
      ],
    });
    const acpCaps = makeCapabilities({
      runtimeLabel: "ACP",
      showRuntimeLabelInPicker: false,
      presentationMode: "gui",
      presentationModes: ["gui"],
      liveInputMode: "server",
      models: [
        { id: "shared-fast", label: "Shared Fast" },
        { id: "acp-next", label: "ACP Next" },
      ],
    });
    const slots = new Map<string, NativeAgentRuntimeSlots>([
      [
        "orbit",
        {
          runtimes: [
            { id: "cli", badge: "CLI" },
            { id: "acp", badge: "ACP" },
          ],
        } as unknown as NativeAgentRuntimeSlots,
      ],
    ]);

    const agent: AgentStatus = {
      kind: "orbit",
      label: "Orbit",
      installed: true,
      authState: "authenticated",
      capabilities: {
        ...cliCaps,
        presentationModes: ["terminal", "gui"],
        presentationCapabilities: { gui: acpCaps },
      },
      runtimeVariants: {
        cli: {
          presentationMode: "terminal",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: cliCaps,
        },
        acp: {
          presentationMode: "gui",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: acpCaps,
        },
      },
    };

    const { groups } = buildProviderVisibilityCatalog({
      agents: [agent],
      runtimeSlotsByBaseKind: slots,
    });
    expect(groups).toHaveLength(1);
    const group = groups[0]!;
    expect(group.surfaces.map((s) => ({ label: s.label, key: s.hiddenModelsKey }))).toEqual([
      { label: "CLI", key: "orbit" },
      { label: "ACP", key: "orbit-acp" },
    ]);

    const sharedRow = group.unifiedModels.find((m) => m.label === "Shared Fast")!;
    expect(sharedRow.surfaceBadges).toEqual([]);

    // Hidden only in CLI, still visible in ACP -> partial ("some") state, still counted visible.
    const partialHidden = new Map<string, ReadonlySet<string>>([
      ["orbit", new Set(["shared-fast"])],
      ["orbit-acp", new Set()],
    ]);
    expect(modelRowCheckState(sharedRow, partialHidden)).toBe("some");
    expect(modelGroupCheckState(group.unifiedModels, partialHidden)).toBe("some");
    expect(countVisibleModels(group.unifiedModels, partialHidden)).toBe(3);

    // Toggling a "some" unified row unhides it across every surface.
    const unhideUpdates = computeTargetToggleUpdates(sharedRow.targets, false, partialHidden);
    expect(Object.fromEntries(unhideUpdates)).toEqual({
      orbit: [],
      "orbit-acp": [],
    });

    // Toggling an "all" unified row hides it across both CLI and ACP keys.
    const emptyHidden = new Map<string, ReadonlySet<string>>();
    const hideUpdates = computeTargetToggleUpdates(sharedRow.targets, true, emptyHidden);
    expect(Object.fromEntries(hideUpdates)).toEqual({
      orbit: ["shared-fast"],
      "orbit-acp": ["shared-fast"],
    });
  });

  it("merges projected model families across surfaces and persists every exact member UID", () => {
    const selector = {
      id: "mate",
      labelKey: "modelSelection.sidekick" as const,
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    };
    const agent: AgentStatus = {
      kind: "fusion-agent",
      label: "Fusion Agent",
      installed: true,
      authState: "authenticated",
      capabilities: makeCapabilities({
        presentationModes: ["terminal", "gui"],
        models: [
          { id: "pair-t-a", label: "Pair T A" },
          { id: "pair-t-b", label: "Pair T B" },
          { id: "solo-t", label: "Solo T" },
        ],
        modelFamilies: [
          {
            model: "pair-t-a",
            label: "Composite",
            bindings: { effort: "config", fast: "config" },
            selectors: [selector],
            members: [
              { model: "pair-t-a", selections: { mate: "a" } },
              { model: "pair-t-b", selections: { mate: "b" } },
            ],
          },
        ],
        presentationCapabilities: {
          gui: {
            presentationMode: "gui",
            liveInputMode: "server",
            models: [
              { id: "pair-g-a", label: "Pair G A" },
              { id: "pair-g-b", label: "Pair G B" },
            ],
            modelFamilies: [
              {
                model: "pair-g-a",
                label: "Composite",
                bindings: { effort: "config", fast: "config" },
                selectors: [selector],
                members: [
                  { model: "pair-g-a", selections: { mate: "a" } },
                  { model: "pair-g-b", selections: { mate: "b" } },
                ],
              },
            ],
          },
        },
      }),
    };

    const { groups } = buildProviderVisibilityCatalog({ agents: [agent] });
    const group = groups[0]!;
    expect(group.unifiedModels.map((m) => m.label)).toEqual(["Composite", "Solo T"]);

    const hideAll = computeSetAllVisibilityUpdates([group], true);
    expect(hideAll.get("fusion-agent")?.toSorted()).toEqual([
      "pair-g-a",
      "pair-g-b",
      "pair-t-a",
      "pair-t-b",
      "solo-t",
    ]);
  });

  it("does not collapse a projected family row into an unprojected raw variant row", () => {
    const selector = {
      id: "mate",
      labelKey: "modelSelection.sidekick" as const,
      options: [
        { id: "1", label: "1" },
        { id: "2", label: "2" },
      ],
    };
    const agent: AgentStatus = {
      kind: "hybrid-family",
      label: "Hybrid Family",
      installed: true,
      authState: "authenticated",
      capabilities: makeCapabilities({
        presentationModes: ["terminal", "gui"],
        models: [
          { id: "pair-1", label: "Fusion (Pair 1)" },
          { id: "pair-2", label: "Fusion (Pair 2)" },
        ],
        modelFamilies: [
          {
            model: "pair-1",
            label: "Fusion",
            bindings: { effort: "config", fast: "config" },
            selectors: [selector],
            members: [
              { model: "pair-1", selections: { mate: "1" } },
              { model: "pair-2", selections: { mate: "2" } },
            ],
          },
        ],
        presentationCapabilities: {
          gui: {
            presentationMode: "gui",
            liveInputMode: "server",
            models: [
              { id: "pair-1", label: "Fusion (Pair 1)" },
              { id: "pair-2", label: "Fusion (Pair 2)" },
              { id: "gui-solo", label: "GUI Solo" },
            ],
            modelFamilies: [],
          },
        },
      }),
    };

    const { groups } = buildProviderVisibilityCatalog({ agents: [agent] });
    const rows = groups[0]!.unifiedModels;
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(
      rows.map((row) => ({
        label: row.label,
        surfaceBadges: row.surfaceBadges,
        targetIds: row.targets.flatMap((t) => t.modelIds),
      })),
    ).toEqual([
      { label: "Fusion (Pair 1)", surfaceBadges: ["Chat"], targetIds: ["pair-1"] },
      { label: "Fusion (Pair 2)", surfaceBadges: ["Chat"], targetIds: ["pair-2"] },
      { label: "GUI Solo", surfaceBadges: ["Chat"], targetIds: ["gui-solo"] },
      { label: "Fusion", surfaceBadges: ["Terminal"], targetIds: ["pair-1", "pair-2"] },
    ]);
  });

  it("orders groups by user providerOrder before fallback manifest rank", () => {
    const makeAgent = (kind: string, label: string): AgentStatus => ({
      kind,
      label,
      installed: true,
      authState: "authenticated",
      capabilities: makeCapabilities({ models: [{ id: `${kind}-1`, label: `${label} 1` }] }),
    });

    const { groups } = buildProviderVisibilityCatalog({
      agents: [makeAgent("alpha", "Alpha"), makeAgent("beta", "Beta"), makeAgent("gamma", "Gamma")],
      providerOrder: ["gamma", "alpha"],
    });
    expect(groups.map((g) => g.kind)).toEqual(["gamma", "alpha", "beta"]);
  });

  it("scopes surface-name search tokens per model without marking the whole provider as a hit", () => {
    const cliCaps = makeCapabilities({
      runtimeLabel: "CLI",
      presentationMode: "terminal",
      presentationModes: ["terminal"],
      fastModels: ["shared-m"],
      models: [
        { id: "shared-m", label: "Shared CLI Alias" },
        { id: "cli-only", label: "CLI Exclusive" },
      ],
    });
    const acpCaps = makeCapabilities({
      runtimeLabel: "ACP",
      presentationMode: "gui",
      presentationModes: ["gui"],
      liveInputMode: "server",
      models: [{ id: "shared-m", label: "Shared Model" }],
    });
    const agent: AgentStatus = {
      kind: "orbit",
      label: "Orbit",
      installed: true,
      authState: "authenticated",
      capabilities: {
        ...cliCaps,
        presentationModes: ["terminal", "gui"],
        presentationCapabilities: { gui: acpCaps },
      },
      runtimeVariants: {
        cli: {
          presentationMode: "terminal",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: cliCaps,
        },
        acp: {
          presentationMode: "gui",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: acpCaps,
        },
      },
    };

    const { groups } = buildProviderVisibilityCatalog({ agents: [agent] });
    const group = groups[0]!;
    expect(group.searchText).not.toContain("acp");
    expect(group.searchText).not.toContain("cli");

    const shared = group.unifiedModels.find((row) => row.label === "Shared Model")!;
    expect(shared.searchText).toContain("acp");
    expect(shared.searchText).toContain("cli");
    expect(shared.searchText).toContain("shared cli alias");
    expect(shared.searchText).toContain("fast");

    const cliOnly = group.unifiedModels.find((row) => row.label === "CLI Exclusive")!;
    expect(cliOnly.searchText).toContain("cli");
    expect(cliOnly.searchText).not.toContain("acp");
  });
});

describe("resolveEffectiveHiddenIdsByKey", () => {
  it("unions defaultHiddenModels across surfaces sharing a key without letting a subset overwrite them", () => {
    const terminal = {
      kind: "acme",
      label: "Acme",
      presentationMode: "terminal" as const,
      hiddenModelsKey: "acme",
      capabilities: makeCapabilities({
        models: [
          { id: "shared-current", label: "Current" },
          { id: "shared-old", label: "Shared Old" },
          { id: "terminal-old", label: "Terminal Old" },
        ],
        defaultHiddenModels: ["shared-old", "terminal-old"],
      }),
    };
    const chat = {
      kind: "acme",
      label: "Acme",
      presentationMode: "gui" as const,
      hiddenModelsKey: "acme",
      capabilities: makeCapabilities({
        models: [
          { id: "shared-current", label: "Current" },
          { id: "shared-old", label: "Shared Old" },
        ],
        defaultHiddenModels: ["shared-old"],
      }),
    };

    const resolved = resolveEffectiveHiddenIdsByKey([terminal, chat], {});
    expect(resolved.acme?.toSorted()).toEqual(["shared-old", "terminal-old"]);

    const explicitShowAll = resolveEffectiveHiddenIdsByKey([terminal, chat], { acme: [] });
    expect(explicitShowAll.acme).toEqual([]);
  });
});
