import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { NewThreadButton } from "./NewThreadButton";

const draggableInputs: { id?: string; type?: string; data?: unknown }[] = [];

vi.mock("@dnd-kit/react", () => ({
  useDraggable: (input: { id?: string; type?: string; data?: unknown }) => {
    draggableInputs.push(input);
    return { isDragging: false, ref: () => {} };
  },
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

  it("offers active projects as flat context-menu items", async () => {
    const onSelectProject = vi.fn<(projectId: string) => void>();
    renderButton({
      inline: true,
      projectOptions: [
        { id: "p1", name: "Alpha", icon: <span data-testid="alpha-project-icon" /> },
        {
          id: "p2",
          name: "Beta",
          icon: <span data-testid="beta-project-icon" />,
          description: "MacBook 16",
        },
      ],
      onSelectProject,
    });

    fireEvent.contextMenu(screen.getAllByRole("button", { name: "New thread" })[0]!);
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).queryByRole("menuitem", { name: "Select project" }),
    ).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Alpha" })).toBeInTheDocument();
    expect(within(menu).getByTestId("beta-project-icon")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Beta" })).toHaveTextContent("MacBook 16");

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Beta" }));

    expect(onSelectProject).toHaveBeenCalledWith("p2");
  });

  it("makes each project row draggable onto a pane target", async () => {
    draggableInputs.length = 0;
    renderButton({
      inline: true,
      projectOptions: [
        { id: "p1", name: "Alpha" },
        { id: "p2", name: "Beta" },
      ],
      onSelectProject: vi.fn<(projectId: string) => void>(),
    });

    fireEvent.contextMenu(screen.getAllByRole("button", { name: "New thread" })[0]!);
    await screen.findByRole("menu");

    for (const projectId of ["p1", "p2"]) {
      expect(draggableInputs).toContainEqual({
        id: `new-thread-menu:${projectId}`,
        type: "new-thread",
        data: { type: "new-thread", projectId },
      });
    }
  });
});
