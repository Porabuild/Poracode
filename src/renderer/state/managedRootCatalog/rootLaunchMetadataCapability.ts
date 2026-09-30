import {
  hostSupportsExperiments,
  hostSupportsProjectCommandResults,
  hostSupportsThreadLaunchMetadata,
} from "@/shared/remote/protocol";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";

/**
 * Per-activation descriptor facts for the managed root: the version-gated
 * capability verdicts the managed command paths need before they may send an
 * optional capability field or declare a bounded result mode.
 *
 * The descriptor is fetched lazily at the first use of an activation (one small
 * read, coalesced across every consumer), each verdict is cached per activation
 * sequence, and a fetch failure stays `false` so the caller falls back to the
 * pre-capability behavior instead of guessing. A verdict is returned only while
 * the SAME activation is still live: a descriptor that resolves after the
 * activation was replaced is discarded (`false`), because an older successor
 * host might not understand the field the retired activation advertised — it
 * would strip it and answer success, reporting an intent it never applied.
 *
 * `threadLaunchMetadata` (v1): `workspaceId`/`initialSize`/`parentThreadId`/
 * `prNumber` on a `start` body.
 * `projectCommandResults` (v1): the bounded `result: "bounded"` project-command
 * response mode (canonical row acknowledgement instead of the full list).
 * `experiments` (v1): the host composes the experiment authority
 * (`GET /api/experiments` and the three command kinds). Absent means the
 * caller must refuse truthfully BEFORE any local mutation — never fall back to
 * a whole-map local writer.
 */
interface ManagedRootDescriptorVerdicts {
  readonly threadLaunchMetadata: boolean;
  readonly projectCommandResults: boolean;
  readonly experiments: boolean;
}

const UNSUPPORTED: ManagedRootDescriptorVerdicts = {
  threadLaunchMetadata: false,
  projectCommandResults: false,
  experiments: false,
};

let cached: { readonly seq: number; readonly verdicts: ManagedRootDescriptorVerdicts } | null =
  null;
let inflight: {
  readonly seq: number;
  readonly promise: Promise<ManagedRootDescriptorVerdicts>;
} | null = null;

async function managedRootDescriptorVerdicts(): Promise<ManagedRootDescriptorVerdicts> {
  const activation = readManagedLoopbackActivation();
  if (!activation) return UNSUPPORTED;
  if (cached?.seq === activation.seq) return cached.verdicts;
  if (inflight?.seq !== activation.seq) {
    inflight = {
      seq: activation.seq,
      // ANY failure of the optional descriptor read (transport, protocol, or a
      // client without the environment entry) resolves to "unsupported": the
      // caller then keeps the pre-capability behavior instead of being blocked.
      promise: (async () => {
        try {
          const descriptor = await activation.client.environment();
          return {
            threadLaunchMetadata: hostSupportsThreadLaunchMetadata(
              descriptor.capabilities?.threadLaunchMetadata,
            ),
            projectCommandResults: hostSupportsProjectCommandResults(
              descriptor.capabilities?.projectCommandResults,
            ),
            experiments: hostSupportsExperiments(descriptor.capabilities?.experiments),
          };
        } catch {
          return UNSUPPORTED;
        }
      })(),
    };
  }
  const verdicts = await inflight.promise;
  // A retired activation's verdict is never inherited by its successor: the
  // launch/send that started under this activation must fall back rather than
  // claim a capability the successor was never asked about.
  if (readManagedLoopbackActivation() !== activation) return UNSUPPORTED;
  cached = { seq: activation.seq, verdicts };
  return verdicts;
}

export async function managedRootSupportsThreadLaunchMetadata(): Promise<boolean> {
  return (await managedRootDescriptorVerdicts()).threadLaunchMetadata;
}

export async function managedRootSupportsProjectCommandResults(): Promise<boolean> {
  return (await managedRootDescriptorVerdicts()).projectCommandResults;
}

/**
 * True only while the live managed activation advertised `experiments` v1.
 * `false` is the truthful refusal signal (unsupported host or a descriptor
 * fetch failure): the caller refuses before any local mutation and never
 * falls back to the retired whole-map writer.
 */
export async function managedRootSupportsExperiments(): Promise<boolean> {
  return (await managedRootDescriptorVerdicts()).experiments;
}

/** Test-only: drop the cached/fresh activation verdicts. */
export function __resetManagedRootLaunchMetadataCapabilityForTest(): void {
  cached = null;
  inflight = null;
}
