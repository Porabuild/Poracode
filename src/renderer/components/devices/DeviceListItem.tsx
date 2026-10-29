import { Dropdown, Label } from "@heroui/react";
import { Ellipsis, Eye, MousePointer2, Play, Smartphone } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { DeviceTarget } from "@/shared/deviceWorkspace";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";

export type DeviceListAction = "open-view" | "open-control" | "start";

/**
 * One device row with the sidebar-item treatment. The primary action opens the
 * device; the mode and start controls live in the row's trailing actions menu
 * so they never take over the list.
 */
export function DeviceListItem(props: {
  device: DeviceTarget;
  busy: boolean;
  onAction: (action: DeviceListAction) => void;
}) {
  const { t } = useLingui();
  const { device } = props;
  const stateLabel =
    device.state === "running"
      ? t`Running`
      : device.state === "starting"
        ? t`Starting`
        : t`Stopped`;
  return (
    <SidebarButton
      className="poracode-sidebar-thread-row"
      size="xs"
      isDisabled={props.busy}
      icon={<Smartphone className="size-3.5 shrink-0 text-muted" />}
      label={
        <span className="flex flex-col gap-0.5">
          <span className="block truncate">{device.name}</span>
          <span className="block truncate text-[11px] text-muted">
            {device.platform === "ios" ? "iOS" : "Android"} · {stateLabel}
          </span>
        </span>
      }
      tooltip={device.name}
      onPress={() => props.onAction("open-view")}
      suffix={
        <Dropdown>
          <Dropdown.Trigger
            aria-label={t`Device actions`}
            className="inline-flex size-6 items-center justify-center rounded text-muted hover:text-foreground"
            onClick={(event) => event.stopPropagation()}
          >
            <Ellipsis className="size-3.5" />
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              aria-label={t`Device actions`}
              className="poracode-menu min-w-48"
              disabledKeys={props.busy ? ["open-view", "open-control", "start"] : []}
              onAction={(key) => props.onAction(key as DeviceListAction)}
            >
              <Dropdown.Item id="open-view" textValue={t`Open view only`}>
                <Eye className="size-3.5 text-muted" />
                <Label>{t`Open view only`}</Label>
              </Dropdown.Item>
              <Dropdown.Item id="open-control" textValue={t`Open with control`}>
                <MousePointer2 className="size-3.5 text-muted" />
                <Label>{t`Open with control`}</Label>
              </Dropdown.Item>
              {device.state === "stopped" ? (
                <Dropdown.Item id="start" textValue={t`Start device`}>
                  <Play className="size-3.5 text-muted" />
                  <Label>{t`Start device`}</Label>
                </Dropdown.Item>
              ) : null}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      }
    />
  );
}
