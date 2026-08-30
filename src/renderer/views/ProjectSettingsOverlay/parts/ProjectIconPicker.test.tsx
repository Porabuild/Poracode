import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@heroui/react";
import type { Project } from "@/shared/contracts";
import { ProjectIconPicker } from "./ProjectIconPicker";

const { updateProjectIcon, pickFiles, detectProjectIcon, listProjectIconFiles, session } =
  vi.hoisted(() => ({
    updateProjectIcon: vi.fn<(projectId: string, icon: string | undefined) => void>(),
    pickFiles: vi.fn<(options: { defaultPath?: string }) => Promise<string[] | null>>(),
    detectProjectIcon: vi.fn<() => Promise<string | null>>(),
    listProjectIconFiles: vi.fn<() => Promise<string[]>>(),
    session: { remote: false },
  }));

vi.mock("@/renderer/actions/projectActions", () => ({ updateProjectIcon }));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ pickFiles, detectProjectIcon, listProjectIconFiles }),
  isRemoteSession: () => session.remote,
}));

const ROOT = "E:\\work\\app";

function projectWith(overrides?: Partial<Project>): Project {
  return {
    id: "project-1",
    name: "Test project",
    location: { kind: "windows", path: ROOT },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function openPicker(project: Project = projectWith()) {
  render(<ProjectIconPicker project={project} />);
  fireEvent.click(screen.getByRole("button", { name: "Change project icon" }));
  return await screen.findByRole("textbox", { name: "Search icons" });
}

function iconCells(): HTMLElement[] {
  return screen.getAllByRole("button", { name: /^Project icon: / });
}

beforeEach(() => {
  session.remote = false;
  updateProjectIcon.mockReset();
  pickFiles.mockReset();
  detectProjectIcon.mockReset().mockResolvedValue(null);
  listProjectIconFiles.mockReset().mockResolvedValue([]);
});

describe("ProjectIconPicker", () => {
  it("selects a glyph from the catalog", async () => {
    await openPicker();

    fireEvent.click(screen.getByRole("button", { name: "Project icon: Rocket" }));

    expect(updateProjectIcon).toHaveBeenCalledWith("project-1", "lucide:rocket");
    // Stays open so the colour row can be used in the same visit.
    expect(screen.getByRole("textbox", { name: "Search icons" })).toBeInTheDocument();
  });

  it("closes after Enter commits the top hit", async () => {
    const search = await openPicker();

    fireEvent.change(search, { target: { value: "rocket" } });
    await waitFor(() => expect(iconCells()).toHaveLength(1));
    fireEvent.keyDown(search, { key: "Enter" });

    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("filters on search and shows an empty state", async () => {
    const search = await openPicker();

    fireEvent.change(search, { target: { value: "rocket" } });
    await waitFor(() => expect(iconCells()).toHaveLength(1));

    fireEvent.change(search, { target: { value: "no-such-glyph" } });
    expect(await screen.findByText("No icons found")).toBeInTheDocument();
  });

  it("takes the top hit on Enter", async () => {
    const search = await openPicker();

    fireEvent.change(search, { target: { value: "rocket" } });
    await waitFor(() => expect(iconCells()).toHaveLength(1));
    fireEvent.keyDown(search, { key: "Enter" });

    expect(updateProjectIcon).toHaveBeenCalledWith("project-1", "lucide:rocket");
  });

  it("explains a glyph on hover: name, category and search terms", async () => {
    await openPicker();

    const cell = screen.getByRole("button", { name: "Project icon: Rocket" });
    expect(cell.getAttribute("title")).toBe(
      ["Rocket", "Games & fun", "launch, startup, deploy"].join("\n"),
    );
  });

  it("keeps one tab stop and walks the grid with the arrow keys", async () => {
    const search = await openPicker();

    // One roving tab stop, so Tab leaves the grid instead of visiting every cell.
    const cells = iconCells();
    expect(cells.length).toBeGreaterThan(100);
    expect(cells.filter((cell) => cell.getAttribute("tabindex") === "0")).toHaveLength(1);

    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(document.activeElement).toBe(cells[0]);

    fireEvent.keyDown(cells[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cells[1]);

    fireEvent.keyDown(cells[1]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(cells[9]);

    fireEvent.keyDown(cells[9]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cells[8]);

    // ArrowUp off the first row returns to the search field.
    fireEvent.keyDown(cells[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(search);
  });

  it("stores an image picked inside the project folder as a relative path", async () => {
    pickFiles.mockResolvedValue([`${ROOT}\\public\\logo.png`]);
    await openPicker();

    fireEvent.click(screen.getByRole("button", { name: /Use an image from the project folder/ }));

    await waitFor(() =>
      expect(updateProjectIcon).toHaveBeenCalledWith("project-1", "file:public/logo.png"),
    );
    expect(pickFiles.mock.calls[0]?.[0]?.defaultPath).toBe(ROOT);
  });

  it("resolves a project root stored with a trailing separator", async () => {
    pickFiles.mockResolvedValue([`${ROOT}\\logo.png`]);
    await openPicker(projectWith({ location: { kind: "windows", path: `${ROOT}\\` } }));

    fireEvent.click(screen.getByRole("button", { name: /Use an image from the project folder/ }));

    await waitFor(() =>
      expect(updateProjectIcon).toHaveBeenCalledWith("project-1", "file:logo.png"),
    );
  });

  it("warns instead of storing an image from outside the project folder", async () => {
    const warning = vi.spyOn(toast, "warning").mockImplementation(() => "");
    pickFiles.mockResolvedValue(["E:\\elsewhere\\logo.png"]);
    await openPicker();

    fireEvent.click(screen.getByRole("button", { name: /Use an image from the project folder/ }));

    await waitFor(() => expect(warning).toHaveBeenCalled());
    expect(updateProjectIcon).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it("hides file-based options for a project mirrored from another machine", async () => {
    await openPicker(projectWith({ remoteServerId: "desktop-remote" }));

    expect(screen.queryByRole("button", { name: /Use an image/ })).toBeNull();
    // Bundled glyphs and the reset action still work for a mirrored project.
    expect(iconCells().length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Location glyph" })).toBeInTheDocument();
  });

  it("clears a custom icon through the footer action", async () => {
    await openPicker(projectWith({ icon: "lucide:rocket" }));

    fireEvent.click(screen.getByRole("button", { name: "Location glyph" }));

    expect(updateProjectIcon).toHaveBeenCalledWith("project-1", undefined);
  });

  it("hides file-based options in a remote session, where the bridge cannot serve them", async () => {
    session.remote = true;
    render(<ProjectIconPicker project={projectWith()} />);
    fireEvent.click(screen.getByRole("button", { name: "Change project icon" }));

    const sheet = await screen.findByRole("dialog", { name: "Project icon" });
    expect(within(sheet).queryByRole("button", { name: /Use an image/ })).toBeNull();
    expect(pickFiles).not.toHaveBeenCalled();
  });
});

describe("ProjectIconPicker discovered icons", () => {
  it("offers every icon file found in the project and stores the chosen one", async () => {
    listProjectIconFiles.mockResolvedValue(["favicon.svg", "public/logo.png"]);
    await openPicker();

    const thumbnail = await screen.findByRole("button", { name: "public/logo.png" });
    expect(screen.getByRole("button", { name: "favicon.svg" })).toBeInTheDocument();

    fireEvent.click(thumbnail);

    expect(updateProjectIcon).toHaveBeenCalledWith("project-1", "file:public/logo.png");
  });

  it("explains a project icon file on hover", async () => {
    listProjectIconFiles.mockResolvedValue(["public/logo.png"]);
    await openPicker();

    const cell = await screen.findByRole("button", { name: "public/logo.png" });
    // Dimensions arrive with the image load; the path is there from the start.
    expect(cell.getAttribute("title")).toBe("public/logo.png");
  });

  it("marks the project's current file icon as selected", async () => {
    listProjectIconFiles.mockResolvedValue(["favicon.svg"]);
    await openPicker(projectWith({ icon: "file:favicon.svg" }));

    const thumbnail = await screen.findByRole("button", { name: "favicon.svg" });
    expect(thumbnail).toHaveAttribute("aria-pressed", "true");
  });

  it("does not probe the folder for a mirrored project", async () => {
    listProjectIconFiles.mockResolvedValue(["favicon.svg"]);
    await openPicker(projectWith({ remoteServerId: "desktop-remote" }));

    expect(listProjectIconFiles).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "favicon.svg" })).toBeNull();
  });
});

describe("ProjectIconPicker glyph colour", () => {
  it("offers colours only once a glyph is the current icon", async () => {
    await openPicker();
    expect(screen.queryByText("Icon color")).toBeNull();

    // Clicking a glyph keeps the popover open, so the colour row is reachable
    // in the same visit.
    fireEvent.click(screen.getByRole("button", { name: "Project icon: Rocket" }));
    expect(updateProjectIcon).toHaveBeenCalledWith("project-1", "lucide:rocket");
    expect(screen.getByRole("textbox", { name: "Search icons" })).toBeInTheDocument();
  });

  it("stores the picked colour with the glyph", async () => {
    await openPicker(projectWith({ icon: "lucide:rocket" }));

    expect(screen.getByText("Icon color")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Icon color: Violet" }));

    expect(updateProjectIcon).toHaveBeenCalledWith("project-1", "lucide:rocket:violet");
  });

  it("clears the tint through the default swatch", async () => {
    await openPicker(projectWith({ icon: "lucide:rocket:violet" }));

    const defaultSwatch = screen.getByRole("button", { name: "Icon color: Default" });
    expect(screen.getByRole("button", { name: "Icon color: Violet" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(defaultSwatch);

    expect(updateProjectIcon).toHaveBeenCalledWith("project-1", "lucide:rocket");
  });

  it("offers a custom colour and marks a stored hex as the active swatch", async () => {
    await openPicker(projectWith({ icon: "lucide:rocket:5f6cd9" }));

    const custom = screen.getByRole("button", { name: "Custom color" });
    expect(custom).toHaveAttribute("style", expect.stringContaining("rgb(95, 108, 217)"));
    // A stored hex is not one of the presets, so none of them reads as active.
    expect(screen.getByRole("button", { name: "Icon color: Violet" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Icon color: Default" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("keeps the colour row reachable while a search is active", async () => {
    const search = await openPicker(projectWith({ icon: "lucide:rocket" }));

    fireEvent.change(search, { target: { value: "anchor" } });
    await waitFor(() => expect(iconCells()).toHaveLength(1));

    expect(screen.getByRole("button", { name: "Icon color: Violet" })).toBeInTheDocument();
  });

  it("keeps the colour when the glyph changes", async () => {
    const search = await openPicker(projectWith({ icon: "lucide:rocket:teal" }));

    fireEvent.change(search, { target: { value: "anchor" } });
    await waitFor(() => expect(iconCells()).toHaveLength(1));
    fireEvent.keyDown(search, { key: "Enter" });

    expect(updateProjectIcon).toHaveBeenCalledWith("project-1", "lucide:anchor:teal");
  });
});
