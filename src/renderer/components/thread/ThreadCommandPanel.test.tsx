import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadCommandPanel } from "./ThreadCommandPanel";
import type { AgentSlashCommand } from "@/shared/contracts";

describe("ThreadCommandPanel", () => {
  it("renders slash commands with mention popover styling without changing the dock styling", () => {
    const command: AgentSlashCommand = {
      id: "review",
      label: "review — Review the diff",
      description: "Review the diff",
      argumentHint: "[focus]",
    };
    const onSelect = vi.fn<(command: AgentSlashCommand) => void>();
    const { rerender } = render(
      <ThreadCommandPanel
        commands={[command]}
        activeIndex={0}
        onSelect={onSelect}
        onActiveIndexChange={() => {}}
        listId="slash-popover"
        appearance="popover"
        maxHeight={240}
      />,
    );

    const popoverOption = screen.getByRole("option");
    expect(popoverOption).toHaveClass(
      "poracode-mention-popover__item",
      "poracode-mention-popover__item--active",
    );
    expect(screen.getByRole("listbox")).toHaveClass("poracode-mention-popover__list");
    expect(screen.getByRole("listbox")).toHaveStyle({ maxHeight: "240px" });
    expect(screen.getByText("[focus]")).toHaveClass("poracode-mention-popover__detail");
    fireEvent.mouseDown(popoverOption);
    expect(onSelect).toHaveBeenCalledWith(command);

    rerender(
      <ThreadCommandPanel
        commands={[command]}
        activeIndex={0}
        onSelect={onSelect}
        onActiveIndexChange={() => {}}
        listId="slash-dock"
      />,
    );

    expect(screen.getByText("[focus]")).not.toHaveClass("poracode-mention-popover__detail");
  });

  it("highlights the part of the name that matches the query", () => {
    const command: AgentSlashCommand = { id: "auto-mode-setup", label: "auto-mode-setup" };
    const { container } = render(
      <ThreadCommandPanel
        commands={[command]}
        query="set"
        activeIndex={0}
        onSelect={() => {}}
        onActiveIndexChange={() => {}}
        listId="slash-popover"
        appearance="popover"
      />,
    );

    expect(screen.getByRole("option")).toHaveTextContent("/auto-mode-setup");
    expect([...container.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual([
      "set",
    ]);
  });

  it("does not highlight a skill matched only by its wire id", () => {
    const skill: AgentSlashCommand = {
      id: "skill:simplify",
      label: "skill:simplify",
      section: "skills",
      skillName: "simplify",
    };
    const { container } = render(
      <ThreadCommandPanel
        commands={[skill]}
        query="skill:s"
        activeIndex={0}
        onSelect={() => {}}
        onActiveIndexChange={() => {}}
        listId="slash-dock"
      />,
    );

    expect(screen.getByRole("option")).toHaveTextContent("simplify");
    expect(container.querySelector("mark")).toBeNull();
  });
});
