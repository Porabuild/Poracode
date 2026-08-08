import { Megaphone, X } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { useChangelogStore, useHasUnseenChangelog } from "@/renderer/state/changelogStore";

/**
 * Whether `WhatsNewButton` renders anything (hidden by the user with nothing
 * new to announce → it stays out). The collapsed footer nav reads this to
 * keep its overflow math in sync with the component's own rule.
 */
export function useWhatsNewEntryVisible(): boolean {
  const hasUnseen = useHasUnseenChangelog();
  const hidden = useChangelogStore((s) => s.whatsNewHidden);
  return !hidden || hasUnseen;
}

/**
 * Sidebar entry for the changelog. Clicking it opens the "What's New" dialog.
 * An accent dot marks an unread release. On expanded rows a hide (X) control —
 * revealed on hover — removes the entry from the sidebar; it comes back on its
 * own when a newer release is unread. The changelog also lives in Settings →
 * Changelog regardless.
 */
export function WhatsNewButton(props: {
  iconOnly?: boolean;
  /** Icon-only tooltip placement; bottom icon rows pass "top". */
  tooltipPlacement?: "right" | "top";
}) {
  const { iconOnly = false, tooltipPlacement = "right" } = props;
  const { t } = useLingui();
  const hasUnseen = useHasUnseenChangelog();
  const hidden = useChangelogStore((s) => s.whatsNewHidden);

  // Hidden by the user and nothing new to announce → don't render. A new unread
  // release overrides the hide so updates still surface.
  if (hidden && !hasUnseen) return null;

  const icon = (
    <span className="relative flex size-4 items-center justify-center">
      <Megaphone className="size-4" />
      {hasUnseen ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 size-2 rounded-full bg-accent"
        />
      ) : null}
    </span>
  );

  // Expanded rows get a hide control, revealed on row hover / when focused.
  const suffix = iconOnly ? undefined : (
    <button
      type="button"
      aria-label={t`Hide`}
      className="flex size-5 shrink-0 cursor-default items-center justify-center rounded-full text-muted/70 opacity-0 outline-none transition hover:text-foreground focus-visible:opacity-100 focus-visible:focus-ring group-hover:opacity-100"
      onClick={(e) => {
        e.stopPropagation();
        useChangelogStore.getState().hideWhatsNew();
      }}
    >
      <X className="size-3.5" />
    </button>
  );

  return (
    <SidebarButton
      iconOnly={iconOnly}
      icon={icon}
      label={t`What's New`}
      tooltipPlacement={tooltipPlacement}
      onPress={() => useChangelogStore.getState().openWhatsNew()}
      {...(suffix ? { suffix } : {})}
    />
  );
}
