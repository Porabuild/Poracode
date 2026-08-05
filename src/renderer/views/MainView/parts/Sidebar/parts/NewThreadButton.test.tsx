import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { NewThreadButton } from "./NewThreadButton";

vi.mock("@dnd-kit/react", () => ({
  useDraggable: () => ({}),
}));

function renderButton(overrides: Partial<Parameters<typeof NewThreadButton>[0]> = {}) {
  const onPress = vi.fn<() => void>();
  const onOpenAsPanel = vi.fn<() => void>();
  render(
    <NewThreadButton
      projectId="p1"
      hasDraft={false}
      isActive={false}
      isDraggingAnything={false}
      canOpenAsPanel={true}
      onPress={onPress}
      onOpenAsPanel={onOpenAsPanel}
      {...overrides}
    />,
  );
  return { onPress, onOpenAsPanel };
}

describe("NewThreadButton", () => {
  it("renders a single labelled row by default", () => {
    renderButton();

    expect(screen.getByRole("button", { name: "New thread" })).toBeInTheDocument();
  });

  it("renders both the labelled and the icon-only control when inline", () => {
    renderButton({ inline: true });

    // The head row's container query keeps exactly one of these visible;
    // jsdom applies no stylesheet, so both sit in the accessibility tree.
    expect(screen.getAllByRole("button", { name: "New thread" })).toHaveLength(2);
  });

  it("creates a thread from either inline control", () => {
    const { onPress } = renderButton({ inline: true });

    for (const button of screen.getAllByRole("button", { name: "New thread" })) {
      fireEvent.click(button);
    }

    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("keeps the Open as Panel context menu when inline", async () => {
    const { onOpenAsPanel } = renderButton({ inline: true });

    fireEvent.contextMenu(screen.getAllByRole("button", { name: "New thread" })[0]!);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open as Panel" }));

    expect(onOpenAsPanel).toHaveBeenCalledTimes(1);
  });
});
