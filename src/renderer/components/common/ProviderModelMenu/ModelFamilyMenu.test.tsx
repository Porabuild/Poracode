import { useState } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ModelFamilyMenu } from "./ModelFamilyMenu";
import type { ModelConfigurationPanelProps } from "./ModelConfigurationPanel";

function mouseClick(element: Element) {
  fireEvent.mouseDown(element, { button: 0 });
  // jsdom does not perform the browser's default focus on mouse down.
  if (element instanceof HTMLButtonElement) act(() => element.focus());
  fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element, { button: 0 });
}

function menuProps(): ModelConfigurationPanelProps {
  return {
    efforts: [
      { id: "low", label: "Low" },
      { id: "high", label: "High" },
    ],
    effortValue: "high",
    onEffortChange: vi.fn<(value: string) => void>(),
    contextSizes: [],
    hideLabelOnWrap: true,
    familySelection: {
      effortScope: "primary",
      columns: [
        {
          id: "lead",
          label: "Main",
          models: {
            options: [
              { id: "accepted-alpha", label: "Alpha" },
              { id: "accepted-beta", label: "Beta" },
            ],
            value: "accepted-alpha",
            onChange: vi.fn<(value: string) => void>(),
          },
          effort: {
            options: [{ id: "low", label: "Low" }],
            value: "low",
            onChange: vi.fn<(value: string) => void>(),
          },
        },
        {
          id: "sidekick",
          label: "Sidekick",
          models: {
            options: [{ id: "accepted-support", label: "Support" }],
            value: "accepted-support",
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
    },
  };
}

describe("ModelFamilyMenu", () => {
  it.each(["mouse", "Enter"])("opens the real HeroUI popover with %s", async (method) => {
    render(<ModelFamilyMenu {...menuProps()} />);
    const button = screen.getByRole("button", { name: "Model pairing" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    if (method === "mouse") mouseClick(button);
    else {
      act(() => button.focus());
      fireEvent.keyDown(button, { key: "Enter", code: "Enter" });
      fireEvent.keyUp(button, { key: "Enter", code: "Enter" });
    }
    const main = await screen.findByRole("combobox", { name: "Main" });
    const sidekick = screen.getByRole("combobox", { name: "Sidekick" });
    expect(main.compareDocumentPosition(sidekick) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.closest("[data-slot='combo-box-input-group']")).toHaveClass("h-9");
    expect(main.closest("[data-slot='combo-box-input-group']")?.className).toBe(
      sidekick.closest("[data-slot='combo-box-input-group']")?.className,
    );
    expect(screen.getByRole("button", { name: /Main reasoning/ })).toHaveTextContent("High");
    expect(screen.getByRole("button", { name: /Sidekick reasoning/ })).toHaveTextContent("Low");
    // Fast is the ordinary composer toggle — the pairing surface renders none.
    expect(screen.queryByRole("button", { name: "Fast" })).not.toBeInTheDocument();
  });

  it("filters Main options and keeps focus in the parent while nested selectors commit", async () => {
    const props = menuProps();
    const onClose = vi.fn<(open: boolean) => void>();
    function Harness() {
      const [model, setModel] = useState(props.familySelection.columns[0]!.models.value);
      return (
        <ModelFamilyMenu
          {...props}
          onOpenChange={onClose}
          familySelection={{
            ...props.familySelection,
            columns: props.familySelection.columns.map((column, index) =>
              index
                ? column
                : {
                    ...column,
                    models: {
                      ...column.models,
                      value: model,
                      onChange: (value) => {
                        column.models.onChange(value);
                        setModel(value);
                      },
                    },
                  },
            ),
          }}
        />
      );
    }
    render(<Harness />);
    mouseClick(screen.getByRole("button", { name: "Model pairing" }));
    const main = await screen.findByRole("combobox", { name: "Main" });
    const parent = main.closest('[role="dialog"]')!;
    act(() => main.focus());
    fireEvent.change(main, { target: { value: "bet" } });
    expect(await screen.findByRole("option", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Alpha" })).not.toBeInTheDocument();
    fireEvent.keyDown(main, { key: "ArrowDown" });
    fireEvent.keyDown(main, { key: "Enter" });
    expect(props.familySelection.columns[0]!.models.onChange).toHaveBeenCalledExactlyOnceWith(
      "accepted-beta",
    );
    await waitFor(() => expect(main).toHaveValue("Beta"));
    expect(parent).toBeInTheDocument();
    expect(main).toHaveFocus();

    const sidekickEffort = screen.getByRole("button", { name: /Sidekick reasoning/ });
    mouseClick(sidekickEffort);
    mouseClick(await screen.findByRole("option", { name: "High" }));
    expect(props.familySelection.columns[1]!.effort!.onChange).toHaveBeenCalledExactlyOnceWith(
      "high",
    );
    await waitFor(() => expect(sidekickEffort).toHaveFocus());
    expect(parent).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalledWith(false);

    const mainEffort = screen.getByRole("button", { name: /Main reasoning/ });
    mouseClick(mainEffort);
    mouseClick(await screen.findByRole("option", { name: "Low" }));
    expect(props.onEffortChange).toHaveBeenCalledExactlyOnceWith("low");
    expect(props.familySelection.columns[0]!.effort!.onChange).not.toHaveBeenCalled();
    // Primary-scope effort lives in the Main column; no shared footer and no
    // Fast field is rendered inside the pairing surface.
    expect(
      screen.queryByRole("region", { name: "Applies to both models" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fast" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Effort and context" })).not.toBeInTheDocument();
    expect(parent).toBeInTheDocument();
  });

  it("opens through the existing effort signal and respects disabled state", async () => {
    const props = menuProps();
    const { rerender } = render(<ModelFamilyMenu {...props} openSignal={0} isDisabled />);
    rerender(<ModelFamilyMenu {...props} openSignal={1} isDisabled />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    rerender(<ModelFamilyMenu {...props} openSignal={1} />);
    expect(await screen.findByRole("combobox", { name: "Main" })).toBeInTheDocument();
  });
});
