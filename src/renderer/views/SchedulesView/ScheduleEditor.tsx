import type { ReactNode } from "react";
import { Button, Input, Label, Modal, TextArea, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentStatus, ThreadPresentationMode } from "@/shared/contracts";
import { Select, ToggleSwitch } from "@/renderer/components/common";
import { useAppStore } from "@/renderer/state/appStore";
import { HOME_PROJECT_ID, isHomeProject } from "@/shared/homeScope";
import { capabilitiesForPresentation } from "@/shared/agentSelection";
import { resolveFastValue } from "@/renderer/components/thread/threadDraftViewHelpers";
import {
  buildModelPickerControls,
  buildProviderModelMenuProviders,
} from "@/renderer/components/thread/buildModelPickerControls";
import { ThreadComposer } from "@/renderer/components/thread/ThreadComposer";
import {
  type RepeatMode,
  type ScheduleDraft,
  scheduleDraftIsValid,
  weekdayShortNames,
} from "./scheduleDraft";

// Scheduled tasks always run as one-shot GUI (structured runtime) jobs, so the
// model picker mirrors the Chat presentation surface.
const PRESENTATION_MODE: ThreadPresentationMode = "gui";

interface ScheduleEditorProps {
  agents: AgentStatus[];
  busy: boolean;
  draft: ScheduleDraft | null;
  onChange: (draft: ScheduleDraft) => void;
  onClose: () => void;
  onSave: () => void;
}

const CONTROL_WIDTH = "w-[280px] max-w-[60%] shrink-0";

/** A titled group of rows, matching the settings section header treatment. */
function EditorSection(props: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
      <div className="divide-y divide-[var(--hairline)]">{props.children}</div>
    </section>
  );
}

/** Label-left / control-right row mirroring the settings `SettingRow` layout. */
function FieldRow(props: { label: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{props.label}</p>
        {props.description ? <p className="text-xs text-muted">{props.description}</p> : null}
      </div>
      <div className="flex shrink-0 justify-end">{props.children}</div>
    </div>
  );
}

