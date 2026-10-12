import { useState } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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
  disabled = false,
  onPatch,
}: {
  initialModel?: string;
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
      controls={controls}
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
/** Full pointer gesture on the document in the browser's event order, so the
 * overlay's interact-outside machinery sees a real outside press. */
function pressOutside() {
  fireEvent.pointerDown(document.body, { button: 0, pointerId: 1, pointerType: "mouse" });
  fireEvent.mouseDown(document.body, { button: 0 });
  fireEvent.pointerUp(document.body, { button: 0, pointerId: 1, pointerType: "mouse" });
  fireEvent.mouseUp(document.body, { button: 0 });
  fireEvent.click(document.body, { button: 0 });
}

beforeEach(() => {
  delete (window as unknown as { poracode?: unknown }).poracode;
  useSharedSettings.setState({ favoriteModels: [], recentModels: [], hiddenModels: {} });
});
afterEach(() => {
  delete (window as unknown as { poracode?: unknown }).poracode;
});

describe("adjacent family selector menus with real overlays", () => {
  it.each(["mouse", "keyboard"])(
    "closes the global menu through %s, edits Main to a sibling pair, and restores ordinary controls",
    async (input) => {
      const onPatch = vi.fn<(patch: Partial<ThreadConfig>) => void>();
      render(<Harness onPatch={onPatch} />);
      expect(screen.queryByRole("button", { name: "Main" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Sidekick" })).not.toBeInTheDocument();
      const trigger = screen.getByRole("button", { name: "Select model" });
      if (input === "mouse") mouseClick(trigger);
      else {
        act(() => trigger.focus());
        enter(trigger);
      }
      const search = await screen.findByPlaceholderText("Search models...");
      expect(document.querySelector(".m-sheet-head")).not.toBeInTheDocument();
      act(() => search.focus());
      fireEvent.change(search, { target: { value: "Pair" } });
      // The relation offers one collapsed family row; picking it lands on the
      // family's current member.
      if (input === "mouse") mouseClick(await screen.findByRole("option", { name: /Pair/ }));
      else {
        await screen.findByRole("option", { name: /Pair/ });
        enter(search);
      }
      await waitFor(() => expect(search).not.toBeInTheDocument());
      // The pair's selectors show as their own composer menus; the ordinary
      // Fast toggle and the common Reasoning control sit beside them, once.
      const main = await screen.findByRole("button", { name: "Main" });
      expect(screen.getByRole("button", { name: "Sidekick" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Fast" })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: "Effort and context" })).toHaveLength(1);
      if (input === "mouse") mouseClick(main);
      else {
        act(() => main.focus());
        enter(main);
      }
      const mainSearch = await screen.findByPlaceholderText("Search models...");
      // While the selector menu is open the composer sits under the overlay's
      // aria-hidden scope, so the retained controls are queried with `hidden`.
      expect(screen.getAllByRole("button", { name: "Fast", hidden: true })).toHaveLength(1);
      act(() => mainSearch.focus());
      fireEvent.change(mainSearch, { target: { value: "Bet" } });
      expect(screen.queryByRole("option", { name: "Alpha" })).not.toBeInTheDocument();
      if (input === "mouse") mouseClick(await screen.findByRole("option", { name: "Beta" }));
      else {
        await screen.findByRole("option", { name: "Beta" });
        fireEvent.keyDown(mainSearch, { key: "ArrowDown" });
        enter(mainSearch);
      }
      await waitFor(() => expect(mainSearch).not.toBeInTheDocument());
      await waitFor(() => expect(onPatch).toHaveBeenLastCalledWith({ model: "pair-b-x" }));
      // The selector's second menu is untouched by the Main edit, and Fast is
      // never duplicated inside the selector popover.
      expect(screen.getByRole("button", { name: "Sidekick" })).toHaveTextContent("Support");
      if (input === "mouse") mouseClick(main);
      else {
        act(() => main.focus());
        enter(main);
      }
      const reopened = await screen.findByPlaceholderText("Search models...");
      act(() => reopened.focus());
      // An outside press after the search field took focus closes the popover
      // — the focus-containing dialog must not trap the dismissal.
      pressOutside();
      await waitFor(() => expect(reopened).not.toBeInTheDocument());
      mouseClick(trigger);
      const ordinarySearch = await screen.findByPlaceholderText("Search models...");
      act(() => ordinarySearch.focus());
      fireEvent.change(ordinarySearch, { target: { value: "Solo" } });
      await screen.findByRole("option", { name: /Solo/ });
      enter(ordinarySearch);
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Main" })).not.toBeInTheDocument(),
      );
      expect(screen.queryByRole("button", { name: "Sidekick" })).not.toBeInTheDocument();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      await waitFor(() => expect(trigger).toHaveTextContent("Solo"));
      expect(screen.getAllByRole("button", { name: "Effort and context" })).toHaveLength(1);
      // The ordinary model exposes no Fast control (it is not a fast model),
      // and no selector survives the return.
      expect(screen.queryByRole("button", { name: "Fast" })).not.toBeInTheDocument();
    },
  );

  it("disables both selector menus and the Fast toggle while configuration is disabled", async () => {
    render(<Harness initialModel="pair-a-x" disabled />);
    expect(screen.getByRole("button", { name: "Main" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sidekick" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fast" })).toBeDisabled();
  });

  it("shows the selector name as the sheet heading in the mobile drawer", async () => {
    (window as unknown as { poracode?: unknown }).poracode = { appVersion: "remote" };
    render(<Harness initialModel="pair-a-x" />);
    mouseClick(screen.getByRole("button", { name: "Main" }));
    expect(document.querySelector(".m-sheet-head")).toHaveTextContent("Main");
    const search = await screen.findByPlaceholderText("Search models...");
    expect(search).not.toHaveFocus();
    expect(await screen.findByRole("option", { name: "Alpha" })).toBeInTheDocument();
  });
});
