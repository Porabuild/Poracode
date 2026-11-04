import { DEFAULT_TERMINAL_SIZE, type StartThreadResult } from "@/shared/contracts";
import { hostSupportsThreadLaunchMetadata } from "@/shared/remote/protocol";
import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  RemoteClientError,
} from "@/shared/remote/client";
import type { EntityHost } from "./entityHost";
import { pinThreadRow, type ThreadLaunchReplay } from "./threadLaunchIntents";

/**
 * Launches a host row's first runtime, whichever host owns it, creating its
 * metadata if it is still unsaved.
 *
 * Acknowledged draft metadata starts through the existing-thread endpoint at
 * the captured location, keeping the exact launch body and receipt identity
 * without recreating the row. Other creators use the host's create+launch
 * entry with ONE explicit per-episode command id: the host binds the receipt
 * to the principal, the route and the exact body, so an identical retry
 * replays the recorded outcome instead of launching a second runtime.
 */
export function startHostThread(
  host: EntityHost,
  input: ThreadLaunchReplay,
  options: { readonly commandId?: string } = {},
): Promise<StartThreadResult> {
  const threadId = input.threadId ?? crypto.randomUUID();
  return host.withClient((client) => {
    if (input.projectLocation) {
      return client.startThread(
        {
          threadId,
          projectLocation: input.projectLocation,
          agentKind: input.agentKind,
          ...(input.agentInstanceId ? { agentInstanceId: input.agentInstanceId } : {}),
          config: input.config,
          prompt: input.prompt,
          ...(input.segments ? { segments: input.segments } : {}),
          ...(input.presentationMode ? { presentationMode: input.presentationMode } : {}),
          ...(input.userMessageItemId ? { userMessageItemId: input.userMessageItemId } : {}),
          ...(input.clientContext ? { clientContext: input.clientContext } : {}),
          initialSize: input.initialSize ?? DEFAULT_TERMINAL_SIZE,
        },
        options,
      );
    }
    return client.startNewThread(
      { ...input, threadId },
      options.commandId !== undefined ? { commandId: options.commandId } : {},
    );
  });
}

const launchMetadataVerdicts = new Map<string, Promise<boolean>>();

/**
 * Whether this host's live connection advertised launch metadata
 * (workspace/size/parent/PR on a start body). Read once per connection
 * session from the host's own descriptor; an unreadable descriptor counts as
 * unsupported, so the optional fields are omitted rather than falsely claimed.
 */
export async function hostSupportsLaunchMetadata(host: EntityHost): Promise<boolean> {
  let verdict = launchMetadataVerdicts.get(host.sessionKey);
  if (!verdict) {
    verdict = host
      .withClient((client) => client.environment())
      .then((environment) =>
        hostSupportsThreadLaunchMetadata(environment.capabilities?.threadLaunchMetadata),
      )
      .catch(() => false);
    launchMetadataVerdicts.set(host.sessionKey, verdict);
  }
  // A verdict from a replaced connection never speaks for its successor.
  return (await verdict) && host.isCurrent();
}

/** Authoritative existence of one thread on its host. */
export type HostThreadExistence = "present" | "absent" | "unknown";

/**
 * Reads one thread back from its host and installs the host's row. A
 * definite 404 is the host's "no such row": evidence only, never proof that
 * a launch effected nothing (a host keeps the row on a possibly-effective
 * start failure). Anything else, or a reply from a replaced connection, is
 * unknown.
 */
export async function readHostThreadExistence(
  host: EntityHost,
  viewThreadId: string,
): Promise<HostThreadExistence> {
  const release = pinThreadRow(viewThreadId);
  try {
    const result = await host.withClient((client) =>
      client.boundedThreadHistory(host.hostId, {
        completedTurnsLimit: 1,
        compactDetails: true,
        omitScrollback: true,
        maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
        maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
      }),
    );
    if (!host.isCurrent()) return "unknown";
    host.adoptThreadRow(result.page.thread);
    return "present";
  } catch (error) {
    if (!host.isCurrent()) return "unknown";
    if (error instanceof RemoteClientError && error.status === 404) return "absent";
    if (import.meta.env.DEV) {
      const evidence = error as { body?: unknown; responseEvidence?: unknown; code?: unknown };
      console.error(
        "[host-thread] read-back failed",
        evidence.code,
        evidence.body,
        evidence.responseEvidence,
        error instanceof Error ? error.message : error,
      );
    }
    return "unknown";
  } finally {
    release();
  }
}

/** One authoritative read-back after an uncertain launch, then catalog convergence. */
export async function reconcileHostThreadLaunch(
  host: EntityHost,
  viewThreadId: string,
): Promise<HostThreadExistence> {
  const existence = await readHostThreadExistence(host, viewThreadId);
  host.refreshCatalog();
  return existence;
}

/** Test-only. */
export function __resetHostThreadLaunchForTest(): void {
  launchMetadataVerdicts.clear();
}
