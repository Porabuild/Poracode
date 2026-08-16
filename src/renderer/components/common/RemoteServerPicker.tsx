import { useState, type ReactNode } from "react";
import { Button } from "@heroui/react";
import { Check, ChevronDown, ChevronUp, Monitor } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { ResponsiveMenuSurface } from "@/renderer/components/common/ResponsiveMenuSurface";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { RemoteServerIcon } from "./RemoteServerIcon";

export function RemoteServerPicker(props: {
  readonly value: string | null;
  readonly includeLocal?: boolean;
  readonly onChange: (desktopId: string | null) => void;
  readonly trigger?: ReactNode;
  readonly buttonClassName?: string;
  readonly opensUpward?: boolean;
}) {
  const { t } = useLingui();
  const compact = useCompactLayout();
  const servers = useRemoteServersStore((state) => state.servers);
  const runtime = useRemoteServersStore((state) => state.runtime);
  const [open, setOpen] = useState(false);
  const effectiveValue =
    props.value ?? (!props.includeLocal ? (servers[0]?.desktopId ?? null) : null);
  const selected = effectiveValue
    ? servers.find((server) => server.desktopId === effectiveValue)
    : undefined;
  const label = selected
    ? desktopTitle(selected.label)
    : props.includeLocal
      ? t`Local`
      : t`Connections`;

  const choose = (desktopId: string | null) => {
    props.onChange(desktopId);
    setOpen(false);
  };

  return (
    <ResponsiveMenuSurface
      isOpen={open}
      onOpenChange={setOpen}
      label={t`Connections`}
      placement="bottom end"
      contentClassName="w-64 p-0"
      dialogClassName="!p-1"
      trigger={
        props.trigger ?? (
          <Button
            size="sm"
            variant="ghost"
            className={
              props.buttonClassName ??
              (compact ? "h-9 min-h-9 max-w-40 gap-1.5 px-2" : "h-7 min-h-7 gap-1 px-1.5")
            }
            aria-label={t`Connections`}
            onPress={() => setOpen(true)}
          >
            {selected ? (
              <RemoteServerIcon
                status={runtime[selected.desktopId]?.status ?? "offline"}
                className="size-3.5"
                dotClassName="size-1"
              />
            ) : (
              <Monitor className="size-3.5 shrink-0" />
            )}
            <span className="min-w-0 truncate text-xs">{label}</span>
            {props.opensUpward ? (
              <ChevronUp className="size-3 shrink-0 text-muted" />
            ) : (
              <ChevronDown className="size-3 shrink-0 text-muted" />
            )}
          </Button>
        )
      }
    >
      <div className="m-sheet-list">
        {props.includeLocal ? (
          <button type="button" className="m-sheet-action" onClick={() => choose(null)}>
            <Monitor className="size-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate">{t`Local`}</span>
            {effectiveValue === null ? <Check className="size-4 shrink-0 text-accent" /> : null}
          </button>
        ) : null}
        {servers.map((server) => (
          <button
            key={server.desktopId}
            type="button"
            className="m-sheet-action"
            onClick={() => choose(server.desktopId)}
          >
            <RemoteServerIcon status={runtime[server.desktopId]?.status ?? "offline"} />
            <span className="min-w-0 flex-1 truncate">{desktopTitle(server.label)}</span>
            {effectiveValue === server.desktopId ? (
              <Check className="size-4 shrink-0 text-accent" />
            ) : null}
          </button>
        ))}
      </div>
    </ResponsiveMenuSurface>
  );
}
