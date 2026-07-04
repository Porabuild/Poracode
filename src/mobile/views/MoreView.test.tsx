// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MoreView } from "./MoreView";

describe("mobile MoreView (Settings page)", () => {
  it("lists device settings sections flat and desktop settings behind a subscreen row", () => {
    const onOpen = vi.fn<() => void>();
    const onOpenSettingsSection = vi.fn<(sectionId: string) => void>();
    render(<MoreView onOpen={onOpen} onOpenSettingsSection={onOpenSettingsSection} />);

    // Device sections are flattened into the Settings list.
    fireEvent.click(screen.getByText("Appearance"));
    expect(onOpenSettingsSection).toHaveBeenCalledWith("appearance");

    // Desktop-syncing sections stay behind the Desktop Settings subscreen.
    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
    expect(screen.queryByText("Archived Threads")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Desktop Settings"));
    expect(onOpen).toHaveBeenCalled();
  });

  it("carries no quick-access rows — those live in the home header's menu", () => {
    render(<MoreView onOpen={() => {}} onOpenSettingsSection={() => {}} />);

    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
    expect(screen.queryByText("Browser")).not.toBeInTheDocument();
    expect(screen.queryByText("Connections")).not.toBeInTheDocument();
  });
});
