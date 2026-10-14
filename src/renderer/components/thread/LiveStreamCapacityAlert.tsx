import { Alert } from "@heroui/react";
import { Plural, Trans } from "@lingui/react/macro";
import { MANAGED_ITEM_INTERESTS_MAX } from "@/renderer/state/remoteServers/desktopLoopbackInterests";
import { useLiveStreamCapacityStore } from "@/renderer/state/liveStreamCapacityStore";

/**
 * Truthful visible state for the managed live-stream capacity bound (A1).
 *
 * When this window retains more runtime threads than the loopback wire can
 * carry, the wire-bound overflow would otherwise be invisible: some open
 * threads silently stop receiving live updates. This surfaces the exact count
 * and the wire limit, and states the existing recovery actions (closing or
 * reopening a thread re-admits a paused one; its view is rebuilt
 * authoritatively when it returns to the wire).
 */
export function LiveStreamCapacityAlert() {
  const droppedRuntimeThreadCount = useLiveStreamCapacityStore(
    (state) => state.droppedRuntimeThreadCount,
  );
  if (droppedRuntimeThreadCount <= 0) return null;
  return (
    <div className="shrink-0 px-2 pt-2" role="status">
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            <Trans>Some threads are paused</Trans>
          </Alert.Title>
          <Alert.Description>
            <Trans>
              Live updates are paused for{" "}
              <Plural value={droppedRuntimeThreadCount} one="# thread" other="# threads" /> because
              this window exceeds the {MANAGED_ITEM_INTERESTS_MAX}-thread live streaming limit.
              Close or reopen a thread to resume the paused ones.
            </Trans>
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}
