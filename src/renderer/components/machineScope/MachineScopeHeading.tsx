import { useLingui } from "@lingui/react/macro";

/**
 * Micro-heading separating machine-scoped rows from rows shared by every
 * machine. Uses the sidebar group-header idiom rather than a badge so the
 * grouping reads as structure, not decoration.
 */
export function MachineScopeHeading(props: { scope: "machine" | "all"; machineLabel?: string }) {
  const { t } = useLingui();
  const text =
    props.scope === "all" ? t`All machines` : t`On ${props.machineLabel ?? t`this machine`}`;
  return (
    <p className="pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
      {text}
    </p>
  );
}
