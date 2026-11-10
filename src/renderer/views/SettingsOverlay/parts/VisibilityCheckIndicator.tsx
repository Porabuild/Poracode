import { Check, Minus } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ModelVisibilityCheckState } from "./modelVisibilityGroups";

export function checkAria(state: ModelVisibilityCheckState) {
  return {
    "aria-selected": state === "all",
    "aria-checked":
      state === "all"
        ? ("true" as const)
        : state === "none"
          ? ("false" as const)
          : ("mixed" as const),
  };
}

export function CheckStateHint(props: { state: ModelVisibilityCheckState }) {
  const { t } = useLingui();
  const labels = {
    all: t`Checked`,
    some: t`Partially checked`,
    none: t`Unchecked`,
  } as const;
  // HeroUI's ListBox strips custom aria-checked, so expose the state to
  // screen readers through the accessible name instead.
  return <span className="sr-only">({labels[props.state]})</span>;
}

export function VisibilityCheckIndicator(props: {
  state: ModelVisibilityCheckState;
  size?: "sm" | "md";
}) {
  const { state, size = "md" } = props;
  const boxClass = size === "sm" ? "size-3" : "size-3.5";
  const iconClass = size === "sm" ? "size-2" : "size-2.5";
  const stateClass =
    state === "all"
      ? "border-foreground/85 bg-foreground text-background"
      : state === "some"
        ? "border-foreground/50 bg-foreground/15 text-foreground"
        : "border-[var(--hairline-strong)] bg-transparent text-transparent group-hover:border-foreground/35";

  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${boxClass} shrink-0 items-center justify-center rounded-xl border transition-colors ${stateClass}`}
    >
      {state === "some" ? (
        <Minus className={`${iconClass} stroke-[2.5]`} />
      ) : state === "all" ? (
        <Check className={`${iconClass} stroke-[2.75]`} />
      ) : null}
    </span>
  );
}
