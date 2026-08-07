import { Smartphone } from "lucide-react";
import { useLingui } from "@lingui/react/macro";

export type RemoteAccessSidebarStatus = "off" | "starting" | "online";

export function RemoteAccessSidebarIcon(props: { status: RemoteAccessSidebarStatus }) {
  return (
    <span className="relative flex size-4 items-center justify-center">
      <Smartphone className="size-4" />
      {props.status === "online" ? (
        <span className="absolute -right-px -top-px size-1.5 rounded-full bg-emerald-400 ring-[1.5px] ring-[var(--sidebar-background)]" />
      ) : null}
    </span>
  );
}

/**
 * Tooltip content for the Remote Access entry: the label plus the live
 * pairing status. Shared by the collapsed icon rail and the footer nav so the
 * two surfaces can never drift.
 */
export function RemoteAccessSidebarTooltip(props: { status: RemoteAccessSidebarStatus }) {
  const { t } = useLingui();
  const statusLabel =
    props.status === "online" ? t`Online` : props.status === "starting" ? t`Starting` : t`Off`;
  return (
    <span className="flex items-center gap-2">
      <span>{t`Remote Access`}</span>
      <span className="inline-flex items-center gap-1.5 text-muted">
        {props.status === "online" ? (
          <span className="size-1.5 rounded-full bg-emerald-400" />
        ) : null}
        {statusLabel}
      </span>
    </span>
  );
}
