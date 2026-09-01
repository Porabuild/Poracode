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
