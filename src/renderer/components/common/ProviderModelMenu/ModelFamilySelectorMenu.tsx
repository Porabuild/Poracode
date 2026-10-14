import type { ReactNode } from "react";
import { ProviderModelMenu } from "./ProviderModelMenu";
import type { ScopedModelOption } from "./parts/scopedModelOptions";

export type ModelFamilySelectorOption = ScopedModelOption;

/** A component model uses the standard picker, restricted to its reachable choices. */
export function ModelFamilySelectorMenu(props: {
  agentKind: string;
  label: string;
  icon: ReactNode;
  options: readonly ModelFamilySelectorOption[];
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  hideLabelOnWrap?: boolean;
  forceHideLabel?: boolean;
  collapseTier?: number;
  triggerAppearance?: "composer" | "field";
  onOpenChange?: (open: boolean) => void;
}) {
  const { agentKind, label, icon, options, value, onChange, ...menuProps } = props;
  return (
    <ProviderModelMenu
      {...menuProps}
      providers={[]}
      currentAgentKind={agentKind}
      currentModel={value}
      optionScope={{ label, icon, options }}
      onChange={(next) => onChange(next.model)}
    />
  );
}
