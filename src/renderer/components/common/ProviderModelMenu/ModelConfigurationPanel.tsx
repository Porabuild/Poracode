import { Trans, useLingui } from "@lingui/react/macro";
import {
  EffortContextMenu,
  type EffortContextMenuProps,
} from "../EffortContextMenu/EffortContextMenu";
import type { FamilyMenuSelect, ModelFamilyMenuSelection } from "./ModelConfigurationPanel.types";
import { ModelFamilySelectorMenu } from "./ModelFamilySelectorMenu";

export type ModelConfigurationPanelProps = EffortContextMenuProps & {
  familySelection: ModelFamilyMenuSelection;
};

export function ModelConfigurationPanel(props: ModelConfigurationPanelProps) {
  const { t } = useLingui();
  const selection = props.familySelection;
  const effort: FamilyMenuSelect | undefined =
    props.efforts.length > 0
      ? {
          options: props.efforts,
          value: props.effortValue ?? "",
          onChange: (value) => props.onEffortChange?.(value),
        }
      : undefined;

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-2 items-stretch gap-3 p-3">
        {selection.columns.map((column, index) => {
          const columnEffort =
            index === 0 && selection.effortScope === "primary" && effort ? effort : column.effort;
          return (
            <section
              key={column.id}
              aria-label={column.label}
              className="flex min-w-0 flex-col gap-2"
            >
              <h3 className="text-xs font-medium text-muted">{column.label}</h3>
              <ModelFamilySelectorMenu
                agentKind={selection.agentKind}
                label={column.label}
                icon={column.icon}
                options={column.models.options}
                value={column.models.value}
                onChange={column.models.onChange}
                isDisabled={props.isDisabled ?? false}
                triggerAppearance="field"
              />
              {columnEffort ? (
                <ReasoningField
                  label={t`${column.label} reasoning`}
                  select={columnEffort}
                  isDisabled={props.isDisabled ?? false}
                />
              ) : null}
            </section>
          );
        })}
      </div>
      {selection.effortScope === "shared" && effort ? (
        <section className="border-t border-border p-3" aria-label={t`Applies to both models`}>
          <p className="mb-2 text-xs text-muted">
            <Trans>Applies to both models</Trans>
          </p>
          <ReasoningField
            label={t`Reasoning`}
            select={effort}
            isDisabled={props.isDisabled ?? false}
          />
        </section>
      ) : null}
      {props.contextSizes.length > 0 || props.thinkingSupported || props.workflows ? (
        <div className="border-t border-border p-1">
          <EffortContextMenu
            efforts={[]}
            contextSizes={props.contextSizes}
            {...(props.contextValue !== undefined ? { contextValue: props.contextValue } : {})}
            {...(props.onContextChange ? { onContextChange: props.onContextChange } : {})}
            {...(props.confirmContextChange ? { confirmContextChange: true } : {})}
            {...(props.contextSizeReloadStopsSubagents
              ? { contextSizeReloadStopsSubagents: true }
              : {})}
            {...(props.thinkingSupported !== undefined
              ? { thinkingSupported: props.thinkingSupported }
              : {})}
            {...(props.thinkingValue !== undefined ? { thinkingValue: props.thinkingValue } : {})}
            {...(props.onThinkingChange ? { onThinkingChange: props.onThinkingChange } : {})}
            {...(props.workflows ? { workflows: props.workflows } : {})}
            isDisabled={props.isDisabled ?? false}
          />
        </div>
      ) : null}
    </div>
  );
}

function ReasoningField(props: { label: string; select: FamilyMenuSelect; isDisabled: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted">
        <Trans>Reasoning</Trans>
      </span>
      <EffortContextMenu
        label={props.label}
        triggerAppearance="field"
        efforts={props.select.options}
        effortValue={props.select.value}
        onEffortChange={props.select.onChange}
        contextSizes={[]}
        isDisabled={props.isDisabled}
      />
    </div>
  );
}
