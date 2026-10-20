import type { ExecFileSyncOptions } from "node:child_process";

export interface DeviceHubStageOptions {
  source?: string;
  output?: string;
  runtimeAbi?: string;
  scrcpyServer: string;
  scratch?: string;
}

export interface DeviceHubStageResult {
  target: string;
  qualifiedPlatforms: string[];
  manifestSha256: string;
  previous?: string;
}

export function prepareDeviceHub(options: DeviceHubStageOptions): Promise<DeviceHubStageResult>;

export function preparePackagedDeviceHub(
  stageRoot: string,
  target: { platform: string; arches: readonly string[] },
  dependencies?: {
    platform?: string;
    arch?: string;
    run?: (
      command: string,
      args: string[],
      options: ExecFileSyncOptions & { cwd: string },
    ) => string | Buffer;
    fetch?: typeof globalThis.fetch;
    stage?: (
      options: Required<DeviceHubStageOptions>,
    ) => Promise<Pick<DeviceHubStageResult, "qualifiedPlatforms">>;
  },
): Promise<Pick<DeviceHubStageResult, "qualifiedPlatforms">>;
