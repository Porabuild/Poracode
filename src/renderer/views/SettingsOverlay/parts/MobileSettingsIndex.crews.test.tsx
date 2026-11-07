import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import type { SettingsSection } from "./types";
import { MobileSettingsIndex } from "./MobileSettingsIndex";

describe("MobileSettingsIndex Crews entry", () => {
  it("routes the compact device settings index to Audio", () => {
    const onOpenSection = vi.fn<(section: SettingsSection) => void>();
    renderWithI18n(
      <MobileSettingsIndex
        screen="device"
        hasDesktop={true}
        showArchived={false}
        onOpenDesktop={() => {}}
        onOpenSchedules={() => {}}
        onOpenSection={onOpenSection}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
    expect(onOpenSection).toHaveBeenCalledWith("audio");
  });
  it("routes the compact desktop settings list to Crews", () => {
    // Crews belong to the desktop (or paired host), so they are listed with its
    // settings rather than the device's own.
    const onOpenSection = vi.fn<() => void>();
    renderWithI18n(
      <MobileSettingsIndex
        screen="desktop"
        hasDesktop
        showArchived={false}
        onOpenDesktop={() => {}}
        onOpenSchedules={() => {}}
        onOpenSection={onOpenSection}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Crews/ }));
    expect(onOpenSection).toHaveBeenCalledWith("crews");
  });
});
