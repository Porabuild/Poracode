import { useState } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ThreadComposer } from "../../thread/ThreadComposer";
import {
  appendProviderComposerControls,
  buildModelPickerControls,
} from "../../thread/buildModelPickerControls";
import { registerComposerControls } from "../../providers/providerComposer";
import { modelFamilySelectorControls } from "../../providers/modelFamilyControls";

const kind = "test-model-settings";
const capabilities: AgentCapability = {
  models: [
    { id: "solo", label: "Solo" },
    { id: "pair-a-x", label: "Pair Alpha X" },
    { id: "pair-b-x", label: "Pair Beta X" },
  ],
  efforts: ["low", "high"],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  settingDefs: [],
  fastModels: ["pair-a-x", "pair-b-x"],
  modelFamilies: [
    {
      model: "pair-a-x",
      label: "Pair",
      bindings: { effort: "config", fast: "config" },
      selectors: [
        {
          id: "lead",
          labelKey: "modelSelection.lead",
          options: [
            { id: "a", label: "Alpha" },
            { id: "b", label: "Beta" },
          ],
        },
        {
          id: "sidekick",
          labelKey: "modelSelection.sidekick",
          options: [{ id: "x", label: "Support" }],
        },
      ],
      members: [
        { model: "pair-a-x", selections: { lead: "a", sidekick: "x" } },
        { model: "pair-b-x", selections: { lead: "b", sidekick: "x" } },
      ],
    },
  ],
};
registerComposerControls(kind, (input) =>
  modelFamilySelectorControls(input, {
    selectorLabel: (id) => (id === "lead" ? "Main" : "Sidekick"),
  }),
);

function Harness({
  initialModel = "solo",
  effortSignal = 0,
  disabled = false,
  onPatch,
}: {
  initialModel?: string;
  effortSignal?: number;
  disabled?: boolean;
  onPatch?: (patch: Partial<ThreadConfig>) => void;
}) {
  const [config, setConfig] = useState<ThreadConfig>({
    model: initialModel,
    effort: "high",
    fast: false,
  });
  const patch = (next: Partial<ThreadConfig>) => {
    onPatch?.(next);
    setConfig((current) => ({ ...current, ...next }));
  };
  const controls = appendProviderComposerControls(
    buildModelPickerControls({
      providers: [{ kind, label: "Agent", capabilities }],
      selectedAgentKind: kind,
      model: config.model!,
      effort: config.effort!,
      fast: config.fast!,
      capabilities,
      isDisabled: disabled,
      onProviderModelChange: ({ model }) => patch({ model }),
      onConfigPatch: patch,
    }),
    { agentKind: kind, capabilities, config, isDisabled: disabled, onConfigChange: patch },
  );
  return (
    <ThreadComposer
      toolbarOnly
      controls={controls.map((control) =>
        control.kind === "effort-context"
          ? { ...control, openSignal: effortSignal }
          : control.kind === "provider-model"
            ? { ...control, openSignal: 0 }
            : control,
      )}
      prompt=""
      placeholder="Prompt"
      submitDisabled
      submitLabel="Send"
      onPromptChange={() => {}}
      onSubmit={() => {}}
    />
  );
}

function mouseClick(element: Element) {
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element, { button: 0 });
}
function enter(element: Element) {
  fireEvent.keyDown(element, { key: "Enter", code: "Enter" });
  fireEvent.keyUp(element, { key: "Enter", code: "Enter" });
}

beforeEach(() => {
  delete (window as unknown as { poracode?: unknown }).poracode;
  useSharedSettings.setState({ favoriteModels: [], recentModels: [], hiddenModels: {} });
});
afterEach(() => {
  delete (window as unknown as { poracode?: unknown }).poracode;
});

