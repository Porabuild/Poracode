import { useLingui } from "@lingui/react/macro";
import {
  EffortContextMenu,
  type EffortContextMenuProps,
} from "../EffortContextMenu/EffortContextMenu";
import type { FamilyMenuSelect, ModelFamilyMenuSelection } from "./ModelConfigurationPanel.types";
import { ConfigurationDropdown } from "./ConfigurationDropdown";

export type ModelConfigurationPanelProps = EffortContextMenuProps & {
  familySelection: ModelFamilyMenuSelection;
};

/** Compact paired settings, with equal-height columns independent of option counts. */
export function ModelConfigurationPanel(props: ModelConfigurationPanelProps & { mobile: boolean }) {
  const { t } = useLingui();
  const { mobile } = props;
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
          // The common primary carrier wins over representative label metadata.
          const columnEffort =
            index === 0 && selection.effortScope === "primary" && effort ? effort : column.effort;
          return (
            <section
              key={column.id}
              aria-label={column.label}
              className="flex min-w-0 flex-col gap-2"
            >
              <h3 className="text-xs font-medium text-muted">{column.label}</h3>
              <ConfigurationDropdown
                label={column.label}
                select={column.models}
                disabled={props.isDisabled ?? false}
                mobile={mobile}
                searchable
              />
              {columnEffort ? (
                <ConfigurationDropdown
                  label={t`${column.label} reasoning`}
                  visibleLabel={t`Reasoning`}
                  select={columnEffort}
                  disabled={props.isDisabled ?? false}
                  mobile={mobile}
                />
              ) : null}
            </section>
          );
        })}
      </div>
      {selection.effortScope === "shared" && effort ? (
        <section
          className="border-t border-border px-1 pb-1"
          aria-label={t`Applies to both models`}
        >
          <p className="px-3 pt-2 text-xs text-muted">{t`Applies to both models`}</p>
          <ConfigurationDropdown
            label={t`Reasoning`}
            select={effort}
            disabled={props.isDisabled ?? false}
            mobile={mobile}
          />
        </section>
      ) : null}
      {props.contextSizes.length > 0 || props.thinkingSupported ? (
        <div className="border-t border-border p-1">
          <EffortContextMenu
            efforts={[]}
            contextSizes={props.contextSizes}
            {...(props.contextValue !== undefined ? { contextValue: props.contextValue } : {})}
            {...(props.onContextChange ? { onContextChange: props.onContextChange } : {})}
            {...(props.confirmContextChange ? { confirmContextChange: true } : {})}
            {...(props.thinkingSupported
              ? { thinkingSupported: true, thinkingValue: props.thinkingValue ?? false }
              : {})}
            {...(props.onThinkingChange ? { onThinkingChange: props.onThinkingChange } : {})}
            isDisabled={props.isDisabled ?? false}
          />
        </div>
      ) : null}
    </div>
  );
}
