import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { FlaskConical, Play, X } from "lucide-react";
import type { ExperimentCandidateSpec } from "@/renderer/actions/experimentActions";
import { Button } from "@/renderer/components/common/Button";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";

export interface ExperimentDraftCandidate extends ExperimentCandidateSpec {
  id: string;
  icon?: string;
}

export function ExperimentDraftTargets(props: {
  candidates: readonly ExperimentDraftCandidate[];
  baseBranch: string;
  isSubmitting: boolean;
  onRemove: (id: string) => void;
  onCancel: () => void;
  onRun: () => void;
}) {
  const { t } = useLingui();

  return (
    <div className="mt-1.5 flex flex-col gap-1 px-1">
      {props.candidates.length > 0 ? (
        props.candidates.map((candidate, index) => {
          const label = candidate.agentLabel ?? candidate.agentKind;
          const details = [
            candidate.config.model,
            candidate.config.effort,
            candidate.config.fast ? t`Fast` : undefined,
            candidate.presentationMode === "terminal" ? t`CLI` : t`Chat`,
          ].filter((value): value is string => !!value);
          return (
            <div
              key={candidate.id}
              className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-border/70 bg-surface-secondary/70 px-2"
            >
              <ProviderIcon
                kind={candidate.agentKind}
                fallbackLabel={label}
                {...(candidate.icon ? { icon: candidate.icon } : {})}
                className="size-4 shrink-0"
              />
              <span className="shrink-0 text-xs font-medium">{label}</span>
              {details.length > 0 ? (
                <span className="min-w-0 flex-1 truncate text-xs text-muted">
                  {details.join(" · ")}
                </span>
              ) : (
                <span className="min-w-0 flex-1" />
              )}
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className="size-6 min-w-0 shrink-0 text-muted hover:text-danger"
                aria-label={t`Remove candidate ${index + 1}`}
                isDisabled={props.isSubmitting}
                onPress={() => props.onRemove(candidate.id)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          );
        })
      ) : (
        <div className="flex h-8 items-center gap-2 px-2 text-xs text-muted">
          <FlaskConical className="size-3.5 shrink-0" />
          <Trans>Run one prompt with multiple agents, then compare their work.</Trans>
        </div>
      )}

      <div className="flex min-h-8 items-center gap-2 px-1">
        <span className="text-xs text-muted">
          <Plural value={props.candidates.length} one="# candidate" other="# candidates" />
        </span>
        <span className="min-w-0 truncate text-xs text-muted">
          <Trans>
            Fork from <span className="font-mono">{props.baseBranch}</span>
          </Trans>
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2 text-xs text-muted"
          isDisabled={props.isSubmitting}
          onPress={props.onCancel}
        >
          <Trans>Cancel</Trans>
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          className="h-7 px-2.5 text-xs"
          isDisabled={props.candidates.length < 2 || props.isSubmitting}
          isPending={props.isSubmitting}
          onPress={props.onRun}
        >
          <Play className="size-3.5 fill-current" />
          <Trans>Run experiment</Trans>
        </Button>
      </div>
    </div>
  );
}
