import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ApprovalActions } from "./ApprovalActions";

describe("approval option descriptions", () => {
  it("keeps identically labelled permission scopes inspectable and selects their own IDs", async () => {
    const onSelect = vi.fn<(id: string) => void>();
    const { getAllByRole, findByRole } = render(
      <AppProvider>
        <ApprovalActions
          requestType="tool_call_approval"
          isDisabled={false}
          showAllOptions
          options={[
            { optionId: "accept", label: "Allow once" },
            { optionId: "domain-a", label: "Always allow", description: "domain:example.com" },
            { optionId: "domain-b", label: "Always allow", description: "domain:example.org" },
            { optionId: "decline", label: "Deny" },
          ]}
          onSelect={onSelect}
        />
      </AppProvider>,
    );
    const [first, second] = getAllByRole("button", { name: "Always allow" });
    expect(first).toHaveAccessibleDescription("domain:example.com");
    expect(second).toHaveAccessibleDescription("domain:example.org");
    fireEvent.keyDown(document.body, { key: "Tab" });
    first!.focus();
    expect(await findByRole("tooltip")).toHaveTextContent("domain:example.com");
    fireEvent.click(first!);
    fireEvent.click(second!);
    expect(onSelect.mock.calls).toEqual([["domain-a"], ["domain-b"]]);
  });
});

const permissionOptions = [
  { optionId: "accept", label: "Allow once" },
  { optionId: "always", label: "Always allow" },
  { optionId: "decline", label: "Deny" },
];

describe("numbered approval actions", () => {
  it("keeps provider order and activates the displayed shortcut once", () => {
    const onSelect = vi.fn<(id: string) => void>();
    const { getAllByRole } = render(
      <AppProvider>
        <ApprovalActions
          requestType="tool_call_approval"
          isDisabled={false}
          showAllOptions
          options={permissionOptions}
          onSelect={onSelect}
        />
      </AppProvider>,
    );
    const buttons = getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "1Allow once",
      "2Always allow",
      "3Deny",
    ]);
    buttons.forEach((button, index) =>
      expect(button).toHaveAttribute("aria-keyshortcuts", String(index + 1)),
    );
    fireEvent.keyDown(buttons[0]!, { key: "3", repeat: true });
    fireEvent.keyDown(buttons[0]!, { key: "2", ctrlKey: true });
    fireEvent.keyDown(buttons[0]!, { key: "1", isComposing: true });
    fireEvent.keyDown(buttons[0]!, { key: "4" });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(buttons[0]!, { key: "3" });
    expect(onSelect.mock.calls).toEqual([["decline"]]);
    expect(buttons[2]).toHaveFocus();
  });

  it("leaves typing alone and blocks shortcuts while resolving", () => {
    const onSelect = vi.fn<(id: string) => void>();
    const view = (isDisabled: boolean) => (
      <AppProvider>
        <input aria-label="Composer" />
        <ApprovalActions
          requestType="tool_call_approval"
          isDisabled={isDisabled}
          showAllOptions
          leadingAction={<input aria-label="Approval note" />}
          options={permissionOptions}
          onSelect={onSelect}
        />
      </AppProvider>
    );
    const { getByRole, rerender } = render(view(false));
    fireEvent.keyDown(getByRole("textbox", { name: "Composer" }), { key: "1" });
    fireEvent.keyDown(getByRole("textbox", { name: "Approval note" }), { key: "2" });
    expect(onSelect).not.toHaveBeenCalled();
    rerender(view(true));
    fireEvent.keyDown(getByRole("button", { name: "Deny" }), { key: "1" });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
