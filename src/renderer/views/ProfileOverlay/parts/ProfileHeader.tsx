import type { ReactNode } from "react";
import { Globe, Laptop, Monitor, MonitorSmartphone } from "lucide-react";
import type { ProfileDevice, ProfileIdentity } from "@/shared/contracts";
import { initialsFor } from "../format";
import type { ProfileSelection } from "../useProfileData";
import { DevicePicker } from "./DevicePicker";

const ALL_DEVICES = "all";

function platformIcon(platform: string): ReactNode {
  if (platform === "darwin") return <Laptop className="size-4" />;
  if (platform === "win32" || platform === "linux") return <Monitor className="size-4" />;
  return <MonitorSmartphone className="size-4" />;
}

function lastActiveLabel(device: ProfileDevice): string {
  if (device.isCurrent) return "This device";
  if (!device.lastActiveAt) return "";
  const diff = Date.now() - device.lastActiveAt;
  const day = 86_400_000;
  if (diff < day) return "Active today";
  const days = Math.floor(diff / day);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function ProfileHeader(props: {
  identity: ProfileIdentity;
  devices: ProfileDevice[];
  currentDeviceId: string | null;
  selection: ProfileSelection;
  onSelect: (selection: ProfileSelection) => void;
  /** Rendered on the same row as the device picker (Share / Edit). */
  actions?: ReactNode;
}) {
  const { identity, devices, currentDeviceId, selection, onSelect, actions } = props;
  const plan = identity.plan ?? "Local";

  const value =
    selection.scope === "all"
      ? ALL_DEVICES
      : (selection.deviceId ?? currentDeviceId ?? ALL_DEVICES);

  const options = [
    {
      id: ALL_DEVICES,
      label: "All devices",
      icon: <Globe className="size-4" />,
      hint: devices.length > 1 ? `${devices.length} devices` : "Syncs with Cloud",
    },
    ...devices.map((d) => ({
      id: d.id,
      label: d.label,
      icon: platformIcon(d.platform),
      hint: lastActiveLabel(d),
    })),
  ];

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div
        className="flex size-20 items-center justify-center rounded-full text-2xl font-semibold text-white shadow-sm"
        style={{ backgroundColor: identity.avatarColor }}
      >
        {initialsFor(identity.name)}
      </div>
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold text-foreground">{identity.name}</h1>
        <p className="text-sm text-muted">
          @{identity.handle}
          <span className="px-1.5 text-muted/50">-</span>
          <span className="text-muted">{plan}</span>
        </p>
      </div>

      {/* Device selector + actions on one row. Device picker chooses a single
          device or the merged "All devices" (Cloud) view; today only the
          current device has local data. */}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <DevicePicker
          value={value}
          options={options}
          onChange={(id) =>
            onSelect(id === ALL_DEVICES ? { scope: "all" } : { scope: "device", deviceId: id })
          }
        />
        {actions}
      </div>
    </div>
  );
}
