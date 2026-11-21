import type { ReactNode } from "react";
import { Skeleton } from "@heroui/react";
import { Globe, Laptop, Monitor, MonitorSmartphone } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { ProfileDevice, ProfileIdentity } from "@/shared/contracts";
import type { TranslateFn } from "@/renderer/i18n/i18n";
import type { RemoteServerStatus } from "@/renderer/state/remoteServers/types";
import { initialsFor } from "../format";
import type { ProfileSelection } from "../useProfileData";
import { DevicePicker } from "./DevicePicker";

const ALL_DEVICES = "all";

function platformIcon(platform: string): ReactNode {
  if (platform === "darwin") return <Laptop className="size-4" />;
  if (platform === "win32" || platform === "linux") return <Monitor className="size-4" />;
  return <MonitorSmartphone className="size-4" />;
}

function deviceHint(
  device: ProfileDevice,
  remoteStatus: RemoteServerStatus | undefined,
  t: TranslateFn,
): string {
  if (device.isCurrent) return t(msg`This device`);
  if (remoteStatus === "offline" || remoteStatus === "error") return t(msg`Offline`);
  if (remoteStatus === "connecting") return t(msg`Connecting…`);
  if (device.lastActiveAt) {
    const diff = Date.now() - device.lastActiveAt;
    const day = 86_400_000;
    if (diff < day) return t(msg`Active today`);
    const days = Math.floor(diff / day);
    if (days < 30) return t(msg`${days}d ago`);
    return t(msg`${Math.floor(days / 30)}mo ago`);
  }
  if (remoteStatus === "online") return t(msg`Online`);
  return "";
}

export function ProfileIdentityHeading(props: {
  identity: ProfileIdentity | null;
  actions?: ReactNode;
}) {
  const { t } = useLingui();
  const { identity, actions } = props;
  const plan = identity?.plan ?? t`Local`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {identity ? (
          <>
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: identity.avatarColor }}
            >
              {initialsFor(identity.name)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg leading-tight font-semibold text-foreground">
                {identity.name}
              </h1>
              <p className="mt-0.5 truncate text-xs text-muted">
                @{identity.handle}
                <span className="px-1.5 text-muted/50">·</span>
                <span>{plan}</span>
              </p>
            </div>
          </>
        ) : (
          <>
            <Skeleton className="size-10 shrink-0 rounded-full bg-foreground/10" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-32 rounded-md bg-foreground/10" />
              <Skeleton className="h-3.5 w-28 rounded bg-foreground/10" />
            </div>
          </>
        )}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ProfileHeader(props: {
  devices: ProfileDevice[];
  currentDeviceId: string | null;
  remoteStatusByDeviceId?: Readonly<Record<string, RemoteServerStatus>>;
  selection: ProfileSelection;
  onSelect: (selection: ProfileSelection) => void;
  /** Rendered on the same row as the device picker, before the actions. */
  filter?: ReactNode;
  /** Rendered on the same row as the device picker (e.g. Edit). */
  actions?: ReactNode;
}) {
  const { t } = useLingui();
  const { devices, currentDeviceId, remoteStatusByDeviceId, selection, onSelect, filter, actions } =
    props;

  const value =
    selection.scope === "all"
      ? ALL_DEVICES
      : (selection.deviceId ?? currentDeviceId ?? ALL_DEVICES);

  const options = [
    {
      id: ALL_DEVICES,
      label: t`All devices`,
      icon: <Globe className="size-4" />,
      ...(devices.length > 1 ? { hint: t(msg`${devices.length} devices`) } : {}),
    },
    ...devices.map((d) => ({
      id: d.id,
      label: d.label,
      icon: platformIcon(d.platform),
      hint: deviceHint(d, remoteStatusByDeviceId?.[d.id], t),
    })),
  ];

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-1 [&_button]:max-w-full">
        <DevicePicker
          value={value}
          options={options}
          onChange={(id) => {
            // Preserve the active account filter across a device/scope switch.
            const provider = selection.provider ? { provider: selection.provider } : {};
            onSelect(
              id === ALL_DEVICES
                ? { scope: "all", window: selection.window, ...provider }
                : { scope: "device", deviceId: id, window: selection.window, ...provider },
            );
          }}
        />
        {filter}
        {actions}
      </div>
    </div>
  );
}
