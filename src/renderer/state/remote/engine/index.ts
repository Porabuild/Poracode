export { CLIENT_ENGINE_PROTOCOL_VERSION, CLIENT_ENGINE_MAX_PENDING } from "./protocol";
export {
  decodeRemoteSocketFrame,
  decodeDesktopFrame,
  measuredRawBytes,
  parseJsonValue,
  stringifyJsonValue,
  type DecodeFrameResult,
  type DesktopFrameDecodeResult,
} from "./decode";
export {
  ClientEngineAuxInputTooLargeError,
  ClientEngineLaneDisposedError,
  ClientEngineLaneOverflowError,
  ClientEngineLaneSupersededError,
  ClientEngineProtocolMismatchError,
  ClientEngineTimeoutError,
  ClientEngineWorkerUnavailableError,
  type ClientEngineAuxInputRefusalReason,
  type ClientEngineWorkerMode,
} from "./clientEngineErrors";
export {
  projectJsonBytes,
  type JsonProjectionFailureReason,
  type JsonProjectionResult,
} from "./jsonProjection";
export {
  CLIENT_ENGINE_AUX_STRINGIFY_MAX_BYTES,
  CLIENT_ENGINE_TRANSPORT_WATCHDOG_MS,
} from "./protocol";
export {
  ClientEngineLane,
  type ClientEngineLaneOptions,
  type ClientEngineLaneState,
} from "./clientEngineLane";
export {
  ClientEngineHost,
  getManagedLoopbackEngine,
  getPersistJsonEngine,
  getRemoteSocketEngine,
  resetClientEngineHostForTests,
  type ClientEngineHostOptions,
} from "./clientEngineHost";
