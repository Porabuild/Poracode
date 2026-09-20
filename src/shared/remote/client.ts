import { RemoteClientWorkspaceApi } from "./clientApiWorkspace";

export {
  RemoteClientError,
  isUnauthorizedRemoteError,
  isRemoteTransportFailure,
} from "./clientErrors";
export type {
  ThreadHistoryOptions,
  StartRemoteThreadInput,
  StartRemoteNewThreadInput,
  RemoteFetch,
  RemoteDesktopClientOptions,
  RemoteTokenSnapshot,
  RemoteTokenLifecycle,
  RemoteCertFingerprintProbe,
} from "./clientTypes";

export class RemoteDesktopClient extends RemoteClientWorkspaceApi {}
