import { RemoteDesktopClient } from "@/shared/remote/client";
import { mainProcessFetch } from "./mainProcessFetch";
import { electronCertFingerprintProbe } from "./certFingerprintProbe";
import type { RemoteClientFactory, RemoteSocketFactory, RemoteSocketLike } from "./types";

/** A surface can constrain all clients before store hydration, including cached callers. */
let policy:
  | {
      client: RemoteClientFactory;
      socket: RemoteSocketFactory;
      isAuthorized?: (endpoint: string, accessToken: string) => boolean;
    }
  | undefined;
export function installRemoteTransportFactories(value: NonNullable<typeof policy>): () => void {
  const previous = policy;
  policy = value;
  return () => {
    if (policy === value) policy = previous;
  };
}
export const defaultClientFactory: RemoteClientFactory = (endpoint, accessToken) =>
  policy
    ? policy.client(endpoint, accessToken)
    : new RemoteDesktopClient(endpoint, accessToken, mainProcessFetch, {
        certFingerprintProbe: electronCertFingerprintProbe,
      });
export const defaultSocketFactory: RemoteSocketFactory = (url) =>
  policy ? policy.socket(url) : (new WebSocket(url) as unknown as RemoteSocketLike);

/** Optional surface authority also constrains browser selection; online is reachability only. */
export function isRemoteConnectionAuthorized(endpoint: string, accessToken: string): boolean {
  return policy?.isAuthorized?.(endpoint, accessToken) ?? true;
}
