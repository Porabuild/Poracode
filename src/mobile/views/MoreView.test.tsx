// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MoreView } from "./MoreView";

describe("mobile MoreView (Settings page)", () => {
  it("lists device settings sections flat and desktop settings behind a subscreen row", () => {
    const onOpen = vi.fn<() => void>();
    const onOpenSettingsSection = vi.fn<(sectionId: string) => void>();
    render(<MoreView hasDesktop onOpen={onOpen} onOpenSettingsSection={onOpenSettingsSection} />);

    // Device sections are flattened into the Settings list.
    fireEvent.click(screen.getByText("Appearance"));
    expect(onOpenSettingsSection).toHaveBeenCalledWith("appearance");
    expect(screen.queryByText("Usage")).not.toBeInTheDocument();

    // Desktop-syncing sections stay behind the Desktop Settings subscreen.
    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
    expect(screen.queryByText("Archived Threads")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Desktop Settings"));
    expect(onOpen).toHaveBeenCalled();
  });

  it("carries no quick-access rows — those live in the home header's menu", () => {
    render(<MoreView hasDesktop onOpen={() => {}} onOpenSettingsSection={() => {}} />);

    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
    expect(screen.queryByText("Browser")).not.toBeInTheDocument();
    expect(screen.queryByText("Connections")).not.toBeInTheDocument();
  });

  it("exposes the public privacy policy and support pages", () => {
    render(<MoreView hasDesktop={false} onOpen={() => {}} onOpenSettingsSection={() => {}} />);

    expect(screen.getByRole("button", { name: "Privacy Policy" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Support" })).toBeEnabled();
  });

  it("disables desktop settings until a desktop is paired", () => {
    const onOpen = vi.fn<() => void>();
    render(<MoreView hasDesktop={false} onOpen={onOpen} onOpenSettingsSection={() => {}} />);

    const desktopSettings = screen.getByRole("button", { name: /Desktop Settings/ });
    expect(desktopSettings).toBeDisabled();
    fireEvent.click(desktopSettings);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
