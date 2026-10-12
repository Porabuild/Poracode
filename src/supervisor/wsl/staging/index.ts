import { getCachedWslHomeDirectory, resolveWslHomeDirectoryAsync } from "../../agents/base";
import { WslStagingService, type WslStagingServiceOptions } from "./service";

export {
  WSL_STAGING_PROTOCOL_VERSION,
  type WslStagingDeployResult,
  type WslStagingFileRequest,
} from "./protocol";
export {
  createInlineStagingExecutor,
  createProcessStagingExecutor,
  type WslStagingExecuteOptions,
  type WslStagingExecutor,
  type WslStagingProcessSpec,
} from "./executor";
export { stagingContentKeyAsync } from "./contentKey";
export { resolveWslStagingWorkerPath, wslStagingProcessSpec } from "./workerPath";
export {
  WslStagingService,
  type WslStagingBaseResult,
  type WslStagingHomeInput,
  type WslStagingServiceOptions,
  type WslStagingTempInput,
} from "./service";

let shared: WslStagingService | undefined;

/**
 * Supervisor-wide staging service. The worker reaps itself when idle and the
 * supervisor process owns no reference that prevents exit, so no explicit
 * lifecycle wiring is required outside tests.
 */
export function getWslStagingService(): WslStagingService {
  shared ??= new WslStagingService({
    cachedHome: getCachedWslHomeDirectory,
    resolveHome: resolveWslHomeDirectoryAsync,
  });
  return shared;
}

/** Test seam: replace or clear the shared service. */
export function setWslStagingService(service: WslStagingService | undefined): void {
  shared = service;
}

/**
 * Supervisor shutdown: terminate every distro worker and resolve only after
 * each child process has exited, so no staging handle survives the runtime
 * that owned it. Idempotent; a later request creates a fresh service.
 */
export async function disposeWslStagingService(): Promise<void> {
  const service = shared;
  shared = undefined;
  await service?.dispose();
}

export function createWslStagingService(options: WslStagingServiceOptions): WslStagingService {
  return new WslStagingService(options);
}
