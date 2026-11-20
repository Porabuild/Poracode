import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import type { ProviderModelMenuProvider } from "@/renderer/components/common/ProviderModelMenu";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ModelVisibilityPopover } from "./ModelVisibilityPopover";
import { ModelVisibilityDropdown } from "./SingleAgentSettings/parts/ModelVisibilityDropdown";

it("Hide all persists every exact family UID and Show all persists an explicit empty override", async () => {
  const provider: ProviderModelMenuProvider = {
    kind: "example",
    label: "Example",
    capabilities: {
      models: [
        { id: "pair-a", label: "A" },
        { id: "pair-b", label: "B" },
        { id: "solo", label: "Solo" },
      ],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      settingDefs: [],
      modelFamilies: [
        {
          model: "pair-a",
          label: "Pair",
          bindings: { effort: "config", fast: "config" },
          selectors: [
            {
              id: "mate",
              labelKey: "modelSelection.sidekick",
              options: [
                { id: "a", label: "A" },
                { id: "b", label: "B" },
              ],
            },
          ],
          members: [
            { model: "pair-a", selections: { mate: "a" } },
            { model: "pair-b", selections: { mate: "b" } },
          ],
        },
      ],
    },
  };
  const onHiddenIdsChange = vi.fn<(visibilityKey: string, hiddenIds: string[]) => void>();
  renderWithI18n(
    <ModelVisibilityPopover
      providers={[provider]}
      hiddenIdsByKey={{ example: [] }}
      onHiddenIdsChange={onHiddenIdsChange}
      listAriaLabel="Models"
      summaryKind="visible"
      triggerAriaLabel="Model visibility"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Model visibility" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Hide all" })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Hide all" }));
  expect(onHiddenIdsChange).toHaveBeenLastCalledWith("example", ["pair-a", "pair-b", "solo"]);
  fireEvent.click(screen.getByRole("button", { name: "Show all" }));
  expect(onHiddenIdsChange).toHaveBeenLastCalledWith("example", []);
});

it("the unified profile selector preserves sibling-surface defaults when toggling one surface", async () => {
  useSharedSettings.setState({ hiddenModels: {} });
  const baseCaps = {
    efforts: [],
    modelEfforts: {},
    modes: [],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal" as const,
    presentationMode: "terminal" as const,
    settingDefs: [],
  };
  const terminalSurface: ProviderModelMenuProvider = {
    kind: "acme",
    label: "Acme",
    presentationMode: "terminal",
    hiddenModelsKey: "acme",
    capabilities: {
      ...baseCaps,
      models: [
        { id: "shared-current", label: "Shared Current" },
        { id: "terminal-legacy", label: "Terminal Legacy" },
      ],
      defaultHiddenModels: ["terminal-legacy"],
    },
  };
  const chatSurface: ProviderModelMenuProvider = {
    kind: "acme",
    label: "Acme",
    presentationMode: "gui",
    hiddenModelsKey: "acme",
    capabilities: {
      ...baseCaps,
      liveInputMode: "server",
      presentationMode: "gui",
      models: [
        { id: "shared-current", label: "Shared Current" },
        { id: "chat-next", label: "Chat Next" },
      ],
      defaultHiddenModels: [],
    },
  };

  renderWithI18n(
    <ModelVisibilityDropdown
      agent={{
        kind: "acme",
        label: "Acme",
        installed: true,
        authState: "authenticated",
        capabilities: {
          ...terminalSurface.capabilities,
          presentationModes: ["terminal", "gui"],
          presentationCapabilities: { gui: chatSurface.capabilities },
        },
      }}
    />,
  );

  expect(screen.getByRole("button", { name: "Visible models" })).toHaveTextContent("2 / 3");
  fireEvent.click(screen.getByRole("button", { name: "Visible models" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Hide all" })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("tab", { name: /Chat/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Acme · Chat" }));
  expect(useSharedSettings.getState().hiddenModels.acme?.toSorted()).toEqual([
    "chat-next",
    "shared-current",
    "terminal-legacy",
  ]);

  fireEvent.click(screen.getByRole("checkbox", { name: "Acme · Chat" }));
  expect(useSharedSettings.getState().hiddenModels.acme).toEqual(["terminal-legacy"]);
});
