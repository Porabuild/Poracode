import { useLingui } from "@lingui/react/macro";
import { ArrowLeftRight, PencilOff, SlidersHorizontal, Zap } from "lucide-react";
import { ToggleButton, Tooltip } from "@heroui/react";
import { CrewRolePill } from "./CrewRolePill";
import { ProviderModelMenu } from "@/renderer/components/common/ProviderModelMenu/ProviderModelMenu";
import { distinctSubProviderLabel } from "@/renderer/components/common/ProviderModelMenu";
import { modelFamilyMemberDisplay } from "@/renderer/components/common/ProviderModelMenu/parts/modelFamilyDisplay";
import { splitModelLabel } from "@/renderer/components/common/ProviderModelMenu/parts/splitModelLabel";
import { EffortContextMenu } from "@/renderer/components/common/EffortContextMenu/EffortContextMenu";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { ThreadDockIconButton } from "@/renderer/components/thread/ThreadDockUI";
import { modelSelectionFor } from "@/shared/agentSelection";
import type { AgentCapability } from "@/shared/contracts";
import type { CrewMemberSelection, CrewRole } from "@/shared/crew";
import { formatEffortLabel } from "@/renderer/components/thread/threadDraftViewHelpers";
import { CrewRoleDetails } from "./CrewRoleDetails";
import type { CrewRosterModel } from "./crewComposerModel";

/** Context lengths a member's model offers; empty unless there is a choice (2+). */
export function contextSizesFor(
  capabilities: AgentCapability | undefined,
  model: string,
): NonNullable<AgentCapability["contextSizes"]> {
  const ids = capabilities?.modelContextSizes?.[model];
  const sizes = ids
    ? (capabilities?.contextSizes?.filter((size) => ids.includes(size.id)) ?? [])
    : [];
  return sizes.length > 1 ? sizes : [];
}

/** The member's context length, or the model's default when unset or no longer offered. */
export function contextSizeValueFor(
  capabilities: AgentCapability | undefined,
  model: string,
  preferred: string | undefined,
): string | undefined {
  const allowed = capabilities?.modelContextSizes?.[model];
  if (!allowed?.length) return undefined;
  if (preferred && allowed.includes(preferred)) return preferred;
  const fallback = capabilities?.defaultContextSize;
  return fallback && allowed.includes(fallback) ? fallback : allowed[0];
}

