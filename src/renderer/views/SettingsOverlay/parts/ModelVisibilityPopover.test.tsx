import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import type { ProviderModelMenuProvider } from "@/renderer/components/common/ProviderModelMenu";
import { ModelVisibilityPopover } from "./ModelVisibilityPopover";

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
