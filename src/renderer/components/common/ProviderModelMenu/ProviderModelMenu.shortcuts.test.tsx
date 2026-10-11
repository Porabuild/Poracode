import type { ReactNode } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ProviderModelMenu, type ProviderModelMenuProvider } from "./ProviderModelMenu";

const dnd = vi.hoisted(() => ({
  start: undefined as ((event: DragStartEvent) => void) | undefined,
  end: undefined as ((event: DragEndEvent) => void) | undefined,
}));
vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: (props: {
    children: ReactNode;
    onDragStart: (event: DragStartEvent) => void;
    onDragEnd: (event: DragEndEvent) => void;
  }) => {
    dnd.start = props.onDragStart;
    dnd.end = props.onDragEnd;
    return props.children;
  },
}));
vi.mock("@dnd-kit/react/sortable", () => ({
  isSortable: () => true,
  useSortable: () => ({ ref: () => {}, handleRef: () => {}, isDragging: false }),
}));

function provider(kind: string): ProviderModelMenuProvider {
  return {
    kind,
    label: kind,
    capabilities: {
      models: [1, 2, 3, 4]
        .filter((n) => !useSharedSettings.getState().hiddenModels[kind]?.includes(`m${n}`))
        .map((n) => ({ id: `m${n}`, label: `Model ${n}` })),
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
const refs = [1, 2, 3].map((n) => ({
  agentKind: "agent",
  modelId: `m${n}`,
  presentationMode: "terminal" as const,
}));

async function open(locked = false, primary = provider("agent")) {
  const onChange = vi.fn<(next: { agentKind: string; model: string }) => void>();
  render(
    <ProviderModelMenu
      providers={locked ? [primary] : [primary, provider("other")]}
      currentAgentKind="agent"
      currentModel="m1"
      presentationMode="terminal"
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Select model" }));
  const list = await screen.findByRole("listbox", { name: "Models" });
  return { list, onChange };
}
function finish(id: string, index: number, canceled = false) {
  act(() => {
    dnd.start?.({ operation: { source: { id } } } as unknown as DragStartEvent);
    dnd.end?.({ canceled, operation: { source: { id, index } } } as unknown as DragEndEvent);
  });
}
function favoriteLabels(list: HTMLElement) {
  return within(list)
    .getAllByRole("button", { name: /^Reorder / })
    .map((button) => button.getAttribute("aria-label"));
}

beforeEach(() =>
  useSharedSettings.setState({
    favoriteModels: refs,
    recentModels: [],
    hiddenModels: {},
    providerConfigs: {},
    providerModelPreferences: {},
  }),
);

it("reorders favorites immediately and retains the order after reopening without selecting a model", async () => {
  const { list, onChange } = await open();
  finish("fav:agent:m3", 0);
  expect(favoriteLabels(list)).toEqual(["Reorder Model 3", "Reorder Model 1", "Reorder Model 2"]);
  expect(useSharedSettings.getState().favoriteModels).toEqual([refs[2], refs[0], refs[1]]);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Select model" }));
  expect(favoriteLabels(await screen.findByRole("listbox"))).toEqual([
    "Reorder Model 3",
    "Reorder Model 1",
    "Reorder Model 2",
  ]);
});

it("reorders locked-provider favorites in saved order", async () => {
  const { list } = await open(true);
  finish("model:agent:m3", 0);
  expect(favoriteLabels(list)).toEqual(["Reorder Model 3", "Reorder Model 1", "Reorder Model 2"]);
  expect(within(list).getAllByRole("option")[0]).toHaveTextContent("Model 3");
});

it("reorders the searched subset without moving a favorite excluded by search", async () => {
  const primary = provider("agent");
  primary.capabilities.models[0]!.label = "Alpha One";
  primary.capabilities.models[2]!.label = "Alpha Three";
  const { list } = await open(false, primary);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Alpha" } });
  await waitFor(() =>
    expect(favoriteLabels(list)).toEqual(["Reorder Alpha One", "Reorder Alpha Three"]),
  );
  finish("fav:agent:m3", 0);
  expect(favoriteLabels(list)).toEqual(["Reorder Alpha Three", "Reorder Alpha One"]);
  expect(useSharedSettings.getState().favoriteModels).toEqual([refs[2], refs[1], refs[0]]);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
  await waitFor(() =>
    expect(favoriteLabels(list)).toEqual([
      "Reorder Alpha Three",
      "Reorder Model 2",
      "Reorder Alpha One",
    ]),
  );
});

it("keeps group labels on locked favorites and removes emptied group headings", async () => {
  const primary = provider("agent");
  primary.capabilities.models = [
    { id: "one/m1", label: "Model 1" },
    { id: "two/m2", label: "Model 2" },
  ];
  primary.capabilities.subProviders = [
    { id: "one", label: "Group One" },
    { id: "two", label: "Group Two" },
  ];
  useSharedSettings.setState({
    favoriteModels: primary.capabilities.models.map((model) => ({
      agentKind: "agent",
      modelId: model.id,
      presentationMode: "terminal",
    })),
  });
  const { list } = await open(true, primary);
  expect(list.querySelector('[role="presentation"]')).toBeNull();
  expect(within(list).getByText("Group One").closest('[role="option"]')).toHaveTextContent(
    "Model 1",
  );
  finish("model:agent:two/m2", 0);
  expect(favoriteLabels(list)).toEqual(["Reorder Model 2", "Reorder Model 1"]);
  expect(list.querySelector('[role="presentation"]')).toBeNull();
});

it("keeps persisted aliases reorderable and removes the original favorite when unstarred", async () => {
  const alias = { ...refs[0]!, modelId: "m1[fast=true]" };
  useSharedSettings.setState({ favoriteModels: [alias, refs[1]!] });
  const { list } = await open(true);
  expect(favoriteLabels(list)).toEqual(["Reorder Model 1", "Reorder Model 2"]);
  finish("model:agent:m2", 0);
  expect(useSharedSettings.getState().favoriteModels).toEqual([refs[1], alias]);
  const row = within(list)
    .getByRole("button", { name: "Reorder Model 1" })
    .closest('[role="option"]')!;
  fireEvent.click(
    within(row as HTMLElement).getByRole("button", { name: "Remove from favorites" }),
  );
  expect(useSharedSettings.getState().favoriteModels).toEqual([refs[1]]);
});

it("preserves hidden, unavailable and other-presentation favorites while reordering visible rows", async () => {
  const hidden = { agentKind: "agent", modelId: "m2", presentationMode: "terminal" as const };
  const otherMode = { agentKind: "agent", modelId: "m4", presentationMode: "gui" as const };
  const unavailable = {
    agentKind: "unavailable",
    modelId: "m1",
    presentationMode: "terminal" as const,
  };
  useSharedSettings.setState({
    favoriteModels: [refs[0]!, hidden, otherMode, refs[2]!, unavailable],
    hiddenModels: { agent: ["m2"] },
  });
  const { list } = await open();
  finish("fav:agent:m3", 0);
  expect(favoriteLabels(list)).toEqual(["Reorder Model 3", "Reorder Model 1"]);
  expect(useSharedSettings.getState().favoriteModels).toEqual([
    refs[2],
    hidden,
    otherMode,
    refs[0],
    unavailable,
  ]);
});

it("keeps a canceled drag and an unchanged drop from persisting or selecting", async () => {
  const { onChange } = await open();
  const writes = vi.spyOn(Storage.prototype, "setItem");
  finish("fav:agent:m3", 0, true);
  finish("fav:agent:m1", 0);
  expect(useSharedSettings.getState().favoriteModels).toBe(refs);
  expect(writes).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  writes.mockRestore();
});

it("isolates handle activation and favorite keyboard actions from model selection", async () => {
  const { list, onChange } = await open();
  const handle = within(list).getByRole("button", { name: "Reorder Model 1" });
  expect(handle).toHaveAttribute("aria-roledescription", "Draggable model");
  fireEvent.click(handle);
  fireEvent.keyDown(handle, { key: " " });
  fireEvent.keyDown(within(list).getAllByRole("button", { name: "Remove from favorites" })[0]!, {
    key: "Enter",
  });
  expect(onChange).not.toHaveBeenCalled();
  expect(list).toBeInTheDocument();
});

it("allows Escape on a focused reorder handle to dismiss the picker", async () => {
  const { list, onChange } = await open();
  const handle = within(list).getByRole("button", { name: "Reorder Model 1" });
  act(() => handle.focus());
  fireEvent.keyDown(handle, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(onChange).not.toHaveBeenCalled();
});

it("keeps the picker open when the drag sensor has handled Escape", async () => {
  const { list } = await open();
  const handle = within(list).getByRole("button", { name: "Reorder Model 1" });
  act(() => handle.focus());
  const cancel = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  cancel.preventDefault();
  fireEvent(handle, cancel);
  expect(list).toBeInTheDocument();
});

it("keeps the drag source mounted when scrolling to distant favorite targets", async () => {
  const primary = provider("agent");
  primary.capabilities.models = Array.from({ length: 60 }, (_, index) => ({
    id: `m${index + 1}`,
    label: `Model ${index + 1}`,
  }));
  const favorites = primary.capabilities.models.slice(0, 50).map((model) => ({
    agentKind: "agent",
    modelId: model.id,
    presentationMode: "terminal" as const,
  }));
  useSharedSettings.setState({ favoriteModels: favorites });
  const { list } = await open(false, primary);
  act(() =>
    dnd.start?.({ operation: { source: { id: "fav:agent:m1" } } } as unknown as DragStartEvent),
  );
  list.scrollTop = 1000;
  fireEvent.scroll(list);
  expect(within(list).getByRole("button", { name: "Reorder Model 1" })).toBeInTheDocument();
  expect(within(list).getByRole("button", { name: "Reorder Model 45" })).toBeInTheDocument();
  finish("fav:agent:m1", 44);
  expect(useSharedSettings.getState().favoriteModels[44]).toEqual(favorites[0]);
  expect(list.scrollTop).toBe(1000);
});

it("places favorite and recent provider icons before labels and removes selected checkmarks", async () => {
  useSharedSettings.setState({
    recentModels: [{ agentKind: "other", modelId: "m4", presentationMode: "terminal" }],
  });
  const { list } = await open();
  for (const prefix of ["fav:agent:m1", "recent:other:m4"]) {
    const row = [...list.querySelectorAll('[role="option"]')].find((option) =>
      option.id.endsWith(prefix),
    )!;
    const icon = row.querySelector(".poracode-provider-icon")!;
    const name = within(row as HTMLElement).getByText(
      prefix.startsWith("fav") ? "Model 1" : "Model 4",
    );
    expect(icon.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
  for (const row of list.querySelectorAll('[aria-selected="true"]')) {
    expect(row.querySelector(".lucide-check")).toBeNull();
  }
});

it("removes a Recent shortcut immediately and after reopening without selecting or hiding the catalog model", async () => {
  const recent = { agentKind: "other", modelId: "m4", presentationMode: "terminal" as const };
  const otherMode = { ...recent, presentationMode: "gui" as const };
  useSharedSettings.setState({ recentModels: [recent, otherMode] });
  const { list, onChange } = await open();
  expect(within(list).getAllByRole("button", { name: "Remove from recent" })).toHaveLength(1);
  fireEvent.click(within(list).getByRole("button", { name: "Remove from recent" }));
  expect(useSharedSettings.getState().recentModels).toEqual([otherMode]);
  expect(onChange).not.toHaveBeenCalled();
  expect(list).toBeInTheDocument();
  expect(screen.getByRole("combobox")).toHaveFocus();
  expect(within(list).queryByText("Recent")).not.toBeInTheDocument();
  expect(
    within(list).queryByRole("button", { name: "Remove from recent" }),
  ).not.toBeInTheDocument();
  expect(within(list).getAllByText("Model 4")).toHaveLength(2);
  expect(useSharedSettings.getState().favoriteModels).toEqual(refs);
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Select model" }));
  expect(
    within(await screen.findByRole("listbox")).queryByRole("button", {
      name: "Remove from recent",
    }),
  ).not.toBeInTheDocument();
});

it("removes a searched Recent alias by its persisted identity while preserving the query", async () => {
  const recent = {
    agentKind: "other",
    modelId: "m4[fast=true]",
    presentationMode: "terminal" as const,
  };
  useSharedSettings.setState({ recentModels: [recent] });
  const { list, onChange } = await open();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Model 4" } });
  await waitFor(() =>
    expect(within(list).getAllByRole("button", { name: "Remove from recent" })).toHaveLength(1),
  );
  fireEvent.click(within(list).getByRole("button", { name: "Remove from recent" }));
  expect(useSharedSettings.getState().recentModels).toEqual([]);
  expect(screen.getByRole("combobox")).toHaveValue("Model 4");
  expect(within(list).getAllByRole("option")).toHaveLength(2);
  expect(within(list).queryByText("Recent")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