export function CrewMemberRow(props: {
  model: CrewRosterModel;
  selection: CrewMemberSelection;
  role?: CrewRole;
  isLead: boolean;
  isEdited: boolean;
  isEditing: boolean;
  onEditToggle: () => void;
  onSelectionChange: (selection: CrewMemberSelection) => void;
  onRoleChange: (patch: Partial<CrewRole>) => void;
  onRemoveRole: () => void;
}) {
  const { t } = useLingui();
  const { model, selection, role, isLead } = props;
  const providers = isLead ? model.leadProviders : model.helperOptions.providers;
  const provider = providers.find((candidate) => candidate.kind === selection.agentKind);
  const selectedModel = provider?.capabilities.models.find(
    (candidate) => candidate.id === selection.model,
  );
  const modelLabel = model.helperOptions.modelLabelOf(selection);
  const modelFamily = provider
    ? modelFamilyMemberDisplay(provider.capabilities, selection.model)
    : undefined;
  const subProviderLabel =
    provider && !modelFamily
      ? distinctSubProviderLabel(
          selection.model,
          provider.capabilities,
          provider.label,
          splitModelLabel(modelLabel).name,
        )
      : undefined;
  const selectionInfo = provider
    ? modelSelectionFor(provider.capabilities, selection.model)
    : undefined;
  const efforts =
    selectionInfo?.reasoning.values.map((id) => ({ id, label: formatEffortLabel(id) })) ?? [];
  const effortValue = selection.effort ?? selectionInfo?.reasoning.default;
  const reasoning = effortValue ? formatEffortLabel(effortValue) : undefined;
  const memberLabel = isLead ? t`Lead` : (role?.label ?? "");
  const contextSizes = contextSizesFor(provider?.capabilities, selection.model);
  const contextValue = contextSizeValueFor(
    provider?.capabilities,
    selection.model,
    selection.contextSize,
  );
  const fastAvailable = selectionInfo?.fast.available === true;
  const leadFastControl = isLead ? model.leadFastControl : undefined;
  // The producer descriptor owns encoded Fast (the saved carrier stays inert)
  // and the canonical family-resolved edit; helpers keep the local fallback.
  const fastSelected = leadFastControl ? leadFastControl.isSelected : selection.fast === true;
  const fastDisabled = leadFastControl
    ? leadFastControl.isDisabled === true ||
      Boolean(leadFastControl.disabledReason) ||
      leadFastControl.onChange === undefined ||
      model.isDisabled
    : !fastAvailable || model.isDisabled;
  const fastDisabledReason =
    leadFastControl?.disabledReason ??
    selectionInfo?.fast.disabledReason ??
    t`Fast is unavailable for this model.`;

  // QUICK settings: the pickers change only their own carrier — a model pick
  // keeps effort and context length when the new model still offers them and
  // drops Fast when the new model cannot run it.
  function changeModel(next: { agentKind: string; model: string }) {
    const nextProvider = providers.find((candidate) => candidate.kind === next.agentKind);
    const nextModel = nextProvider?.capabilities.models.find(
      (candidate) => candidate.id === next.model,
    );
    if (!nextProvider || !nextModel) return;
    const nextInfo = modelSelectionFor(nextProvider.capabilities, next.model);
    const nextEffort =
      selection.effort !== undefined && nextInfo.reasoning.values.includes(selection.effort)
        ? selection.effort
        : nextInfo.reasoning.default;
    const keepsContextSize =
      selection.contextSize !== undefined &&
      (nextProvider.capabilities.modelContextSizes?.[next.model] ?? []).includes(
        selection.contextSize,
      );
    props.onSelectionChange({
      agentKind: next.agentKind,
      model: next.model,
      ...(nextEffort ? { effort: nextEffort } : {}),
      ...(selection.fast === true && nextInfo.fast.available ? { fast: true } : {}),
      ...(keepsContextSize ? { contextSize: selection.contextSize } : {}),
    });
  }

  const modelButton = (
    <ProviderModelMenu
      triggerAppearance="label"
      triggerLabel={modelLabel}
      menuLabel={t`Model for ${memberLabel}`}
      providers={providers}
      currentAgentKind={selection.agentKind}
      currentModel={selection.model}
      {...(!model.isDraft && isLead ? { lockedAgentKind: model.lead.agentKind } : {})}
      isDisabled={model.isDisabled}
      onChange={(next) => changeModel({ agentKind: next.agentKind, model: next.model })}
    />
  );

  const reasoningControl =
    efforts.length > 1 || contextSizes.length > 0 ? (
      <EffortContextMenu
        triggerAppearance="label"
        label={t`Reasoning for ${memberLabel}`}
        efforts={efforts.length > 1 ? efforts : []}
        {...(effortValue !== undefined ? { effortValue } : {})}
        onEffortChange={(effort) => props.onSelectionChange({ ...selection, effort })}
        contextSizes={contextSizes}
        {...(contextValue !== undefined ? { contextValue } : {})}
        onContextChange={(contextSize) => props.onSelectionChange({ ...selection, contextSize })}
        // The lead's context length applies to the running session, which
        // reloads; helpers pick it up on their next run.
        confirmContextChange={isLead && !model.isDraft}
        isDisabled={model.isDisabled}
      />
    ) : reasoning ? (
      <span className="inline-flex h-4 min-w-0 items-center px-1 text-[11px] leading-4 text-muted">
        <span className="min-w-0 truncate">{reasoning}</span>
      </span>
    ) : null;

  const noEditsIcon = role?.noEdits ? (
    <Tooltip delay={0}>
      <Tooltip.Trigger role="none" tabIndex={-1}>
        <PencilOff
          className="ml-1 size-3 shrink-0 text-muted/80"
          role="img"
          aria-label={t`Told not to edit files. Not enforced.`}
        />
      </Tooltip.Trigger>
      <Tooltip.Content placement="top">{t`Told not to edit files. Not enforced.`}</Tooltip.Content>
    </Tooltip>
  ) : null;

  const fastToggle = (
    <Tooltip delay={0} isDisabled={!fastDisabled}>
      <ToggleButton
        aria-label={t`Fast for ${memberLabel}`}
        aria-pressed={fastSelected}
        aria-disabled={fastDisabled}
        isSelected={fastSelected && !fastDisabled}
        isDisabled={model.isDisabled}
        size="sm"
        variant="ghost"
        className={`size-5 min-h-5 min-w-5 shrink-0 rounded p-0 text-muted hover:text-foreground ${
          fastSelected ? "text-foreground" : ""
        }${fastDisabled && !model.isDisabled ? " cursor-not-allowed opacity-50" : ""}`}
        onChange={(fast) => {
          if (fastDisabled) return;
          if (leadFastControl?.onChange) leadFastControl.onChange(fast);
          else props.onSelectionChange({ ...selection, fast });
        }}
      >
        <Zap className="size-3" fill={fastSelected ? "currentColor" : "none"} />
      </ToggleButton>
      {fastDisabled ? (
        <Tooltip.Content placement="top">{fastDisabledReason}</Tooltip.Content>
      ) : null}
    </Tooltip>
  );

  const trailing = isLead ? (
    !model.isDraft && model.onHandOff ? (
      <ThreadDockIconButton
        compact
        label={t`Hand off to another lead…`}
        isDisabled={model.isDisabled}
        onPress={model.onHandOff}
      >
        <ArrowLeftRight className="size-3" />
      </ThreadDockIconButton>
    ) : null
  ) : (
    <ThreadDockIconButton
      compact
      label={t`Role details`}
      ariaExpanded={props.isEditing}
      isDisabled={model.isDisabled}
      onPress={props.onEditToggle}
    >
      <SlidersHorizontal className="size-3" />
    </ThreadDockIconButton>
  );

  const rolePill = <CrewRolePill role={role} isLead={isLead} leadLabel={t`Lead`} />;

  return (
    <>
      <div className="grid min-h-12 grid-cols-[8px_14px_minmax(0,1fr)_auto] grid-rows-2 items-center gap-x-2 gap-y-1 py-1">
        <span className="col-start-1 row-span-2 flex size-2 items-center justify-center">
          {props.isEdited ? (
            <Tooltip delay={0}>
              <Tooltip.Trigger aria-label={t`Changed for this thread`}>
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
              </Tooltip.Trigger>
              <Tooltip.Content placement="top">{t`Changed for this thread`}</Tooltip.Content>
            </Tooltip>
          ) : null}
        </span>
        <ProviderIcon
          kind={selection.agentKind}
          {...(provider?.icon ? { icon: provider.icon } : {})}
          fallbackLabel={provider?.label ?? selection.agentKind}
          tone="inactive"
          className="col-start-2 row-span-2 size-3.5 shrink-0"
        />
        <div className="col-start-3 row-span-2 grid min-w-0 grid-rows-2 gap-0">
          <span
            className={`${
              subProviderLabel
                ? "grid min-w-0 max-w-full grid-cols-[minmax(0,max-content)_minmax(0,1fr)] items-center gap-x-0.5"
                : "flex min-w-0 max-w-full items-center"
            } ${selectedModel ? "text-foreground" : "text-muted"}`}
          >
            {modelButton}
            {subProviderLabel ? (
              <span
                title={subProviderLabel}
                className="min-w-0 truncate text-[9px] leading-4 text-muted"
              >
                {subProviderLabel}
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 max-w-full items-center gap-1">
            {reasoningControl}
            {noEditsIcon}
          </span>
        </div>
        <span className="col-start-4 row-span-2 flex items-center justify-end gap-1">
          {rolePill}
          {fastToggle}
          {trailing}
        </span>
      </div>
      {props.isEditing && role ? (
        <CrewRoleDetails
          model={model}
          role={role}
          canRemove={model.binding.roles.length > 1}
          onRoleChange={props.onRoleChange}
          onRemoveRole={props.onRemoveRole}
        />
      ) : null}
    </>
  );
}
