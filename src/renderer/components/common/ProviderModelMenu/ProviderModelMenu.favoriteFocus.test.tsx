import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ProviderModelMenu, type ProviderModelMenuProvider } from "./ProviderModelMenu";

function provider(kind: string): ProviderModelMenuProvider {
  return {
    kind,
    label: kind,
    capabilities: {
      models: [1, 2].map((n) => ({ id: `m${n}`, label: `Model ${n}` })),
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
    },
  };
}

const favorite = { agentKind: "agent", modelId: "m1", presentationMode: "terminal" as const };

beforeEach(() =>
  useSharedSettings.setState({
    favoriteModels: [favorite],
    recentModels: [],
    hiddenModels: {},
    providerConfigs: {},
    providerModelPreferences: {},
  }),
);

// Use the real drag library: its accessibility plugin must keep disabled
// drag metadata on the handle, rather than the still-selectable model row.
it.each([false, true])("retains favorite focus and row semantics (locked=%s)", async (locked) => {
  const onChange = vi.fn<(next: { agentKind: string; model: string }) => void>();
  render(
    <ProviderModelMenu
      providers={locked ? [provider("agent")] : [provider("agent"), provider("other")]}
      currentAgentKind="agent"
      currentModel="m1"
      presentationMode="terminal"
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Select model" }));
  const list = await screen.findByRole("listbox", { name: "Models" });
  // Finish the menu's existing 50ms opening focus before testing user focus.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
  const handle = within(list).getByRole("button", { name: "Reorder Model 1" });
  await waitFor(() => expect(handle).toHaveAttribute("aria-disabled", "false"));
  const row = handle.closest<HTMLElement>('[role="option"]')!;
  const toggle = within(row).getByRole("button", { name: "Remove from favorites" });
  act(() => toggle.focus());
  fireEvent.click(toggle);
  await waitFor(() => {
    expect(within(row).getByRole("button", { name: "Add to favorites" })).toHaveFocus();
    expect(handle).toHaveAttribute("aria-disabled", "true");
  });
  expect(document.getElementById(row.id)).toBe(row);
  expect(useSharedSettings.getState().favoriteModels).toEqual([]);
  expect(handle).toHaveAttribute("hidden");
  expect(within(row).queryByRole("button", { name: "Reorder Model 1" })).toBeNull();
  expect(row).not.toHaveAttribute("aria-disabled");
  expect(row).not.toHaveAttribute("aria-roledescription");
  expect(row).not.toHaveAttribute("aria-describedby");
  fireEvent.click(within(row).getByRole("button", { name: "Add to favorites" }));
  await waitFor(() => {
    expect(within(row).getByRole("button", { name: "Remove from favorites" })).toHaveFocus();
    expect(handle).toHaveAttribute("aria-disabled", "false");
  });
  expect(document.getElementById(row.id)).toBe(row);
  expect(within(row).getByRole("button", { name: "Reorder Model 1" })).toBe(handle);
  expect(handle).not.toHaveAttribute("hidden");
  expect(row).not.toHaveAttribute("aria-disabled");
  expect(row).not.toHaveAttribute("aria-roledescription");
  expect(row).not.toHaveAttribute("aria-describedby");
  expect(useSharedSettings.getState().favoriteModels).toEqual([favorite]);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  await waitFor(() => expect(handle).toHaveAttribute("aria-disabled", "true"));
  act(() => list.focus());
  fireEvent.keyDown(list, { key: "Enter" });
  expect(onChange).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ agentKind: "agent", model: "m1", selectionIntent: "exact" }),
  );
});
