import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  ProviderModelMenu,
  type ProviderModelMenuProvider,
} from "../../common/ProviderModelMenu/ProviderModelMenu";
import { buildProviderModelItems } from "../../common/ProviderModelMenu/parts/buildItems";
import "./index";

vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => false }));
const provider: ProviderModelMenuProvider = {
  kind: "grok",
  label: "Grok Build",
  capabilities: {
    models: [
      { id: "grok-4.6", label: "Grok 4.6" },
      { id: "grok-4.7", label: "Grok 4.7" },
    ],
    fastModels: ["grok-4.7"],
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
const favorite = {
  agentKind: "grok",
  modelId: "grok-4.7-build-fast",
  presentationMode: "terminal" as const,
};
beforeEach(() => {
  useSharedSettings.setState({
    favoriteModels: [favorite],
    recentModels: [],
    hiddenModels: {},
    providerConfigs: {},
    providerModelPreferences: {},
  });
});

it("sorts and marks the standard row using the legacy favorite", () => {
  const items = buildProviderModelItems({
    providers: [provider],
    search: "",
    favorites: [favorite],
  });
  expect(items.filter((item) => item.type === "model")[0]).toMatchObject({
    modelId: "grok-4.7",
    isFavorite: true,
  });
});

it("removes both saved aliases when unstarring the standard row", async () => {
  useSharedSettings.setState({ favoriteModels: [favorite, { ...favorite, modelId: "grok-4.7" }] });
  render(
    <ProviderModelMenu
      providers={[provider]}
      currentAgentKind="grok"
      currentModel="grok-4.6"
      onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Select model" }));
  const list = await screen.findByRole("listbox", { name: "Models" });
  fireEvent.click(within(list).getByRole("button", { name: "Remove from favorites" }));
  expect(useSharedSettings.getState().favoriteModels).toEqual([]);
});

it("preserves the Fast variant when selecting a legacy favorite shortcut", async () => {
  const onChange = vi.fn<(next: { agentKind: string; model: string }) => void>();
  render(
    <ProviderModelMenu
      providers={[provider, { ...provider, kind: "other", label: "Other" }]}
      currentAgentKind="grok"
      currentModel="grok-4.7"
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Select model" }));
  const list = await screen.findByRole("listbox", { name: "Models" });
  const option = within(list).getAllByRole("option", { name: /Grok 4\.7/u })[0]!;
  expect(within(option).getByRole("img", { name: "Fast mode" })).toBeInTheDocument();
  fireEvent.click(option);
  expect(onChange).toHaveBeenCalledWith({
    agentKind: "grok",
    model: "grok-4.7-build-fast",
    presentationMode: "terminal",
  });
});

it("deduplicates legacy and standard favorites across presentation modes", () => {
  const items = buildProviderModelItems({
    providers: [provider, { ...provider, kind: "other", label: "Other" }],
    search: "",
    favorites: [favorite, { ...favorite, modelId: "grok-4.7", presentationMode: "gui" }],
  });
  const shortcuts = items.filter((item) => item.type === "model" && item.id.startsWith("fav:"));
  expect(shortcuts).toHaveLength(1);
  expect(shortcuts[0]).toMatchObject({ id: "fav:grok:grok-4.7", modelId: "grok-4.7-build-fast" });
});
