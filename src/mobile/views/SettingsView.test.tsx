// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { SettingsView } from "./SettingsView";

vi.mock("@/renderer/components/providers/ThreadProviderIcon", () => ({
  ThreadProviderIcon: () => null,
}));

describe("mobile SettingsView", () => {
  it("does not expose desktop-only browser preferences", () => {
    render(
      <SettingsView
        threads={[]}
        projects={[]}
        sectionId={null}
        onSectionChange={() => {}}
        onThreadAction={() => {}}
      />,
    );

    expect(screen.queryByText("Browser")).not.toBeInTheDocument();
    expect(screen.queryByText("Links and page behavior")).not.toBeInTheDocument();
    expect(screen.queryByText("Removal behavior")).not.toBeInTheDocument();
  });

  it("lists only desktop-syncing sections — device sections live on the Settings page", () => {
    render(
      <SettingsView
        threads={[]}
        projects={[]}
        sectionId={null}
        onSectionChange={() => {}}
        onThreadAction={() => {}}
      />,
    );

    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Schedules")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Archived Threads")).toBeInTheDocument();
    expect(screen.getByText("Usage")).toBeInTheDocument();
    expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
  });

  it("still renders device section pages by id (deep links from the Settings page)", () => {
    render(
      <SettingsView
        threads={[]}
        projects={[]}
        sectionId="git"
        onSectionChange={() => {}}
        onThreadAction={() => {}}
      />,
    );

    expect(screen.getByText("Git")).toBeInTheDocument();
  });

  it("explains the archived section is desktop-managed instead of claiming nothing is archived", () => {
    // The wire never delivers archived threads to the PWA (the shell snapshot
    // drops them), so the empty state must be honest, not "No archived threads".
    render(
      <SettingsView
        threads={[]}
        projects={[]}
        sectionId="archived"
        onSectionChange={() => {}}
        onThreadAction={() => {}}
      />,
    );

    expect(
      screen.getByText(/Archived threads are managed from the desktop app/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("No archived threads.")).not.toBeInTheDocument();
  });

  it("opens Usage settings from Desktop Settings", () => {
    const onSectionChange = vi.fn<(sectionId: string | null) => void>();
    render(
      <SettingsView
        threads={[]}
        projects={[]}
        sectionId={null}
        onSectionChange={onSectionChange}
        onThreadAction={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Usage"));

    expect(onSectionChange).toHaveBeenCalledWith("usage");
  });
});
