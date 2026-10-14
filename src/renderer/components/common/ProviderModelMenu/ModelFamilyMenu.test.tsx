import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ModelFamilyMenu } from "./ModelFamilyMenu";
import type { ModelFamilyMenuSelection } from "./ModelConfigurationPanel.types";

function selection(): ModelFamilyMenuSelection {
  return {
    agentKind: "example",
    effortScope: "primary",
    columns: [
      {
        id: "lead",
        label: "Main",
        icon: null,
        models: {
          options: [
            { id: "a", label: "Alpha" },
            { id: "b", label: "Beta" },
          ],
          value: "a",
          onChange: vi.fn<(value: string) => void>(),
        },
      },
      {
        id: "sidekick",
        label: "Sidekick",
        icon: null,
        models: {
          options: [{ id: "x", label: "X" }],
          value: "x",
          onChange: vi.fn<(value: string) => void>(),
        },
        effort: {
          options: [
            { id: "low", label: "Low" },
            { id: "high", label: "High" },
          ],
          value: "low",
          onChange: vi.fn<(value: string) => void>(),
        },
      },
    ],
  };
}

function mouseClick(element: Element) {
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element, { button: 0 });
}

function pointerClick(element: Element) {
  fireEvent.pointerDown(element, {
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    clientX: 5,
    clientY: 5,
  });
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.pointerUp(element, {
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    clientX: 5,
    clientY: 5,
  });
  fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element, { button: 0 });
}

afterEach(() => {
  delete (window as unknown as { poracode?: unknown }).poracode;
});

describe("ModelFamilyMenu", () => {
  it("opens one panel and keeps it open while the standard model picker searches and selects", async () => {
    const familySelection = selection();
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(
      <ModelFamilyMenu
        familySelection={familySelection}
        efforts={[]}
        contextSizes={[]}
        onOpenChange={onOpenChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Model pairing" })).toHaveTextContent("Alpha + X");
    expect(screen.queryByRole("button", { name: "Main" })).not.toBeInTheDocument();
    mouseClick(screen.getByRole("button", { name: "Model pairing" }));
    const main = screen.getByRole("button", { name: "Main" });
    expect(main).not.toHaveClass("poracode-composer-menu");
    mouseClick(main);
    const search = await screen.findByPlaceholderText("Search models...");
    await waitFor(() => expect(search).toHaveFocus());
    fireEvent.change(search, { target: { value: "Bet" } });
    expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(search).not.toBeInTheDocument());
    expect(familySelection.columns[0]!.models.onChange).toHaveBeenCalledExactlyOnceWith("b");
    expect(screen.getByRole("region", { name: "Main" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Sidekick" })).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.queryByRole("button", { name: "Fast" })).not.toBeInTheDocument();
  });

  it.each(["Escape", "outside"])(
    "dismisses a nested picker with %s and then the panel on an outside press",
    async (action) => {
      render(<ModelFamilyMenu familySelection={selection()} efforts={[]} contextSizes={[]} />);
      mouseClick(screen.getByRole("button", { name: "Model pairing" }));
      mouseClick(screen.getByRole("button", { name: "Sidekick" }));
      const search = await screen.findByPlaceholderText("Search models...");
      await waitFor(() => expect(search).toHaveFocus());
      if (action === "Escape") fireEvent.keyDown(search, { key: "Escape" });
      else pointerClick(document.body);
      await waitFor(() => expect(search).not.toBeInTheDocument());
      expect(screen.getByRole("region", { name: "Main" })).toBeInTheDocument();
      pointerClick(document.body);
      await waitFor(() =>
        expect(screen.queryByRole("region", { name: "Main" })).not.toBeInTheDocument(),
      );
    },
  );

  it("uses standard reasoning menus for both columns and forwards deliberate re-picks", async () => {
    const familySelection = selection();
    const onEffortChange = vi.fn<(value: string) => void>();
    render(
      <ModelFamilyMenu
        familySelection={familySelection}
        efforts={[
          { id: "low", label: "Low" },
          { id: "high", label: "High" },
        ]}
        effortValue="high"
        onEffortChange={onEffortChange}
        contextSizes={[]}
      />,
    );
    mouseClick(screen.getByRole("button", { name: "Model pairing" }));
    mouseClick(screen.getByRole("button", { name: "Main reasoning" }));
    pointerClick(
      within(screen.getByRole("listbox", { name: "Reasoning" })).getByRole("option", {
        name: "High",
      }),
    );
    await waitFor(() => expect(onEffortChange).toHaveBeenCalledExactlyOnceWith("high"));
    expect(screen.getByRole("region", { name: "Main" })).toBeInTheDocument();
    mouseClick(screen.getByRole("button", { name: "Sidekick reasoning" }));
    mouseClick(
      within(screen.getByRole("listbox", { name: "Reasoning" })).getByRole("option", {
        name: "High",
      }),
    );
    await waitFor(() =>
      expect(familySelection.columns[1]!.effort!.onChange).toHaveBeenCalledExactlyOnceWith("high"),
    );
    expect(screen.getByRole("region", { name: "Sidekick" })).toBeInTheDocument();
  });

  it("renders a single pairing sheet on a compact client and returns to it after selecting a model", async () => {
    (window as unknown as { poracode: unknown }).poracode = { appVersion: "remote" };
    const familySelection = selection();
    render(<ModelFamilyMenu familySelection={familySelection} efforts={[]} contextSizes={[]} />);
    mouseClick(screen.getByRole("button", { name: "Model pairing" }));
    expect(document.querySelectorAll(".m-sheet-head")).toHaveLength(1);
    mouseClick(screen.getByRole("button", { name: "Main" }));
    expect(await screen.findByRole("listbox", { name: "Main" })).toBeInTheDocument();
    mouseClick(screen.getByRole("option", { name: "Beta" }));
    await waitFor(() =>
      expect(familySelection.columns[0]!.models.onChange).toHaveBeenCalledExactlyOnceWith("b"),
    );
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: "Sidekick" })).toBeInTheDocument();
  });
});
