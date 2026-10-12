import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ModelConfigurationPanel } from "./ModelConfigurationPanel";
import type { ModelFamilyMenuSelection } from "./ModelConfigurationPanel.types";

function selection(): ModelFamilyMenuSelection {
  return {
    columns: [
      {
        id: "primary",
        label: "Primary",
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
        id: "secondary",
        label: "Secondary",
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
    effortScope: "shared",
  };
}

function mouseClick(element: Element) {
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element, { button: 0 });
}

/** Full pointer gesture in the browser's event order, so the row-level
 * same-value activation channel sees the interaction. */
function pointerClick(element: Element) {
  fireEvent.pointerDown(element, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
  fireEvent.mouseDown(element, { button: 0 });
  fireEvent.pointerUp(element, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
  fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element, { button: 0 });
}

describe("ModelConfigurationPanel", () => {
  it("searches component models, selects exact keys, and uses compact effort dropdowns", async () => {
    const familySelection = selection();
    const onEffortChange = vi.fn<(value: string) => void>();
    const effortProps = {
      efforts: [
        { id: "low", label: "Low" },
        { id: "high", label: "High" },
      ],
      effortValue: "low",
      onEffortChange,
    };
    const { rerender } = render(
      <ModelConfigurationPanel
        familySelection={familySelection}
        {...effortProps}
        contextSizes={[]}
        mobile={false}
      />,
    );
    const primary = screen.getByRole("combobox", { name: "Primary" });
    act(() => primary.focus());
    fireEvent.change(primary, { target: { value: "Bet" } });
    expect(await screen.findByRole("option", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Alpha" })).not.toBeInTheDocument();
    fireEvent.keyDown(primary, { key: "ArrowDown" });
    fireEvent.keyDown(primary, { key: "Enter" });
    expect(familySelection.columns[0]!.models.onChange).toHaveBeenCalledWith("b");
    familySelection.columns[0]!.models.value = "b";
    rerender(
      <ModelConfigurationPanel
        familySelection={familySelection}
        {...effortProps}
        contextSizes={[]}
        mobile={false}
      />,
    );
    mouseClick(await screen.findByRole("button", { name: /Secondary reasoning/ }));
    mouseClick(await screen.findByRole("option", { name: "High" }));
    expect(familySelection.columns[1]!.effort!.onChange).toHaveBeenCalledWith("high");
    // Fast is the ordinary composer toggle, never a panel field; the shared
    // reasoning footer stays for the pair-wide effort carrier.
    const footer = within(screen.getByRole("region", { name: "Applies to both models" }));
    mouseClick(footer.getByRole("button", { name: /Reasoning/ }));
    mouseClick(await screen.findByRole("option", { name: "High" }));
    expect(onEffortChange).toHaveBeenCalledWith("high");
    expect(screen.queryByRole("button", { name: "Fast" })).not.toBeInTheDocument();
  });

  it("gives common primary effort precedence over encoded representative effort", async () => {
    const familySelection = selection();
    familySelection.effortScope = "primary";
    const encodedChange = vi.fn<(value: string) => void>();
    familySelection.columns[0]!.effort = {
      options: [{ id: "low", label: "Low" }],
      value: "low",
      onChange: encodedChange,
    };
    const onEffortChange = vi.fn<(value: string) => void>();
    render(
      <ModelConfigurationPanel
        familySelection={familySelection}
        efforts={[
          { id: "low", label: "Low" },
          { id: "high", label: "High" },
        ]}
        effortValue="high"
        onEffortChange={onEffortChange}
        contextSizes={[]}
        mobile={false}
      />,
    );
    const trigger = screen.getByRole("button", { name: /Primary reasoning/ });
    expect(trigger).toHaveTextContent("High");
    mouseClick(trigger);
    mouseClick(await screen.findByRole("option", { name: "Low" }));
    expect(onEffortChange).toHaveBeenCalledWith("low");
    expect(encodedChange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "Applies to both models" }),
    ).not.toBeInTheDocument();
  });

  it("disables all fields and renders no Fast control inside the panel", () => {
    const familySelection = selection();
    render(
      <ModelConfigurationPanel
        familySelection={familySelection}
        efforts={[]}
        contextSizes={[]}
        mobile
        isDisabled
      />,
    );
    expect(screen.getByRole("combobox", { name: "Primary" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Secondary reasoning/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Fast" })).not.toBeInTheDocument();
  });

  it("retains context reload confirmation", async () => {
    localStorage.clear();
    const onContextChange = vi.fn<(value: string) => void>();
    render(
      <ModelConfigurationPanel
        familySelection={selection()}
        efforts={[]}
        contextSizes={[
          { id: "small", label: "Small" },
          { id: "large", label: "Large" },
        ]}
        contextValue="small"
        onContextChange={onContextChange}
        confirmContextChange
        mobile={false}
      />,
    );
    mouseClick(screen.getByRole("button", { name: "Effort and context" }));
    mouseClick(await screen.findByText("Large"));
    expect(await screen.findByText("Change context size to Large?")).toBeInTheDocument();
    expect(onContextChange).not.toHaveBeenCalled();
    mouseClick(screen.getByRole("button", { name: "Change" }));
    expect(onContextChange).toHaveBeenCalledWith("large");
  });

  it("forwards a same-value shared-effort reselect without a reload ask", async () => {
    localStorage.clear();
    const onEffortChange = vi.fn<(value: string) => void>();
    render(
      <ModelConfigurationPanel
        familySelection={selection()}
        efforts={[
          { id: "low", label: "Low" },
          { id: "high", label: "High" },
        ]}
        effortValue="low"
        onEffortChange={onEffortChange}
        contextSizes={[
          { id: "small", label: "Small" },
          { id: "large", label: "Large" },
        ]}
        contextValue="small"
        onContextChange={vi.fn<(value: string) => void>()}
        confirmContextChange
        mobile={false}
      />,
    );
    const footer = within(screen.getByRole("region", { name: "Applies to both models" }));
    mouseClick(footer.getByRole("button", { name: /Reasoning/ }));
    pointerClick(await screen.findByRole("option", { name: "Low" }));
    expect(onEffortChange).toHaveBeenCalledTimes(1);
    expect(onEffortChange).toHaveBeenCalledWith("low");
  });

  it.each(["Enter", " "])(
    "forwards a same-value column effort keyboard reselect with %s",
    async (key) => {
      const familySelection = selection();
      render(
        <ModelConfigurationPanel
          familySelection={familySelection}
          efforts={[]}
          contextSizes={[]}
          mobile={false}
        />,
      );
      mouseClick(screen.getByRole("button", { name: /Secondary reasoning/ }));
      const option = await screen.findByRole("option", { name: "Low" });
      act(() => option.focus());
      fireEvent.keyDown(option, { key, repeat: true });
      expect(familySelection.columns[1]!.effort!.onChange).not.toHaveBeenCalled();
      fireEvent.keyDown(option, { key });
      fireEvent.keyUp(option, { key });
      expect(familySelection.columns[1]!.effort!.onChange).toHaveBeenCalledExactlyOnceWith("low");
    },
  );

  it("forwards a same-value column-effort reselect to the column owner", async () => {
    const familySelection = selection();
    render(
      <ModelConfigurationPanel
        familySelection={familySelection}
        efforts={[]}
        contextSizes={[]}
        mobile={false}
      />,
    );
    mouseClick(screen.getByRole("button", { name: /Secondary reasoning/ }));
    pointerClick(await screen.findByRole("option", { name: "Low" }));
    expect(familySelection.columns[1]!.effort!.onChange).toHaveBeenCalledTimes(1);
    expect(familySelection.columns[1]!.effort!.onChange).toHaveBeenCalledWith("low");
  });

  it("forwards a same-value component-model reselect through the searchable field", async () => {
    const familySelection = selection();
    render(
      <ModelConfigurationPanel
        familySelection={familySelection}
        efforts={[]}
        contextSizes={[]}
        mobile={false}
      />,
    );
    const primary = screen.getByRole("combobox", { name: "Primary" });
    act(() => primary.focus());
    fireEvent.keyDown(primary, { key: "ArrowDown" });
    fireEvent.keyDown(primary, { key: "Enter" });
    expect(familySelection.columns[0]!.models.onChange).toHaveBeenCalledWith("b");
    familySelection.columns[0]!.models.value = "b";
    // Re-open and re-activate the already-selected member: the library reports
    // the equal selection itself, so the owner still sees the touch.
    act(() => primary.focus());
    fireEvent.change(primary, { target: { value: "" } });
    mouseClick(await screen.findByRole("option", { name: "Beta" }));
    expect(familySelection.columns[0]!.models.onChange).toHaveBeenLastCalledWith("b");
  });
});
