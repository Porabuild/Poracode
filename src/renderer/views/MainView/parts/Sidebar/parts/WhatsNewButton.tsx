import { Megaphone, X } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { SidebarButton } from "@/renderer/components/common";
import { useChangelogStore, useHasUnseenChangelog } from "@/renderer/state/changelogStore";

/**
 * Sidebar entry for the changelog. Clicking it opens the "What's New" dialog.
 * An accent dot marks an unread release. On expanded rows a hide (X) control —
 * revealed on hover — removes the entry from the sidebar; it comes back on its
 * own when a newer release is unread. The changelog also lives in Settings →
 * Changelog regardless.
 */
export function WhatsNewButton(props: { iconOnly?: boolean }) {
  const { iconOnly = false } = props;
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
      onPress={() => useChangelogStore.getState().openWhatsNew()}
      {...(suffix ? { suffix } : {})}
    />
  );
}
