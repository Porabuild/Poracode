import { useMemo, useSyncExternalStore } from "react";
import {
  getRemoteBridgeClient,
  subscribeRemoteBridgeClient,
} from "@/renderer/browser/remoteBridge";
import { createHexVoiceSession } from "./hexVoice";

export function useHexVoiceSession() {
  const client = useSyncExternalStore(subscribeRemoteBridgeClient, getRemoteBridgeClient);
  return useMemo(() => {
    try {
      return createHexVoiceSession(client);
    } catch {
      return null;
    }
  }, [client]);
}
