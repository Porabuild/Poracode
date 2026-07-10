export type SshBridgeAuthentication =
  | { readonly kind: "password"; readonly password: string }
  | {
      readonly kind: "private-key";
      readonly privateKey: string;
      readonly passphrase?: string;
    };

export interface SshBridgeTarget {
  readonly host: string;
  readonly port: number;
}

export interface SshBridgeProbeResult {
  readonly fingerprint: string;
  readonly algorithm: string;
}

export interface SshBridgeConnectOptions extends SshBridgeTarget {
  readonly connectionId: string;
  readonly username: string;
  readonly authentication: SshBridgeAuthentication;
  readonly hostKeyFingerprint: string;
}

export interface SshBridgeRunOptions {
  readonly connectionId: string;
  readonly script: string;
  readonly args?: readonly string[];
  readonly timeoutMs?: number;
}

export interface SshBridgeRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface SshBridgeUploadOptions {
  readonly connectionId: string;
  readonly remotePath: string;
  readonly base64: string;
}

export interface SshBridgeForwardOptions {
  readonly connectionId: string;
  readonly remotePort: number;
}

export interface SshBridgeForwardResult {
  readonly endpoint: string;
  readonly localPort: number;
}

export interface SshBridgeDisconnectOptions {
  readonly connectionId: string;
}

export interface SshBridgePlugin {
  probeHostKey(options: SshBridgeTarget): Promise<SshBridgeProbeResult>;
  connect(options: SshBridgeConnectOptions): Promise<void>;
  run(options: SshBridgeRunOptions): Promise<SshBridgeRunResult>;
  upload(options: SshBridgeUploadOptions): Promise<void>;
  forward(options: SshBridgeForwardOptions): Promise<SshBridgeForwardResult>;
  disconnect(options: SshBridgeDisconnectOptions): Promise<void>;
}
