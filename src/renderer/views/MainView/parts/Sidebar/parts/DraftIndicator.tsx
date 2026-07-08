import { useLingui } from "@lingui/react/macro";

/** Shared unsent-draft marker: a small accent dot rendered right after a sidebar row title. */
export function DraftIndicator() {
  const { t } = useLingui();
  return (
    <span
      role="img"
      aria-label={t`Has unsent draft`}
      className="size-1 shrink-0 rounded-full bg-accent"
    />
  );
}
