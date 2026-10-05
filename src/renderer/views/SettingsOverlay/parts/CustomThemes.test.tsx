import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ThemeGallery } from "./ThemeGallery";

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
    await screen.findByRole("textbox", { name: "Theme name" });
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
