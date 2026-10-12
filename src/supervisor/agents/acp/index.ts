export { AcpStructuredSession, type AcpSessionBehavior } from "./session";
export type { AcpTextStreamExtension } from "./canonicalMapping/textStreamExtension";
export { createAcpStructuredSession, shouldSpawnAcpSession } from "./sessionFactory";
export {
  authenticateAcpAgent,
  humanizeModelId,
  logoutAcpAgent,
  probeAcpCapabilities,
  type AcpProbeResult,
} from "./probe";
export {
  dedupeAcpAuthMethods,
  isAcpAgentAuthMethod,
  isAcpEnvVarAuthMethod,
  isAcpTerminalAuthMethod,
} from "./authMethods";
export {
  dispatchAcpAuthenticate,
  dispatchAcpLogout,
  envContextFromPayload,
  isUnsupportedAcpLogoutError,
} from "./dispatch";
export {
  readUnstableSessionModels,
  setUnstableSessionModel,
  type UnstableModelInfo,
  type UnstableSessionModelState,
} from "./unstableModelCompat";
export {
  AcpExtensionRequestError,
  AcpExtensionRequests,
  ACP_EXTENSION_REQUEST_DEFAULT_TIMEOUT_MS,
  type AcpExtensionRequestResolution,
} from "./sessionExtensionRequests";
export {
  AcpSessionActionError,
  AcpSessionActionRegistry,
  type AcpSessionActionFailure,
} from "./sessionActions";
export {
  describeConfigOptions,
  listBooleanConfigOptions,
  type AcpSessionConfigBooleanOption,
  type AcpSessionConfigOptionDescriptor,
  type AcpSessionConfigSelectGroupInfo,
  type AcpSessionConfigSelectValue,
} from "./sessionConfigOptions";
