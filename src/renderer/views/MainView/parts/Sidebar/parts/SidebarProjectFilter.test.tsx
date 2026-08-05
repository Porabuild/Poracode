import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { SidebarProjectFilter } from "./SidebarProjectFilter";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  isRemoteSession: () => false,
}));

function project(id: string, name: string): Project {
  return {
    id,
    name,
    location: { kind: "windows", path: `C:\\${id}` },
    createdAt: "2026-07-01T00:00:00.000Z",
  } as Project;
}

const projects = [project("a", "Alpha"), project("b", "Beta"), project("c", "Gamma")];
const homeProject = project(HOME_PROJECT_ID, "Home");
const threadCounts = new Map([
  ["a", 2],
  ["b", 1],
  ["c", 0],
]);

function renderFilter(
  value: ReadonlySet<string> | null,
  onChange = vi.fn<(next: string[] | null) => void>(),
  list: readonly Project[] = projects,
) {
  render(
    <SidebarProjectFilter
      projects={list}
      threadCounts={threadCounts}
      value={value}
      onChange={onChange}
    />,
  );
  return onChange;
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Filter by project" }));
  return screen.findByRole("menu");
}

describe("SidebarProjectFilter", () => {
  it("labels the trigger with the current selection", () => {
    renderFilter(null);
    expect(screen.getByRole("button", { name: "Filter by project" })).toHaveTextContent(
      "All projects",
    );
  });

  it("labels the trigger with the project name when one project is selected", () => {
    renderFilter(new Set(["b"]));
    expect(screen.getByRole("button", { name: "Filter by project" })).toHaveTextContent("Beta");
  });

  it("labels the trigger with the count when several projects are selected", () => {
    renderFilter(new Set(["a", "c"]));
    expect(screen.getByRole("button", { name: "Filter by project" })).toHaveTextContent(
      "2 projects",
    );
  });

  it("unchecking a project in the all state filters to the remaining projects", async () => {
    const onChange = renderFilter(null);
    await openMenu();

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Beta/ }));

    expect(onChange).toHaveBeenCalledWith(["a", "c"]);
  });

  it("toggling a project adds it to an active filter", async () => {
    const onChange = renderFilter(new Set(["a"]));
    await openMenu();

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Gamma/ }));

    expect(onChange).toHaveBeenCalledWith(["a", "c"]);
  });

  it("resetting via All projects clears the filter", async () => {
    const onChange = renderFilter(new Set(["a"]));
    await openMenu();

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "All projects" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("deselecting the last selected project collapses back to all projects", async () => {
    const onChange = renderFilter(new Set(["b"]));
    await openMenu();

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Beta/ }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("selecting every project individually collapses back to all projects", async () => {
    const onChange = renderFilter(new Set(["a", "b"]));
    await openMenu();

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Gamma/ }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("closes when the trigger is pressed again", async () => {
    renderFilter(null);
    await openMenu();

    // The popover is non-modal, so it renders no underlay to swallow this press
    // and React Aria's trigger would only ever re-open the menu.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Filter by project" }));

    expect(screen.queryByRole("menuitemcheckbox")).not.toBeInTheDocument();
  });

  it("shows per-project thread counts in the menu", async () => {
    renderFilter(null);
    await openMenu();

    expect(screen.getByRole("menuitemcheckbox", { name: /Alpha/ })).toHaveTextContent("2");
    expect(screen.getByRole("menuitemcheckbox", { name: /Gamma/ })).toHaveTextContent("0");
  });

  describe("project overflow menu", () => {
    beforeEach(() => {
      usePanelStore.setState({ settingsOpen: false, projectSettingsId: null });
      useAppStore.setState({ projects: [...projects], threads: [] });
    });

    it("stacks the project context menu on top of the open filter menu", async () => {
      const onChange = renderFilter(null);
      await openMenu();

      fireEvent.click(screen.getByRole("button", { name: "Project actions for Beta" }));

      // The overflow menu opens while the filter menu stays open beneath it.
      expect(await screen.findByRole("menuitem", { name: "Project Settings" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Disable Project" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Remove Project" })).toBeInTheDocument();
      expect(screen.getByRole("menuitemcheckbox", { name: "All projects" })).toBeInTheDocument();
      expect(screen.getByRole("menuitemcheckbox", { name: /Beta/ })).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("closes both menus once an action is picked", async () => {
      renderFilter(null);
      await openMenu();

      fireEvent.click(screen.getByRole("button", { name: "Project actions for Beta" }));
      fireEvent.click(await screen.findByRole("menuitem", { name: "Project Settings" }));

      // The project settings overlay is keyed off projectSettingsId alone.
      expect(usePanelStore.getState().projectSettingsId).toBe("b");
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
      expect(screen.queryByRole("menuitemcheckbox")).not.toBeInTheDocument();
    });

    it("dismisses the overflow menu when a filter checkbox is toggled", async () => {
      renderFilter(null);
      await openMenu();

      fireEvent.click(screen.getByRole("button", { name: "Project actions for Beta" }));
      expect(await screen.findByRole("menuitem", { name: "Project Settings" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Alpha/ }));

      expect(screen.queryByRole("menuitem", { name: "Project Settings" })).not.toBeInTheDocument();
      // The filter menu itself stays open — selection changes never close it.
      expect(screen.getByRole("menuitemcheckbox", { name: /Beta/ })).toBeInTheDocument();
    });

    it("does not blur-close the overflow menu when hover moves focus into the filter menu", async () => {
      renderFilter(null);
      await openMenu();

      fireEvent.click(screen.getByRole("button", { name: "Project actions for Beta" }));
      const projectSettings = await screen.findByRole("menuitem", { name: "Project Settings" });

      // React Aria menu items take DOM focus on hover, and RAC popovers close
      // on blur by default — without the interact-outside guard, wandering
      // back over the filter menu dismisses the project menu. (jsdom: real
      // .focus() so React Aria's focus-within tracking engages before blur.)
      projectSettings.focus();
      fireEvent.blur(projectSettings, {
        relatedTarget: screen.getByRole("menuitemcheckbox", { name: /Alpha/ }),
      });

      expect(screen.getByRole("menuitem", { name: "Project Settings" })).toBeInTheDocument();
    });

    it("blur-closes the overflow menu when focus leaves all menus", async () => {
      renderFilter(null);
      await openMenu();

      fireEvent.click(screen.getByRole("button", { name: "Project actions for Beta" }));
      const projectSettings = await screen.findByRole("menuitem", { name: "Project Settings" });

      projectSettings.focus();
      fireEvent.blur(projectSettings, {
        // The open filter is modal, so aria-hidden covers the trigger behind it.
        relatedTarget: screen.getByRole("button", { name: "Filter by project", hidden: true }),
      });

      expect(screen.queryByRole("menuitem", { name: "Project Settings" })).not.toBeInTheDocument();
    });

    it("dismisses both menus on a press outside them", async () => {
      renderFilter(null);
      await openMenu();

      fireEvent.click(screen.getByRole("button", { name: "Project actions for Beta" }));
      expect(await screen.findByRole("menuitem", { name: "Project Settings" })).toBeInTheDocument();

      fireEvent.mouseDown(document.body);
      fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" });
      fireEvent.mouseUp(document.body);
      await vi.waitFor(() => {
        expect(screen.queryByRole("menuitemcheckbox")).not.toBeInTheDocument();
      });
      expect(screen.queryByRole("menuitem", { name: "Project Settings" })).not.toBeInTheDocument();
    });

    it("swallows the overflow press so the row neither toggles nor takes focus", async () => {
      const onChange = renderFilter(null);
      await openMenu();

      const button = screen.getByRole("button", { name: "Project actions for Beta" });
      // The press-down defaults are cancelled, which is what stops the row from
      // taking DOM focus and rendering as focus-visible. React Aria menu items
      // also select on press *up*, so the whole gesture is dispatched here; that
      // half only shows up against real React Aria press handling, not in jsdom.
      const pointerDown = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
      const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      button.dispatchEvent(pointerDown);
      button.dispatchEvent(mouseDown);
      fireEvent.pointerUp(button);
      fireEvent.mouseUp(button);
      fireEvent.click(button);

      expect(pointerDown.defaultPrevented).toBe(true);
      expect(mouseDown.defaultPrevented).toBe(true);
      expect(await screen.findByRole("menuitem", { name: "Project Settings" })).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
      expect(button).not.toHaveFocus();
    });

    it("dismisses through its backdrop without disturbing the filter", async () => {
      const onChange = renderFilter(null);
      await openMenu();

      fireEvent.click(screen.getByRole("button", { name: "Project actions for Beta" }));
      expect(await screen.findByRole("menuitem", { name: "Project Settings" })).toBeInTheDocument();

      const backdrop = document.querySelector("[data-poracode-menu-backdrop]");
      expect(backdrop).not.toBeNull();
      fireEvent.pointerDown(backdrop!);

      // Only the menu on top goes; the filter it stacked over stays open and
      // unchanged, because the backdrop absorbed the press.
      expect(screen.queryByRole("menuitem", { name: "Project Settings" })).not.toBeInTheDocument();
      expect(document.querySelector("[data-poracode-menu-backdrop]")).toBeNull();
      expect(screen.getByRole("menuitemcheckbox", { name: /Beta/ })).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("peels the stack top-down on Escape, wherever focus sits", async () => {
      renderFilter(null);
      await openMenu();

      fireEvent.click(screen.getByRole("button", { name: "Project actions for Beta" }));
      expect(await screen.findByRole("menuitem", { name: "Project Settings" })).toBeInTheDocument();

      // A non-modal popover never takes focus on a mouse press, so Escape is
      // handled at the window rather than by React Aria's popover.
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("menuitem", { name: "Project Settings" })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitemcheckbox", { name: /Beta/ })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("menuitemcheckbox")).not.toBeInTheDocument();
    });

    it("offers no overflow button for the Home project", async () => {
      renderFilter(null, vi.fn<(next: string[] | null) => void>(), [homeProject, projects[0]!]);
      await openMenu();

      expect(screen.getByRole("button", { name: "Project actions for Alpha" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Project actions for Home" }),
      ).not.toBeInTheDocument();
    });
  });
});
