import { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemotePushClient } from "@/shared/remote";

/** Background registration intentionally does not mutate foreground reachability state. */
export function createBackgroundRemoteClient(
  endpoint: string,
  accessToken: string,
): RemotePushClient {
  return new RemoteDesktopClient(endpoint, accessToken);
}