export function ScheduleEditor(props: ScheduleEditorProps) {
  const { t, i18n } = useLingui();
  const projects = useAppStore((state) => state.projects);
  const draft = props.draft;
  const projectOptions = [
    { id: HOME_PROJECT_ID, label: t`Home` },
    ...projects
      .filter((project) => !isHomeProject(project) && !project.remoteServerId)
      .map((project) => ({ id: project.id, label: project.name })),
  ];
  // A schedule can reference a project that was deleted since it was created.
  // Surface it as a fallback option (rather than silently snapping to Home) so
  // the stale selection stays visible and is preserved unless the user changes
  // it.
  const missingProjectId =
    draft?.projectId != null && !projectOptions.some((option) => option.id === draft.projectId)
      ? draft.projectId
      : null;
  const projectSelectOptions = missingProjectId
    ? [...projectOptions, { id: missingProjectId, label: t`Unavailable project` }]
    : projectOptions;
  const selectedAgent = draft
    ? props.agents.find((agent) => agent.kind === draft.agentKind)
    : undefined;
  const weekdayNames = weekdayShortNames(i18n.locale);
  const timeFormatter = new Intl.DateTimeFormat(i18n.locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const timeOptions = Array.from({ length: 96 }, (_, index) => {
    const hour = Math.floor(index / 4);
    const minute = (index % 4) * 15;
    const id = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return { id, label: timeFormatter.format(new Date(2026, 0, 1, hour, minute)) };
  });
  const hourlyOptions = [0, 15, 30, 45].map((minute) => ({
    id: `00:${String(minute).padStart(2, "0")}`,
    label: minute === 0 ? t`On the hour` : t`${minute} minutes past the hour`,
  }));

  function set(next: Partial<ScheduleDraft>) {
    if (draft) props.onChange({ ...draft, ...next });
  }

  const presentedSelectedAgent = selectedAgent
    ? {
        ...selectedAgent,
        capabilities: capabilitiesForPresentation(selectedAgent.capabilities, PRESENTATION_MODE),
      }
    : undefined;
  const providers = buildProviderModelMenuProviders(props.agents, {
    presentationMode: PRESENTATION_MODE,
  });
  const modelPickerControls =
    draft && presentedSelectedAgent
      ? buildModelPickerControls({
          providers,
          selectedAgentKind: draft.agentKind,
          model: draft.model,
          ...(draft.effort ? { effort: draft.effort } : {}),
          fast: draft.fast,
          capabilities: presentedSelectedAgent.capabilities,
          presentationMode: PRESENTATION_MODE,
          includeFastToggle: true,
          onProviderModelChange: (nextSelection) => {
            const nextAgent = props.agents.find(
              (candidate) => candidate.kind === nextSelection.agentKind,
            );
            if (!nextAgent) return;
            const presented = {
              ...nextAgent,
              capabilities: capabilitiesForPresentation(nextAgent.capabilities, PRESENTATION_MODE),
            };
            const caps = presented.capabilities;
            const model = nextSelection.model;
            const efforts = caps.modelEfforts[model] ?? caps.efforts ?? [];
            const keepEffort = efforts.includes(draft.effort);
            const defaultEffort =
              caps.defaultEffort && efforts.includes(caps.defaultEffort)
                ? caps.defaultEffort
                : (efforts[0] ?? "");
            set({
              agentKind: nextSelection.agentKind,
              model,
              effort: keepEffort ? draft.effort : defaultEffort,
              fast: resolveFastValue(presented, model, draft.fast),
            });
          },
          onConfigPatch: (patch) => {
            const next: Partial<ScheduleDraft> = {};
            if (patch.effort !== undefined) next.effort = patch.effort;
            if (patch.fast !== undefined) next.fast = patch.fast;
            if (Object.keys(next).length > 0) set(next);
          },
        })
      : [];

  return (
    <Modal.Backdrop
      isOpen={draft !== null}
      onOpenChange={(open) => !open && !props.busy && props.onClose()}
    >
      <Modal.Container size="md">
        <Modal.Dialog className="sm:max-w-[600px]">
          <Modal.CloseTrigger isDisabled={props.busy} />
          <Modal.Header>
            <Modal.Heading>{draft?.id ? t`Edit schedule` : t`Create scheduled task`}</Modal.Heading>
          </Modal.Header>
          {draft ? (
            <>
              <Modal.Body className="gap-6">
                <FieldRow
                  label={<Trans>Active</Trans>}
                  description={
                    <Trans>Run this schedule automatically on the schedule below.</Trans>
                  }
                >
                  <ToggleSwitch
                    aria-label={t`Active`}
                    isSelected={draft.enabled}
                    onChange={(enabled) => set({ enabled })}
                  />
                </FieldRow>

                <TextField value={draft.name} onChange={(name) => set({ name })}>
                  <Label>
                    <Trans>Schedule name</Trans>
                  </Label>
                  <Input placeholder={t`Daily brief`} />
                </TextField>

                <TextField value={draft.prompt} onChange={(prompt) => set({ prompt })}>
                  <Label>
                    <Trans>Instructions</Trans>
                  </Label>
                  <TextArea rows={4} placeholder={t`Describe what the agent should do`} />
                </TextField>

                <FieldRow
                  label={<Trans>Project</Trans>}
                  description={<Trans>Where the run's conversation is created.</Trans>}
                >
                  <Select
                    aria-label={t`Project`}
                    className={CONTROL_WIDTH}
                    options={projectSelectOptions}
                    value={draft.projectId ?? HOME_PROJECT_ID}
                    onChange={(value) =>
                      set({ projectId: value === HOME_PROJECT_ID ? null : value })
                    }
                  />
                </FieldRow>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    <Trans>Agent</Trans>
                  </h3>
                  {modelPickerControls.length > 0 ? (
                    <ThreadComposer
                      compact
                      toolbarOnly
                      hideSubmitButton
                      controls={modelPickerControls}
                      placeholder=""
                      prompt=""
                      submitDisabled
                      submitLabel=""
                      onPromptChange={() => undefined}
                      onSubmit={() => undefined}
                    />
                  ) : null}
                </section>

                <EditorSection title={<Trans>Frequency</Trans>}>
                  <FieldRow label={<Trans>Repeat</Trans>}>
                    <Select
                      aria-label={t`Repeat`}
                      className={CONTROL_WIDTH}
                      options={[
                        { id: "hourly", label: t`Hourly` },
                        { id: "daily", label: t`Daily` },
                        { id: "weekdays", label: t`Weekdays` },
                        { id: "weekly", label: t`Weekly` },
                        { id: "custom", label: t`Custom` },
                        { id: "once", label: t`One time` },
                      ]}
                      value={draft.repeatMode}
                      onChange={(repeatMode) => set({ repeatMode: repeatMode as RepeatMode })}
                    />
                  </FieldRow>
                  {draft.repeatMode === "weekly" || draft.repeatMode === "custom" ? (
                    <FieldRow label={<Trans>On</Trans>}>
                      <div className="flex flex-wrap justify-end gap-1">
                        {weekdayNames.map((label, day) => {
                          const selected = draft.days.includes(day);
                          return (
                            <Button
                              key={day}
                              size="sm"
                              className="min-w-11"
                              variant={selected ? "secondary" : "tertiary"}
                              aria-pressed={selected}
                              onPress={() => {
                                const days =
                                  draft.repeatMode === "weekly"
                                    ? [day]
                                    : selected
                                      ? draft.days.filter((value) => value !== day)
                                      : [...draft.days, day].sort((left, right) => left - right);
                                set({ days });
                              }}
                            >
                              {label}
                            </Button>
                          );
                        })}
                      </div>
                    </FieldRow>
                  ) : null}
                  {draft.repeatMode === "once" ? (
                    <FieldRow label={<Trans>Run at</Trans>}>
                      <TextField
                        aria-label={t`Run at`}
                        className={CONTROL_WIDTH}
                        type="datetime-local"
                        value={draft.runAt}
                        onChange={(runAt) => set({ runAt })}
                      >
                        <Input />
                      </TextField>
                    </FieldRow>
                  ) : (
                    <FieldRow
                      label={
                        draft.repeatMode === "hourly" ? <Trans>At</Trans> : <Trans>Time</Trans>
                      }
                    >
                      <Select
                        aria-label={draft.repeatMode === "hourly" ? t`Minute` : t`Time`}
                        className={CONTROL_WIDTH}
                        options={draft.repeatMode === "hourly" ? hourlyOptions : timeOptions}
                        value={draft.time}
                        onChange={(time) => set({ time })}
                      />
                    </FieldRow>
                  )}
                </EditorSection>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="ghost" isDisabled={props.busy} onPress={props.onClose}>
                  <Trans>Cancel</Trans>
                </Button>
                <Button
                  variant="tertiary"
                  className="text-foreground"
                  isPending={props.busy}
                  isDisabled={!scheduleDraftIsValid(draft)}
                  onPress={props.onSave}
                >
                  {draft.id ? <Trans>Save changes</Trans> : <Trans>Create schedule</Trans>}
                </Button>
              </Modal.Footer>
            </>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
