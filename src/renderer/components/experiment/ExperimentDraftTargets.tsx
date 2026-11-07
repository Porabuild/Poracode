import { Tooltip } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { FlaskConical, Plus, X } from "lucide-react";
import type { ExperimentCandidateSpec } from "@/renderer/actions/experimentActions";
import { Button } from "@/renderer/components/common/Button";
import { PoracodeGlyph } from "@/renderer/components/common/PoracodeGlyph";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { crewModelLabelOf } from "@/renderer/components/crew/crewComposerModel";
import { threadCrewBinding } from "@/shared/crew";
import {
  ThreadDockActionRow,
  ThreadDockHeader,
  ThreadDockList,
  ThreadDockSection,
} from "@/renderer/components/thread/ThreadDockUI";
import { formatEffortLabel } from "@/renderer/components/thread/threadDraftViewHelpers";

export interface ExperimentDraftCandidate extends ExperimentCandidateSpec {
  id: string;
  icon?: string;
  modelLabel: string;
}

export function ExperimentDraftTargets(props: {
  candidates: readonly ExperimentDraftCandidate[];
  isSubmitting: boolean;
  isAddDisabled: boolean;
  onRemove: (id: string) => void;
  onCancel: () => void;
  onAdd: () => void;
}) {
  const { t } = useLingui();
  const agentStatuses = useAgentStatusesStore((state) => state.agentStatuses);
  const wslStatuses = useAgentStatusesStore((state) => state.wslAgentStatuses);
  const statuses = [...agentStatuses, ...wslStatuses];
  const agentCount = props.candidates.reduce((count, candidate) => {
    const crew = threadCrewBinding(candidate.config);
    return count + 1 + (crew?.roles.reduce((total, role) => total + (role.parallel ?? 1), 0) ?? 0);
  }, 0);

  return (
    <ThreadDockSection ariaLabel={t`Experiment`} placement="composer">
      <ThreadDockHeader
        icon={FlaskConical}
        title={t`Experiment`}
        countLabel={
          <span>
            <Plural value={props.candidates.length} one="# candidate" other="# candidates" />
            {" · "}
            {agentCount > 16 ? (
              <Tooltip delay={0}>
                <Tooltip.Trigger>
                  <span className="cursor-help text-danger underline decoration-dotted">
                    <Plural value={agentCount} one="up to # agent" other="up to # agents" />
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Content>{t`More than 16 agents can run at once.`}</Tooltip.Content>
              </Tooltip>
            ) : (
              <Plural value={agentCount} one="up to # agent" other="up to # agents" />
            )}
          </span>
        }
        actions={
          <div className="flex items-center gap-0.5">
            <Tooltip delay={0}>
              <Tooltip.Trigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className="size-6 min-w-0 shrink-0 text-muted"
                  aria-label={t`Add candidate`}
                  isDisabled={props.isAddDisabled}
                  onPress={props.onAdd}
                >
                  <Plus className="size-3.5" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>
                <Trans>Add candidate</Trans>
              </Tooltip.Content>
            </Tooltip>
            <Tooltip delay={0}>
              <Tooltip.Trigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className="size-6 min-w-0 shrink-0 text-muted"
                  aria-label={t`Cancel`}
                  isDisabled={props.isSubmitting}
                  onPress={props.onCancel}
                >
                  <X className="size-3.5" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>
                <Trans>Cancel</Trans>
              </Tooltip.Content>
            </Tooltip>
          </div>
        }
      />
      {props.candidates.length > 0 ? (
        <ThreadDockList placement="composer" gap="1">
          {props.candidates.map((candidate, index) => {
            const provider = candidate.agentLabel ?? candidate.agentKind;
            const crew = threadCrewBinding(candidate.config);
            const helperCount =
              crew?.roles.reduce((total, role) => total + (role.parallel ?? 1), 0) ?? 0;
            const lead = crewModelLabelOf(statuses, {
              agentKind: candidate.agentKind,
              model: candidate.config.model,
            });
            const crewName = crew?.name?.trim() || t`Crew`;
            const label = [
              crew ? `${lead} + ${helperCount}` : candidate.modelLabel,
              candidate.config.effort ? formatEffortLabel(candidate.config.effort) : undefined,
              candidate.config.fast ? t`Fast` : undefined,
            ]
              .filter((value): value is string => !!value)
              .join(" · ");
            const details = [
              label ? (crew ? label : provider) : undefined,
              candidate.presentationMode === "terminal" ? t`CLI` : t`Chat`,
            ]
              .filter((value): value is string => !!value)
              .join(" · ");
            const title = crew ? crewName : label || provider;
            return (
              <ThreadDockActionRow
                key={candidate.id}
                title={details ? `${title} · ${details}` : title}
                action={<X className="size-3" />}
                actionLabel={t`Remove candidate ${index + 1}`}
                actionTitle={t`Remove candidate ${index + 1}`}
                onAction={() => props.onRemove(candidate.id)}
                isActionDisabled={props.isSubmitting}
              >
                {crew ? (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <PoracodeGlyph className="size-3.5" />
                    {[
                      ...new Set([
                        candidate.agentKind,
                        ...crew.roles.map((role) => role.selection.agentKind),
                      ]),
                    ]
                      .slice(0, 4)
                      .map((kind) => {
                        const status = statuses.find((entry) => entry.kind === kind);
                        return (
                          <ProviderIcon
                            key={kind}
                            kind={kind}
                            {...(status?.icon ? { icon: status.icon } : {})}
                            fallbackLabel={status?.label ?? kind}
                            className="size-3.5"
                          />
                        );
                      })}
                  </span>
                ) : (
                  <ProviderIcon
                    kind={candidate.agentKind}
                    fallbackLabel={provider}
                    {...(candidate.icon ? { icon: candidate.icon } : {})}
                    className="size-3.5 shrink-0"
                  />
                )}
                <span className="min-w-0 flex-1 truncate leading-5 text-foreground">{title}</span>
                {details ? (
                  <span className="max-w-[55%] shrink-0 truncate text-foreground-muted opacity-80">
                    {details}
                  </span>
                ) : null}
              </ThreadDockActionRow>
            );
          })}
        </ThreadDockList>
      ) : null}
    </ThreadDockSection>
  );
}
