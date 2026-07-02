// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MoreView, type MoreDestination } from "./MoreView";

describe("mobile MoreView", () => {
  it("lists device settings sections flat and desktop settings behind a subscreen row", () => {
    const onOpen = vi.fn<(destination: MoreDestination) => void>();
    const onOpenSettingsSection = vi.fn<(sectionId: string) => void>();
    render(<MoreView onOpen={onOpen} onOpenSettingsSection={onOpenSettingsSection} />);

    // Device sections are flattened into the More list.
    fireEvent.click(screen.getByText("Appearance"));
    expect(onOpenSettingsSection).toHaveBeenCalledWith("appearance");

    // Desktop-syncing sections stay behind the Desktop Settings subscreen.
    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
    expect(screen.queryByText("Archived Threads")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Desktop Settings"));
    expect(onOpen).toHaveBeenCalledWith("desktop-settings");
  });

  it("keeps the non-settings entry points", () => {
    const onOpen = vi.fn<(destination: MoreDestination) => void>();
    render(<MoreView onOpen={onOpen} onOpenSettingsSection={() => {}} />);

    fireEvent.click(screen.getByText("Projects"));
    expect(onOpen).toHaveBeenCalledWith("projects");
    fireEvent.click(screen.getByText("Browser"));
    expect(onOpen).toHaveBeenCalledWith("browser");
  });
});
