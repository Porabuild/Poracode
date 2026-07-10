import { WebPlugin } from "@capacitor/core";
import type {
  SshBridgeConnectOptions,
  SshBridgeDisconnectOptions,
  SshBridgeForwardOptions,
  SshBridgeForwardResult,
  SshBridgePlugin,
  SshBridgeProbeResult,
  SshBridgeRunOptions,
  SshBridgeRunResult,
  SshBridgeTarget,
  SshBridgeUploadOptions,
} from "./definitions";

function unavailable(): never {
  throw new Error("SSH connections are available only in the native mobile app.");
}

export class SshBridgeWeb extends WebPlugin implements SshBridgePlugin {
  async probeHostKey(_options: SshBridgeTarget): Promise<SshBridgeProbeResult> {
    return unavailable();
  }
  async connect(_options: SshBridgeConnectOptions): Promise<void> {
    unavailable();
  }
  async run(_options: SshBridgeRunOptions): Promise<SshBridgeRunResult> {
    return unavailable();
  }
  async upload(_options: SshBridgeUploadOptions): Promise<void> {
    unavailable();
  }
  async forward(_options: SshBridgeForwardOptions): Promise<SshBridgeForwardResult> {
    return unavailable();
  }
  async disconnect(_options: SshBridgeDisconnectOptions): Promise<void> {
    unavailable();
  }
}
