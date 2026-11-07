import type { RemoteBoundedThreadHistoryPage, RemoteDesktopClient } from "@/shared/remote/client";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { currentRemoteServerGeneration, remoteServerResumeFence } from "../eventSocketRegistry";
import { recordHistoryTail } from "./boundedHistoryRegistry";

type WithClient = <Result>(
  desktopId: string,
  invoke: (client: RemoteDesktopClient) => Promise<Result>,
) => Promise<Result>;

let withClient: WithClient | null = null;

/** Binds the client the recorded tails continue through. */
export function configureBoundedHistoryClient(invoke: WithClient): void {
  withClient = invoke;
}

/**
 * Records a paired thread's bounded tail the way a host read does: under a
 * session fenced to the connection's current generation and resume fence.
 */
export function recordBoundedHistoryTail(input: {
  readonly desktopId: string;
  readonly threadId: string;
  readonly page: RemoteBoundedThreadHistoryPage;
}): void {
  const { desktopId } = input;
  const generation = currentRemoteServerGeneration(desktopId);
  const fence = remoteServerResumeFence(desktopId);
  recordHistoryTail(remoteThreadId(desktopId, input.threadId), input.threadId, input.page, {
    authority: desktopId,
    isCurrent: () =>
      currentRemoteServerGeneration(desktopId) === generation &&
      remoteServerResumeFence(desktopId) === fence,
    withClient: (invoke) => withClient?.(desktopId, invoke),
  });
}
