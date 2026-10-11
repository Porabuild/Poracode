import { REMOTE_THREAD_LAUNCH_METADATA_VERSION } from "./core";

export { REMOTE_THREAD_LAUNCH_METADATA_VERSION };

/**
 * True only when a host advertised `capabilities.threadLaunchMetadata`
 * version 1. A client uses this as the single pre-flight gate before sending
 * `workspaceId`, `initialSize`, `parentThreadId` or `prNumber` on a `start`
 * thread command: an old host's object schema strips those unknown keys and
 * answers success without persisting them, so an ungated send would report a
 * launch intent the host never applied.
 */
export function hostSupportsThreadLaunchMetadata(
  capability: { readonly versions: readonly number[] } | undefined,
): boolean {
  return capability?.versions.includes(REMOTE_THREAD_LAUNCH_METADATA_VERSION) === true;
}
