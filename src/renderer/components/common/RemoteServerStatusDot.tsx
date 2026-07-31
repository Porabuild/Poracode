import { useLingui } from "@lingui/react/macro";
import {
  remoteServerStatusDotClass,
  type RemoteServerStatus,
} from "@/renderer/state/remoteServers/types";

export function useRemoteServerStatusLabel(status: RemoteServerStatus): string {
  const { t } = useLingui();
  if (status === "online") return t`Online`;
  if (status === "connecting") return t`Connecting…`;
  if (status === "error") return t`Connection error`;
  return t`Offline`;
}

/** Connection light for a paired desktop — same palette in Settings and the sidebar. */
export function RemoteServerStatusDot(props: { status: RemoteServerStatus }) {
  const label = useRemoteServerStatusLabel(props.status);
  return (
    <span
      title={label}
      className={`size-1.5 shrink-0 rounded-full ${remoteServerStatusDotClass(props.status)}`}
    />
  );
}
