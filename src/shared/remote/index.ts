export * from "./protocol";
export * from "./parseSocketMessage";
export * from "./capabilities";
export * from "./procedures";
export * from "./omittedPayload";
export * from "./imageRef";
export * from "./ipcAdapter";
export * from "./socketPolicy";
export * from "./terminalOwnership";
// The C1.3a environment SDK is re-exported type-only. The client chain already
// imports this barrel, so a runtime `export *` here would make
// `RemoteEnvironmentClient extends RemoteDesktopClient` observe an
// uninitialized base class whenever a caller enters through
// `@/shared/remote/client` first. Runtime consumers (the renderer session
// registry) import `./clientEnvironments` directly.
export type * from "./clientApiEnvironments";
export type * from "./clientEnvironments";
