import { useSyncExternalStore } from "react";
import { getRemoteBridgeImageReadiness, subscribeRemoteBridgeImages } from "./remoteBridge";

/** Rebind mounted image consumers when the paired browser client changes. */
export function useRemoteBridgeImageReadiness() {
  return useSyncExternalStore(
    subscribeRemoteBridgeImages,
    getRemoteBridgeImageReadiness,
    getRemoteBridgeImageReadiness,
  );
}
