import { useLingui } from "@lingui/react/macro";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/renderer/components/common/Button";
import { Input } from "@/renderer/components/common/Input";
import { OptionMenu } from "@/renderer/components/common/OptionMenu";
import { ToggleSwitch } from "@/renderer/components/common/ToggleSwitch";
import { ProviderModelMenu } from "@/renderer/components/common/ProviderModelMenu/ProviderModelMenu";
import { ThreadDockIconButton } from "@/renderer/components/thread/ThreadDockUI";
import type { CrewRole } from "@/shared/crew";
import type { CrewRosterModel } from "./crewComposerModel";

const MAX_FALLBACKS = 3;

/**
 * DETAILED settings for a helper role, expanded inline under its roster row.
 * Quick model/reasoning/Fast edits stay on the row itself; this panel owns the
 * role-level fields plus (in settings) the fallback chain.
 */
export function CrewRoleDetails(props: {
  model: CrewRosterModel;
  role: CrewRole;
  canRemove: boolean;
  onRoleChange: (patch: {
    label?: string;
    brief?: string;
    noEdits?: true | undefined;
    parallel?: number;
    fallbacks?: CrewRole["fallbacks"];
  }) => void;
  onRemoveRole: () => void;
}) {
  const { t } = useLingui();
  const { model, role } = props;
  const fallbacks = role.fallbacks ?? [];

  return (
    <div className="ml-6 flex flex-col gap-2 py-1.5">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] text-muted">{t`Role name`}</span>
          <Input
            aria-label={t`Role name`}
            maxLength={24}
            value={role.label}
            onChange={(event) => props.onRoleChange({ label: event.target.value })}
            variant="secondary"
            className="h-7 min-w-0 text-xs"
          />
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <span className="text-[11px] text-muted">{t`At once`}</span>
          <OptionMenu
            placeholder={t`At once`}
            value={String(role.parallel ?? 1)}
            options={["1", "2", "3", "4"]}
            isDisabled={model.isDisabled}
            onChange={(parallel) => props.onRoleChange({ parallel: Number(parallel) })}
            className="h-7 min-w-0 px-2 text-xs"
          />
        </div>
        {props.canRemove ? (
          <div className="shrink-0 pb-0.5">
            <ThreadDockIconButton
              danger
              label={t`Remove role`}
              isDisabled={model.isDisabled}
              onPress={props.onRemoveRole}
            >
              <Trash2 className="size-3.5" />
            </ThreadDockIconButton>
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] text-muted">{t`When to use`}</span>
        <Input
          aria-label={t`When to use`}
          maxLength={160}
          value={role.brief ?? ""}
          onChange={(event) => props.onRoleChange({ brief: event.target.value })}
          variant="secondary"
          className="h-7 min-w-0 text-xs"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-foreground">{t`Read-only`}</span>
        <ToggleSwitch
          size="sm"
          aria-label={t`Read-only`}
          isSelected={role.noEdits === true}
          isDisabled={model.isDisabled}
          onChange={(noEdits) =>
            props.onRoleChange(noEdits ? { noEdits: true } : { noEdits: undefined })
          }
        />
      </div>
      {model.showFallbacks ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[11px] text-muted">{t`If this agent is unavailable, try:`}</p>
          {fallbacks.map((fallback, index) => (
            <div
              key={`${fallback.agentKind}:${fallback.model}:${index}`}
              className="flex min-w-0 items-center gap-1"
            >
              <ProviderModelMenu
                triggerAppearance="field"
                providers={model.helperOptions.providers}
                currentAgentKind={fallback.agentKind}
                currentModel={fallback.model}
                onChange={(next) => {
                  const selection = model.helperOptions.selectionFor(next.agentKind, next.model);
                  if (!selection) return;
                  const nextFallbacks = [...fallbacks];
                  nextFallbacks[index] = selection;
                  props.onRoleChange({ fallbacks: nextFallbacks });
                }}
              />
              <ThreadDockIconButton
                compact
                label={t`Remove fallback`}
                onPress={() =>
                  props.onRoleChange({
                    fallbacks: fallbacks.filter((_fallback, itemIndex) => itemIndex !== index),
                  })
                }
              >
                <X className="size-3" />
              </ThreadDockIconButton>
            </div>
          ))}
          {fallbacks.length < MAX_FALLBACKS ? (
            <Button
              size="sm"
              variant="ghost"
              isDisabled={model.isDisabled}
              className="h-7 self-start gap-1.5 px-1.5 text-xs text-muted hover:text-foreground"
              onPress={() => {
                const unavailableKinds = new Set([
                  role.selection.agentKind,
                  ...fallbacks.map((fallback) => fallback.agentKind),
                ]);
                const provider = model.helperOptions.providers.find(
                  (candidate) => !unavailableKinds.has(candidate.kind),
                );
                const fallbackModel = provider?.capabilities.models[0];
                const selection = fallbackModel
                  ? model.helperOptions.selectionFor(provider.kind, fallbackModel.id)
                  : undefined;
                if (selection) {
                  props.onRoleChange({ fallbacks: [...fallbacks, selection] });
                }
              }}
            >
              <Plus className="size-3.5" />
              {t`Add fallback`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
