import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { SidebarProjectFilter } from "./SidebarProjectFilter";

const responsiveMenuState = vi.hoisted(() => ({ mobile: false }));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  isRemoteSession: () => responsiveMenuState.mobile,
}));

vi.mock("@/renderer/components/common/ResponsiveMenuSurface", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/components/common/ResponsiveMenuSurface")>()),
  useResponsiveMenu: () => ({ mobile: responsiveMenuState.mobile }),
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
      filterableProjectIds={new Set(list.map((candidate) => candidate.id))}
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
  beforeEach(() => {
    responsiveMenuState.mobile = false;
  });

  it("names the hosting machine on mirrored rows and on a lone selection", async () => {
    const mirrored = {
      ...project("r", "Alpha"),
      remoteServerId: "desktop-1",
      remoteId: "rp-1",
    } as Project;
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);

    // Two projects named "Alpha": only the mirrored one carries the machine.
    renderFilter(new Set(["r"]), vi.fn(), [projects[0]!, mirrored]);
    expect(screen.getByRole("button", { name: "Filter by project" })).toHaveTextContent(
      "Alpha · MacBook 16",
    );

    const menu = await openMenu();
    const rows = [...menu.querySelectorAll('[role="menuitemcheckbox"]')].map((r) => r.textContent);
    expect(rows.filter((row) => row?.includes("MacBook 16"))).toHaveLength(1);

    useRemoteServersStore.setState({ servers: [], runtime: {} });
  });

  it("labels the trigger with the current selection", () => {
    renderFilter(null);
    const trigger = screen.getByRole("button", { name: "Filter by project" });
    expect(trigger).toHaveTextContent("All projects");
    expect(trigger).toHaveClass("h-8");
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

  it("keeps the mobile project drawer open while the controlled selection changes", async () => {
    responsiveMenuState.mobile = true;

    function ControlledFilter() {
      const [value, setValue] = useState<ReadonlySet<string> | null>(null);
      return (
        <SidebarProjectFilter
          projects={projects}
          filterableProjectIds={new Set(projects.map((candidate) => candidate.id))}
          threadCounts={threadCounts}
          value={value}
          onChange={(next) => setValue(next ? new Set(next) : null)}
        />
      );
    }

    render(<ControlledFilter />);
    fireEvent.click(screen.getByRole("button", { name: "Filter by project" }));
    const beta = (await screen.findByText("Beta")).closest("button");
    expect(beta).not.toBeNull();
    fireEvent.pointerDown(beta!, { pointerType: "touch" });
    fireEvent.click(beta!);

    expect(screen.getByRole("dialog", { name: "Filter by project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter by project", hidden: true })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(beta).not.toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Alpha").closest("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("animates the mobile project drawer before unmounting it", async () => {
    responsiveMenuState.mobile = true;
    renderFilter(null);
    fireEvent.click(screen.getByRole("button", { name: "Filter by project" }));
    const dialog = await screen.findByRole("dialog", { name: "Filter by project" });

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.getByRole("dialog", { name: "Filter by project" })).toBeInTheDocument();
    expect(document.querySelector(".m-sheet-backdrop")).toHaveAttribute("data-closing", "true");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Filter by project" })).toBeNull(),
    );
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

  it("renders one divider when every listed project is unavailable", async () => {
    render(
      <SidebarProjectFilter
        projects={projects}
        filterableProjectIds={new Set()}
        threadCounts={threadCounts}
        value={null}
        onChange={vi.fn<(next: string[] | null) => void>()}
      />,
    );
    const menu = await openMenu();

    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Project actions for Beta" })).toHaveClass("ms-auto");
  });

  it("keeps a single divider between All projects and a filterable-only list", async () => {
    renderFilter(null);
    const menu = await openMenu();

    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
  });

  it("separates filterable and unavailable projects with one extra divider", async () => {
    render(
      <SidebarProjectFilter
        projects={projects}
        filterableProjectIds={new Set(["a"])}
        threadCounts={threadCounts}
        value={null}
        onChange={vi.fn<(next: string[] | null) => void>()}
      />,
    );
    const menu = await openMenu();

    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(2);
  });

  describe("project overflow menu", () => {
    beforeEach(() => {
      usePanelStore.setState({ settingsOpen: false, projectSettingsId: null });
      useAppStore.setState({ projects: [...projects], threads: [] });
      useRemoteServersStore.setState({ servers: [], runtime: {} });
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

    it("keeps a disabled project available for re-enabling", async () => {
      const disabledProject = { ...projects[1]!, disabled: true };
      useAppStore.setState({ projects: [projects[0]!, disabledProject], threads: [] });
      render(
        <SidebarProjectFilter
          projects={[projects[0]!, disabledProject]}
          filterableProjectIds={new Set(["a"])}
          threadCounts={threadCounts}
          value={null}
          onChange={vi.fn<(next: string[] | null) => void>()}
        />,
      );
      await openMenu();

      fireEvent.click(screen.getByRole("button", { name: "Project actions for Beta" }));

      fireEvent.click(await screen.findByRole("menuitem", { name: "Enable Project" }));

      expect(
        useAppStore.getState().projects.find((candidate) => candidate.id === "b")?.disabled,
      ).toBe(undefined);
    });

    it("stacks project and nested action drawers on mobile", async () => {
      responsiveMenuState.mobile = true;
      render(
        <SidebarProjectFilter
          projects={projects}
          filterableProjectIds={new Set(["a", "c"])}
          threadCounts={threadCounts}
          value={null}
          onChange={vi.fn<(next: string[] | null) => void>()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Filter by project" }));
      fireEvent.click(await screen.findByRole("button", { name: "Project actions for Beta" }));

      expect(await screen.findByRole("dialog", { name: "Beta" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Project Settings" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "Project Settings" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Git" }));

      expect(await screen.findByRole("dialog", { name: "Git" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Review Changes" })).toBeInTheDocument();
      expect(document.querySelectorAll(".m-sheet")).toHaveLength(3);
    });

    it("opens settings for a selectable project on mobile without changing the filter", async () => {
      responsiveMenuState.mobile = true;
      const onChange = renderFilter(null);

      fireEvent.click(screen.getByRole("button", { name: "Filter by project" }));
      const projectActions = await screen.findByRole("button", {
        name: "Project actions for Beta",
      });
      expect(projectActions.className).not.toContain("hover:bg-");
      fireEvent.click(projectActions);
      fireEvent.click(await screen.findByRole("button", { name: "Project Settings" }));

      expect(usePanelStore.getState().projectSettingsId).toBe("b");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("keeps a disabled project available for re-enabling on mobile", async () => {
      responsiveMenuState.mobile = true;
      const disabledProject = { ...projects[1]!, disabled: true };
      useAppStore.setState({ projects: [projects[0]!, disabledProject], threads: [] });
      render(
        <SidebarProjectFilter
          projects={[projects[0]!, disabledProject]}
          filterableProjectIds={new Set(["a"])}
          threadCounts={threadCounts}
          value={null}
          onChange={vi.fn<(next: string[] | null) => void>()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Filter by project" }));
      fireEvent.click(await screen.findByRole("button", { name: "Project actions for Beta" }));
      expect(await screen.findByRole("dialog", { name: "Beta" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Enable Project" }));

      expect(
        useAppStore.getState().projects.find((candidate) => candidate.id === "b")?.disabled,
      ).toBe(undefined);
    });

    it("keeps host actions disabled for an unreachable remote project", async () => {
      const mirrored = {
        ...projects[1]!,
        remoteServerId: "desktop-1",
        remoteId: "remote-b",
      } as Project;
      useRemoteServersStore.setState({
        servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
        runtime: { "desktop-1": { status: "offline", projects: [], threads: [] } },
      } as never);
      useAppStore.setState({ projects: [mirrored], threads: [] });
      render(
        <SidebarProjectFilter
          projects={[mirrored]}
          filterableProjectIds={new Set()}
          threadCounts={threadCounts}
          value={null}
          onChange={vi.fn<(next: string[] | null) => void>()}
        />,
      );
      await openMenu();

      fireEvent.click(screen.getByRole("button", { name: "Project actions for Beta" }));

      expect(await screen.findByRole("menuitem", { name: "Remove Project" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(screen.getByRole("menuitem", { name: "Disable Project" })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("offers only the local sync action for a mirrored project on mobile", async () => {
      responsiveMenuState.mobile = true;
      const mirrored = {
        ...projects[1]!,
        remoteServerId: "desktop-1",
        remoteId: "remote-b",
      } as Project;
      useRemoteServersStore.setState({
        servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
        runtime: { "desktop-1": { status: "online", projects: [mirrored], threads: [] } },
      } as never);
      useAppStore.setState({ projects: [mirrored], threads: [] });
      renderFilter(null, vi.fn(), [mirrored]);

      fireEvent.click(screen.getByRole("button", { name: "Filter by project" }));
      fireEvent.click(await screen.findByRole("button", { name: "Project actions for Beta" }));

      expect(await screen.findByRole("button", { name: "Stop syncing" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Disable Project" })).not.toBeInTheDocument();
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
