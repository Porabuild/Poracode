import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { SavedCrew, ThreadCrewBinding } from "@/shared/crew";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ExperimentWinnerCrewActions } from "./ExperimentWinnerCrewActions";

const project = {
  id: "project-1",
  name: "Project",
  location: { kind: "windows", path: "C:\\repo" },
} as Project;

function makeThread(crew: ThreadCrewBinding): Thread {
  return {
    id: "winner",
    projectId: project.id,
    title: "Winner",
    agentKind: "codex",
    config: { model: "gpt-5.5", effort: "high", crew },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    presentationMode: "gui",
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as Thread;
}

const binding: ThreadCrewBinding = {
  version: 1,
  crewId: "crew-1",
  name: "Old name",
  policy: "crew-only",
  roles: [
    {
      id: "builder",
      label: "Builder",
      selection: { agentKind: "claude", model: "opus" },
    },
  ],
};

const savedCrew: SavedCrew = {
  id: "crew-1",
  name: "Current saved name",
  lead: { agentKind: "codex", model: "gpt-5.5" },
  roles: [
    {
      id: "reviewer",
      label: "Reviewer",
      selection: { agentKind: "claude", model: "opus" },
    },
  ],
  policy: "crew-first",
  updatedAt: 1,
};

describe("ExperimentWinnerCrewActions", () => {
  beforeEach(() => {
    useAppStore.setState({ projects: [project] });
    useSharedSettings.setState({ crews: [] });
  });

  it("uses the refreshed saved crew by id for the project draft", async () => {
    useSharedSettings.setState({ crews: [savedCrew] });
    renderWithI18n(
      <ExperimentWinnerCrewActions project={project} winnerThread={makeThread(binding)} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Use Current saved name in this project" }));
    await waitFor(() =>
      expect(useAppStore.getState().projects[0]?.lastDraftConfig?.crew).toMatchObject({
        crewId: savedCrew.id,
        name: savedCrew.name,
        roles: [{ id: "reviewer", label: "Reviewer" }],
      }),
    );
  });

  it("saves an unsaved winner crew inline and applies the saved binding", async () => {
    const unsaved: ThreadCrewBinding = {
      version: binding.version,
      policy: binding.policy,
      roles: binding.roles,
    };
    renderWithI18n(
      <ExperimentWinnerCrewActions project={project} winnerThread={makeThread(unsaved)} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save as crew…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Crew name" }), {
      target: { value: "Night crew" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(useSharedSettings.getState().crews).toHaveLength(1));
    const saved = useSharedSettings.getState().crews[0]!;
    expect(saved.name).toBe("Night crew");
    expect(useAppStore.getState().projects[0]?.lastDraftConfig?.crew).toMatchObject({
      crewId: saved.id,
      name: saved.name,
    });
  });
});
