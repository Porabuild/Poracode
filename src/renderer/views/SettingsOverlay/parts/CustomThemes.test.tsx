import { downloadTextFile } from "@/renderer/utils/downloadTextFile";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ThemeGallery } from "./ThemeGallery";

vi.mock("@/renderer/utils/downloadTextFile", () => ({
  downloadTextFile: vi.fn<typeof downloadTextFile>(),
}));

beforeEach(() => {
  localStorage.clear();
  useSharedSettings.setState({ themePreset: "default", themeMode: "dark", customThemes: [] });
});

describe("custom theme settings", () => {
  it("creates, applies, edits and deletes a custom theme through the settings UI", async () => {
    render(
      <AppProvider syncWindowChrome={false}>
        <ThemeGallery />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create custom theme" }));
    expect(screen.getByRole("dialog", { name: "Custom theme" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Theme name" }), {
      target: { value: "Personal blue" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Background" }), {
      target: { value: "#101010" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Composer background" }), {
      target: { value: "#141414" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and apply" }));
    await waitFor(() => expect(useSharedSettings.getState().customThemes).toHaveLength(1));
    const id = useSharedSettings.getState().customThemes[0]!.id;
    expect(useSharedSettings.getState().themePreset).toBe(id);
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("#101010");
    expect(
      JSON.parse(localStorage.getItem("poracode-shared-settings")!).customThemes[0].label,
    ).toBe("Personal blue");
    fireEvent.click(screen.getByRole("button", { name: "Edit theme" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Background" }), {
      target: { value: "#202020" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and apply" }));
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--background")).toBe("#202020"),
    );
    expect(useSharedSettings.getState().customThemes).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete theme" }));
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(useSharedSettings.getState().themePreset).toBe("default"));
    expect(useSharedSettings.getState().customThemes).toEqual([]);
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("");
  });
  it("blocks invalid palettes and cancels without changing settings", () => {
    render(<ThemeGallery />);
    fireEvent.click(screen.getByRole("button", { name: "Create custom theme" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Background" }), {
      target: { value: "#xyz" },
    });
    expect(screen.getByRole("button", { name: "Save and apply" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("valid hex colors");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useSharedSettings.getState().customThemes).toEqual([]);
    expect(useSharedSettings.getState().themePreset).toBe("default");
  });
  it("dismisses the modal without saving and discards the draft when reopened", async () => {
    render(<ThemeGallery />);
    fireEvent.click(screen.getByRole("button", { name: "Create custom theme" }));
    const dialog = screen.getByRole("dialog", { name: "Custom theme" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Theme name" }), {
      target: { value: "Unsaved palette" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Close$/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useSharedSettings.getState().customThemes).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Create custom theme" }));
    expect(screen.getByRole("textbox", { name: "Theme name" })).toHaveValue("My theme");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useSharedSettings.getState().themePreset).toBe("default");
  });
  it("shows live contrast guidance for both palettes without blocking save", () => {
    render(<ThemeGallery />);
    fireEvent.click(screen.getByRole("button", { name: "Create custom theme" }));
    const table = screen.getByRole("table", { name: "Text contrast" });
    expect(within(table).getByRole("columnheader", { name: "Light" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Dark" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Text color" }), {
      target: { value: "#000000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Content background" }), {
      target: { value: "#000000" },
    });
    expect(within(table).getByRole("row", { name: /Content background/ })).toHaveTextContent(
      "1.00:1Low contrast",
    );
    expect(screen.getByRole("button", { name: "Save and apply" })).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Text color" }), {
      target: { value: "#ffffff" },
    });
    expect(within(table).getByRole("row", { name: /Content background/ })).toHaveTextContent(
      "21.00:1Good contrast",
    );
  });
  it("opens on the current appearance and identifies an invalid hidden palette", async () => {
    useSharedSettings.setState({ themeMode: "light" });
    render(
      <AppProvider syncWindowChrome={false}>
        <ThemeGallery />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create custom theme" }));
    expect(screen.getByRole("button", { name: "Light Palette mode" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Background" }), {
      target: { value: "#12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Light Palette mode" }));
    fireEvent.click(screen.getByRole("option", { name: "Dark" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Check the Light palette for invalid colors.",
      ),
    );
    expect(screen.getByRole("button", { name: "Save and apply" })).toBeDisabled();
  });
  it("exports a versioned document without persisting a draft or including its installation id", () => {
    render(<ThemeGallery />);
    fireEvent.click(screen.getByRole("button", { name: "Create custom theme" }));
    fireEvent.click(screen.getByRole("button", { name: "Export theme" }));
    const [filename, json, type] = vi.mocked(downloadTextFile).mock.calls[0]!;
    expect(filename).toBe("poracode-theme.json");
    expect(type).toBe("application/json");
    expect(JSON.parse(json)).toMatchObject({ version: 1, label: "My theme" });
    expect(JSON.parse(json)).not.toHaveProperty("id");
    expect(useSharedSettings.getState().customThemes).toEqual([]);
  });
  it("does not reopen a stale imported theme after Create and Cancel", async () => {
    render(<ThemeGallery />);
    const { THEME_SPECS } = await import("@/renderer/theme/themePresets");
    const pending = Promise.withResolvers<string>();
    const file = new File([], "slow.json");
    Object.defineProperty(file, "text", { value: () => pending.promise });
    fireEvent.change(screen.getByLabelText("Import theme", { selector: "input" }), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create custom theme" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {
      pending.resolve(JSON.stringify({ ...THEME_SPECS[0]!, version: 1, label: "Late import" }));
      await pending.promise;
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useSharedSettings.getState().customThemes).toEqual([]);
  });
  it("imports with a fresh id and rejects unsupported files", async () => {
    render(<ThemeGallery />);
    const { THEME_SPECS } = await import("@/renderer/theme/themePresets");
    const doc = {
      ...THEME_SPECS[0]!,
      version: 1,
      id: "custom:existing",
      label: "Imported palette",
    };
    const file = new File([], "theme.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(doc) });
    fireEvent.change(screen.getByLabelText("Import theme", { selector: "input" }), {
      target: { files: [file] },
    });
    const dialog = await screen.findByRole("dialog", { name: "Custom theme" });
    expect(within(dialog).getByRole("textbox", { name: "Theme name" })).toHaveValue(
      "Imported palette",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save and apply" }));
    expect(useSharedSettings.getState().customThemes[0]!.id).not.toBe(doc.id);
    const bad = new File([], "future.json");
    Object.defineProperty(bad, "text", {
      value: async () => JSON.stringify({ ...doc, version: 2 }),
    });
    fireEvent.change(screen.getByLabelText("Import theme", { selector: "input" }), {
      target: { files: [bad] },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not import"));
    expect(useSharedSettings.getState().customThemes).toHaveLength(1);
  });
});
