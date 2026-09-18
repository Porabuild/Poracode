export { CLIENT_ENGINE_PROTOCOL_VERSION, CLIENT_ENGINE_MAX_PENDING } from "./protocol";
export {
  decodeBackendRendererFrame,
  decodeRemoteSocketFrame,
  isBackendRendererMessage,
  parseJsonValue,
  stringifyJsonValue,
  type BackendRendererMessage,
  type DecodeFrameResult,
} from "./decode";
export {
  ClientEngineHost,
  ClientEngineOverflowError,
  decodeBackendSync,
  getClientEngineHost,
  isClientEngineWorkerActive,
  resetClientEngineHostForTests,
} from "./clientEngineHost";
