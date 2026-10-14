import { Server } from "lucide-react";
import type { RemoteServerStatus } from "@/renderer/state/remoteServers/types";
import { RemoteServerStatusDot } from "./RemoteServerStatusDot";

/** Shared remote-machine glyph with a consistently anchored connection light. */
export function RemoteServerIcon(props: {
  /** `null` keeps the machine glyph but omits the light when no pairing is known. */
  status: RemoteServerStatus | null;
  className?: string | undefined;
  dotClassName?: string | undefined;
}) {
  return (
    <span
      className={`${props.className ?? "size-4 text-muted"} relative inline-flex shrink-0 items-center justify-center`}
    >
      <Server className="size-full" />
      {props.status ? (
        <RemoteServerStatusDot
          status={props.status}
          {...(props.dotClassName ? { sizeClassName: props.dotClassName } : {})}
          className="absolute right-0 bottom-0 ring-1 ring-background"
        />
      ) : null}
    </span>
  );
}
