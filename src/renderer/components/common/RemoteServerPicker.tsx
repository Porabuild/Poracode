import { useId, useState, type ReactNode } from "react";
import { Button, Label, ListBox } from "@heroui/react";
import { Check, ChevronDown, ChevronUp, Monitor } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import { isRemoteProjectStatusUnreachable } from "@/renderer/state/remoteServers/reachability";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { RemoteServerIcon } from "./RemoteServerIcon";

export function RemoteServerPicker(props: {
  readonly value: string | null;
  readonly includeLocal?: boolean;
  readonly onChange: (desktopId: string | null) => void;
  readonly trigger?: ReactNode;
  /** Muted secondary text shown after the label in the default trigger. */
  readonly detail?: ReactNode;
  readonly buttonClassName?: string;
  readonly opensUpward?: boolean;
}) {
  const { t } = useLingui();
  const compact = useCompactLayout();
  const { mobile } = useResponsiveMenu();
  const servers = useRemoteServersStore((state) => state.servers);
  const runtime = useRemoteServersStore((state) => state.runtime);
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const effectiveValue =
    props.value ??
    (!props.includeLocal ? (servers[0] ? remoteConnectionKey(servers[0]) : null) : null);
  const selected = effectiveValue
    ? servers.find((server) => remoteConnectionKey(server) === effectiveValue)
    : undefined;
  // Offline machines can't be read or acted on, so they are not offered; the
  // current selection stays listed so the trigger and checkmark still resolve.
  const choices = servers.filter(
    (server) =>
      remoteConnectionKey(server) === effectiveValue ||
      !isRemoteProjectStatusUnreachable(
        { remoteServerId: remoteConnectionKey(server) },
        runtime[remoteConnectionKey(server)]?.status,
      ),
  );
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
      placement={props.opensUpward ? "top end" : "bottom end"}
      contentClassName="w-64 p-0"
      trigger={
        props.trigger ?? (
          <Button
            size="sm"
            variant="ghost"
            className={`gap-2 ${
              props.buttonClassName ??
              (compact ? "h-9 min-h-9 max-w-40 px-2" : "h-7 min-h-7 px-1.5")
            }`}
            aria-label={t`Connections`}
            {...(props.detail ? { "aria-describedby": detailId } : {})}
            {...(mobile ? { onPress: () => setOpen(true) } : {})}
          >
            {selected ? (
              <RemoteServerIcon
                status={runtime[remoteConnectionKey(selected)]?.status ?? "offline"}
                className="size-3.5"
                dotClassName="size-1"
              />
            ) : (
              <Monitor className="size-3.5 shrink-0" />
            )}
            <span className="min-w-0 truncate text-xs">{label}</span>
            {props.detail ? (
              <span id={detailId} className="-ml-1 shrink-0 text-[11px] text-muted">
                · {props.detail}
              </span>
            ) : null}
            {props.opensUpward ? (
              <ChevronUp className="size-3 shrink-0 text-muted" />
            ) : (
              <ChevronDown className="size-3 shrink-0 text-muted" />
            )}
          </Button>
        )
      }
    >
      {mobile ? (
        <div className="m-sheet-list">
          {props.includeLocal ? (
            <button
              type="button"
              className="m-sheet-action"
              aria-pressed={effectiveValue === null}
              onClick={() => choose(null)}
            >
              <Monitor className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{t`Local`}</span>
              {effectiveValue === null ? <Check className="size-4 shrink-0 text-accent" /> : null}
            </button>
          ) : null}
          {choices.map((server) => (
            <button
              key={remoteConnectionKey(server)}
              type="button"
              className="m-sheet-action"
              aria-pressed={effectiveValue === remoteConnectionKey(server)}
              onClick={() => choose(remoteConnectionKey(server))}
            >
              <RemoteServerIcon
                status={runtime[remoteConnectionKey(server)]?.status ?? "offline"}
              />
              <span className="min-w-0 flex-1 truncate">{desktopTitle(server.label)}</span>
              {effectiveValue === remoteConnectionKey(server) ? (
                <Check className="size-4 shrink-0 text-accent" />
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <ListBox
          aria-label={t`Connections`}
          className="poracode-menu max-h-60 overflow-y-auto"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([effectiveValue ?? "local"])}
          onSelectionChange={(keys) => {
            if (keys === "all") return;
            const key = [...keys][0];
            if (key !== undefined) choose(key === "local" ? null : String(key));
          }}
        >
          {props.includeLocal ? (
            <ListBox.Item id="local" textValue={t`Local`}>
              <ListBox.ItemIndicator />
              <Monitor className="size-4 shrink-0 text-muted" />
              <Label className="min-w-0 flex-1 truncate">{t`Local`}</Label>
            </ListBox.Item>
          ) : null}
          {choices.map((server) => (
            <ListBox.Item
              key={remoteConnectionKey(server)}
              id={remoteConnectionKey(server)}
              textValue={desktopTitle(server.label)}
            >
              <ListBox.ItemIndicator />
              <RemoteServerIcon
                status={runtime[remoteConnectionKey(server)]?.status ?? "offline"}
              />
              <Label className="min-w-0 flex-1 truncate">{desktopTitle(server.label)}</Label>
            </ListBox.Item>
          ))}
        </ListBox>
      )}
    </ResponsiveMenuSurface>
  );
}
