// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { SettingsView, type SettingsThreadHandlers } from "./SettingsView";

vi.mock("@/renderer/components/providers/ThreadProviderIcon", () => ({
  ThreadProviderIcon: () => null,
}));

describe("mobile SettingsView", () => {
  it("does not expose desktop-only browser preferences", () => {
    render(
      <SettingsView
        archivedThreads={[]}
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
        archivedThreads={[]}
        projects={[]}
        sectionId={null}
        onSectionChange={() => {}}
        onThreadAction={() => {}}
      />,
    );

    expect(screen.getByText("AI Helpers")).toBeInTheDocument();
    expect(screen.getByText("Schedules")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Archived Threads")).toBeInTheDocument();
    expect(screen.getByText("Provider Usage")).toBeInTheDocument();
    expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
  });

  it("still renders device section pages by id (deep links from the Settings page)", () => {
    render(
      <SettingsView
        archivedThreads={[]}
        projects={[]}
        sectionId="git"
        onSectionChange={() => {}}
        onThreadAction={() => {}}
      />,
    );

    expect(screen.getByText("Git")).toBeInTheDocument();
  });

  it("shows the archived empty state", () => {
    render(
      <SettingsView
        archivedThreads={[]}
        projects={[]}
        sectionId="archived"
        onSectionChange={() => {}}
        onThreadAction={() => {}}
      />,
    );

    expect(screen.getByText("No archived threads.")).toBeInTheDocument();
  });

  it("routes actions only for archived desktop threads", () => {
    const onThreadAction = vi.fn<SettingsThreadHandlers["onThreadAction"]>();
    const thread = {
      id: "thread-archived",
      projectId: "project-1",
      title: "Archived smoke thread",
      agentKind: "codex",
      config: { model: "gpt-5" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: true,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    } satisfies Thread;

    render(
      <SettingsView
        archivedThreads={[thread]}
        projects={[]}
        sectionId="archived"
        onSectionChange={() => {}}
        onThreadAction={onThreadAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Restore thread" }));

    expect(onThreadAction).toHaveBeenCalledWith(thread, { kind: "unarchive" });
    fireEvent.click(screen.getByRole("button", { name: "Delete thread" }));

    expect(onThreadAction).toHaveBeenLastCalledWith(thread, { kind: "delete" });
  });

  it("opens Usage settings from Desktop Settings", () => {
    const onSectionChange = vi.fn<(sectionId: string | null) => void>();
    render(
      <SettingsView
        archivedThreads={[]}
        projects={[]}
        sectionId={null}
        onSectionChange={onSectionChange}
        onThreadAction={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Provider Usage"));

    expect(onSectionChange).toHaveBeenCalledWith("usage");
  });
});
