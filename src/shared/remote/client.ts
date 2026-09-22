import { RemoteClientExperimentsApi } from "./clientApiExperiments";

export {
  REMOTE_COMMAND_OUTCOME_UNCERTAIN_CODE,
  REMOTE_REQUEST_CANCELLED_STATUS,
  RemoteClientError,
  isUnauthorizedRemoteError,
  isRemoteTransportFailure,
  remoteMutationMayHaveCommitted,
} from "./clientErrors";
export type { RemoteClientErrorOptions, RemoteRequestPhase } from "./clientErrors";
export {
  REMOTE_BOUNDED_READ_DECODE_BUDGET_LABEL,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  REMOTE_BOUNDED_READ_PROTOCOL_ERROR_CODE,
  REMOTE_BOUNDED_READ_WIRE_BUDGET_LABEL,
  RemoteBoundedReadProtocolError,
  isRemoteBoundedReadProtocolError,
} from "./clientBoundedReads";
export type {
  RemoteBoundedHistoryItemsInput,
  RemoteBoundedHistoryItemsPage,
  RemoteBoundedHistoryItemsResult,
  RemoteBoundedProjectListPage,
  RemoteBoundedProjectPageOptions,
  RemoteBoundedReadByteBudget,
  RemoteBoundedReadFirst,
  RemoteBoundedReadsProof,
  RemoteBoundedReadViolation,
  RemoteBoundedShellSnapshotOptions,
  RemoteBoundedShellSnapshotPage,
  RemoteBoundedShellSnapshotResult,
  RemoteBoundedThreadHistoryOptions,
  RemoteBoundedThreadHistoryPage,
  RemoteBoundedThreadHistoryResult,
  RemoteBoundedThreadListPage,
  RemoteBoundedThreadListResult,
  RemoteBoundedThreadPageOptions,
  RemoteBoundedTurnsInput,
  RemoteBoundedTurnsPage,
} from "./clientBoundedReads";
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

export class RemoteDesktopClient extends RemoteClientExperimentsApi {}
