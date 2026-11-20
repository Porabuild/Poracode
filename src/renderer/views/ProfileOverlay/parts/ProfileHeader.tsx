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

export function ProfileHeader(props: {
  identity: ProfileIdentity | null;
  devices: ProfileDevice[];
  currentDeviceId: string | null;
  remoteStatusByDeviceId?: Readonly<Record<string, RemoteServerStatus>>;
  selection: ProfileSelection;
  onSelect: (selection: ProfileSelection) => void;
  /** Rendered on the same row as the device picker, before the actions. */
  filter?: ReactNode;
  /** Rendered beside the handle and plan metadata. */
  identityAction?: ReactNode;
  /** Rendered on the same row as the device picker (Share / Edit). */
  actions?: ReactNode;
  compact?: boolean;
}) {
  const { t } = useLingui();
  const {
    identity,
    devices,
    currentDeviceId,
    remoteStatusByDeviceId,
    selection,
    onSelect,
    filter,
    identityAction,
    actions,
    compact = false,
  } = props;
  const plan = identity?.plan ?? t`Local`;

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
    <div className={compact ? "min-w-0" : "flex flex-col items-center gap-3 text-center"}>
      {!compact &&
        (identity ? (
          <>
            <div
              className="flex size-20 items-center justify-center rounded-full text-2xl font-semibold text-white shadow-sm"
              style={{ backgroundColor: identity.avatarColor }}
            >
              {initialsFor(identity.name)}
            </div>
            <div className="flex flex-col items-center gap-1">
              <h1 className="text-2xl font-semibold text-foreground">{identity.name}</h1>
              <div className="flex items-center justify-center gap-1">
                <p className="text-sm text-muted">
                  @{identity.handle}
                  <span className="px-1.5 text-muted/50">-</span>
                  <span className="text-muted">{plan}</span>
                </p>
                {identityAction}
              </div>
            </div>
          </>
        ) : (
          <>
            <Skeleton className="size-20 rounded-full bg-foreground/10" />
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-7 w-32 rounded-lg bg-foreground/10" />
              <Skeleton className="h-4 w-28 rounded-md bg-foreground/10" />
            </div>
          </>
        ))}

      <div
        className={
          compact
            ? "flex min-w-0 flex-wrap items-center gap-1 [&_button]:max-w-full"
            : "mt-1 flex flex-wrap items-center justify-center gap-2"
        }
      >
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
        {compact && identityAction}
        {actions}
      </div>
    </div>
  );
}