describe("adjacent model pairing with real overlays", () => {
  it.each(["mouse", "keyboard"])(
    "closes the global menu through %s and independently edits the pair before returning to an ordinary model",
    async (input) => {
      const onPatch = vi.fn<(patch: Partial<ThreadConfig>) => void>();
      render(<Harness onPatch={onPatch} />);
      expect(screen.queryByRole("button", { name: "Model pairing" })).not.toBeInTheDocument();
      const trigger = screen.getByRole("button", { name: "Select model" });
      if (input === "mouse") mouseClick(trigger);
      else {
        act(() => trigger.focus());
        enter(trigger);
      }
      const search = await screen.findByPlaceholderText("Search models...");
      expect(screen.queryByRole("combobox", { name: "Main" })).not.toBeInTheDocument();
      expect(document.querySelector(".m-sheet-head")).not.toBeInTheDocument();
      act(() => search.focus());
      fireEvent.change(search, { target: { value: "Pair" } });
      if (input === "mouse") mouseClick(await screen.findByRole("option", { name: /Pair/ }));
      else {
        await screen.findByRole("option", { name: /Pair/ });
        enter(search);
      }
      await waitFor(() => expect(search).not.toBeInTheDocument());
      const pairing = await screen.findByRole("button", { name: "Model pairing" });
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      // Fast rides on the composer itself while pairing is closed.
      expect(await screen.findByRole("button", { name: "Fast" })).toBeInTheDocument();
      if (input === "mouse") mouseClick(pairing);
      else {
        act(() => pairing.focus());
        enter(pairing);
      }
      const primary = await screen.findByRole("combobox", { name: "Main" });
      expect(screen.queryByRole("button", { name: "Effort and context" })).not.toBeInTheDocument();
      // While pairing is open the composer sits under the overlay's
      // aria-hidden scope, so the retained toggle is queried with `hidden` —
      // it stays mounted, exactly once, outside the pairing dialog.
      expect(screen.getAllByRole("button", { name: "Fast", hidden: true })).toHaveLength(1);
      expect(screen.getByRole("button", { name: /Main reasoning/ })).toHaveTextContent("High");
      act(() => primary.focus());
      fireEvent.change(primary, { target: { value: "Bet" } });
      expect(await screen.findByRole("option", { name: "Beta" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Alpha" })).not.toBeInTheDocument();
      if (input === "mouse") mouseClick(screen.getByRole("option", { name: "Beta" }));
      else {
        fireEvent.keyDown(primary, { key: "ArrowDown" });
        enter(primary);
      }
      await waitFor(() => expect(primary).toHaveValue("Beta"));
      expect(primary).toHaveFocus();
      expect(onPatch).toHaveBeenLastCalledWith({ model: "pair-b-x" });
      expect(screen.getByRole("combobox", { name: "Sidekick" })).toBeInTheDocument();
      // Fast is never duplicated inside the pairing dialog, and the
      // config-bound relation resolves the composer toggle's edit to the
      // `{ fast }` carrier patch.
      const pairingDialog = primary.closest<HTMLElement>('[role="dialog"]')!;
      expect(
        within(pairingDialog).queryByRole("button", { name: "Fast", hidden: true }),
      ).not.toBeInTheDocument();
      const fastToggle = screen.getByRole("button", { name: "Fast", hidden: true });
      expect(fastToggle.closest('[role="dialog"]')).toBeNull();
      mouseClick(fastToggle);
      expect(onPatch).toHaveBeenLastCalledWith({ fast: true });
      // Escape closes only the nested dropdown, retaining the outer picker.
      fireEvent.keyDown(primary, { key: "ArrowDown" });
      expect(await screen.findByRole("option", { name: "Beta" })).toBeInTheDocument();
      fireEvent.keyDown(primary, { key: "Escape" });
      expect(screen.getByRole("combobox", { name: "Main" })).toBeInTheDocument();
      fireEvent.keyDown(primary.closest('[role="dialog"]')!, { key: "Escape" });
      await waitFor(() => expect(primary).not.toBeInTheDocument());
      mouseClick(trigger);
      const ordinarySearch = await screen.findByPlaceholderText("Search models...");
      expect(screen.queryByRole("combobox", { name: "Main" })).not.toBeInTheDocument();
      act(() => ordinarySearch.focus());
      fireEvent.change(ordinarySearch, { target: { value: "Solo" } });
      await screen.findByRole("option", { name: /Solo/ });
      enter(ordinarySearch);
      await waitFor(() =>
        expect(screen.queryByRole("combobox", { name: "Main" })).not.toBeInTheDocument(),
      );
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      await waitFor(() => expect(trigger).toHaveTextContent("Solo"));
      expect(screen.queryByRole("button", { name: "Model pairing" })).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Effort and context" })).toHaveLength(1);
      // The ordinary model exposes no Fast control (it is not a fast model),
      // and no family toggle survives the return.
      expect(screen.queryByRole("button", { name: "Fast" })).not.toBeInTheDocument();
    },
  );

  it("opens only the paired settings from the existing effort signal and respects disabled state", async () => {
    const { rerender } = render(<Harness initialModel="pair-a-x" />);
    expect(screen.queryByRole("combobox", { name: "Main" })).not.toBeInTheDocument();
    rerender(<Harness initialModel="pair-a-x" effortSignal={1} />);
    expect(await screen.findByRole("combobox", { name: "Main" })).toBeInTheDocument();
    rerender(<Harness initialModel="pair-a-x" effortSignal={1} disabled />);
    expect(screen.getByRole("combobox", { name: "Main" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Main reasoning/ })).toBeDisabled();
    // The disabled Fast control is the composer toggle, not a panel field; the
    // open pairing overlay aria-hides the composer, hence `hidden`.
    const fastToggle = await screen.findByRole("button", { name: "Fast", hidden: true });
    expect(fastToggle.closest('[role="dialog"]')).toBeNull();
    expect(fastToggle).toBeDisabled();
  });

  it("shows the same compact fields in the mobile sheet", async () => {
    (window as unknown as { poracode?: unknown }).poracode = { appVersion: "remote" };
    render(<Harness initialModel="pair-a-x" />);
    mouseClick(screen.getByRole("button", { name: "Model pairing" }));
    expect(await screen.findByRole("combobox", { name: "Main" })).toBeInTheDocument();
    expect(document.querySelector(".m-sheet-head")).toHaveTextContent("Model pairing");
    const primarySection = screen.getByRole("region", { name: "Main" });
    const secondarySection = screen.getByRole("region", { name: "Sidekick" });
    expect(primarySection.parentElement).toBe(secondarySection.parentElement);
    expect(primarySection.parentElement).toHaveClass("grid-cols-2", "items-stretch");
    expect(within(primarySection).getByRole("combobox")).not.toHaveFocus();
  });
});
