export {
  HOST_TRANSPORT_VERSION,
  PREVIOUS_HOST_TRANSPORT_VERSION,
  assertHostTransportVersion,
  type HostEventListener,
  type HostIdentity,
  type HostTransport,
} from "./types";
export { MANAGED_LOOPBACK_DESKTOP_ID } from "./managedIdentity";
export { PreloadIpcTransport, ElectronBackendTransport } from "./preloadIpcTransport";
export {
  LoopbackHttpWsTransport,
  attachManagedLoopbackPreload,
  bindManagedLoopbackRuntime,
  startDesktopLoopbackEventIntake,
  resetDesktopLoopbackIntakeForTest,
  isDesktopLoopbackIntakeActive,
  __setDesktopLoopbackIntakeTestSeamsForTest,
} from "./loopbackHttpWsTransport";
export { ManagedElectronHostTransport } from "./managedElectronHostTransport";
export { RemoteHttpWsTransport } from "./remoteHttpWsTransport";
export {
  activateHostTransport,
  requestActiveHost,
  resetActiveHostTransportForTest,
} from "./activeTransport";
