import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common/Button";
import { Input } from "@/renderer/components/common/Input";
import {
  isCrewNameValid,
  leadSelectionOf,
  saveAsNewCrew,
} from "@/renderer/components/crew/crewComposerModel";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { crewBindingFromSavedCrew, threadCrewBinding } from "@/shared/crew";
import type { Project, Thread } from "@/shared/contracts";

export function ExperimentWinnerCrewActions(props: {
  project: Project | undefined;
  winnerThread: Thread | undefined;
}) {
  const { t } = useLingui();
  const crews = useSharedSettings((state) => state.crews);
  const upsertCrew = useSharedSettings((state) => state.upsertCrew);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const project = props.project;
  const winnerThread = props.winnerThread;
  if (!project || !winnerThread) return null;
  const activeProject: Project = project;
  const activeWinnerThread: Thread = winnerThread;
  const binding = threadCrewBinding(activeWinnerThread.config);
  if (!binding) return null;

  const saved = crews.find((crew) => crew.id === binding.crewId);
  const currentBinding = saved ? crewBindingFromSavedCrew(saved) : binding;
  const crewName = saved?.name ?? binding.name?.trim() ?? t`Crew`;

  function applyToProject(crew = currentBinding) {
    const draft = activeProject.lastDraftConfig;
    useAppStore.getState().updateProjectDraftConfig(activeProject.id, {
      ...activeWinnerThread.config,
      ...(draft ?? {}),
      agentKind: draft?.agentKind ?? activeWinnerThread.agentKind,
      model: draft?.model ?? activeWinnerThread.config.model,
      crew,
    });
  }

  function saveCrew() {
    if (!isCrewNameValid(name)) return;
    const lead = leadSelectionOf(activeWinnerThread.agentKind, activeWinnerThread.config);
    const crew = saveAsNewCrew(name, currentBinding, lead);
    upsertCrew(crew);
    applyToProject(crewBindingFromSavedCrew(crew));
    setIsSaving(false);
    setName("");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--hairline)] px-3 py-2">
      <Button size="sm" variant="secondary" onPress={() => applyToProject()}>
        {t`Use ${crewName} in this project`}
      </Button>
      {!saved ? (
        isSaving ? (
          <>
            <Input
              aria-label={t`Crew name`}
              maxLength={40}
              value={name}
              variant="secondary"
              className="h-8 w-48"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveCrew();
                } else if (event.key === "Escape") {
                  setIsSaving(false);
                  setName("");
                }
              }}
            />
            <Button
              size="sm"
              variant="primary"
              isDisabled={!isCrewNameValid(name)}
              onPress={saveCrew}
            >
              {t`Save`}
            </Button>
            <Button size="sm" variant="ghost" onPress={() => setIsSaving(false)}>
              {t`Cancel`}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onPress={() => setIsSaving(true)}>
            {t`Save as crew…`}
          </Button>
        )
      ) : null}
    </div>
  );
}
