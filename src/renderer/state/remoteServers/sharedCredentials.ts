import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import type { RemoteTokenSnapshot } from "@/shared/remote/client";
import {
  commitSharedCredential,
  observeSharedGrant,
  readSharedCredential,
  refreshSlotWritesSettled,
  refreshSubjectVaultKey,
  sharedGrantUntouched,
  type RefreshSubject,
  type VaultSlotCiphertext,
} from "./refreshTokens";

/**
 * Cross-realm custody of one refresh grant. Every renderer realm of this origin
 * (main window, side-chat windows, PWA tabs) holds its own copy of each grant
 * and bearer, but the host accepts each refresh grant exactly once and revokes
 * the whole session family on reuse. A refresh therefore runs under a Web Lock
 * per grant, starts from the copy in the shared vault (adopting a rotation
 * another realm already committed instead of spending the grant again), and
 * commits its own rotation with a compare-and-set before the lock is released.
 */

export interface SharedCredentialPair {
  readonly accessToken: string | undefined;
  readonly refreshToken: string | undefined;
}

export interface SharedCredentialCustody {
  readonly subject: RefreshSubject;
  /** Connection key of the `token.<key>` bearer slot committed with the grant. */
  readonly bearerConnectionKey: string | undefined;
  /** False once removal or a re-pair retired this custody; it then stays inert. */
  isCurrent(): boolean;
  /** Whether the shared copy may be adopted here (same endpoint as the client). */
  canAdopt(): boolean;
  current(): SharedCredentialPair;
  /** Applies a pair to this realm; `durable` once it is the shared vault copy.
   * Persisting the store never writes this bearer: custody owns that slot. */
  apply(pair: SharedCredentialPair, durable: boolean): void;
}

/** The shared copy could not be read or now belongs elsewhere; refreshing would spend it blind. */
export class SharedCredentialRefusedError extends Error {
  constructor() {
    super(i18n._(msg`The saved remote credentials could not be confirmed.`));
    this.name = "SharedCredentialRefusedError";
  }
}

/** Grant ciphertext observed inside the current exclusive section, per subject. */
const observedGrants = new Map<string, VaultSlotCiphertext | null>();
const realmQueues = new Map<string, Promise<unknown>>();

/**
 * Runs `run` exclusively for one grant across every realm of this origin. Where
 * Web Locks are missing, only this realm serializes; the fresh read and the
 * compare-and-set commit still keep a stale grant from being persisted over a
 * newer one, but two realms refreshing at the same instant can both exchange.
 */
export function runCredentialExclusive<T>(
  subject: RefreshSubject,
  run: () => Promise<T>,
): Promise<T> {
  const name = `poracode.credentials.${refreshSubjectVaultKey(subject)}`;
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks?.request) return locks.request(name, run);
  const previous = realmQueues.get(name) ?? Promise.resolve();
  const result = previous.then(run, run);
  const settled = result.catch(() => undefined);
  realmQueues.set(name, settled);
  void settled.then(() => {
    if (realmQueues.get(name) === settled) realmQueues.delete(name);
  });
  return result;
}

async function adoptSharedCredential(custody: SharedCredentialCustody): Promise<void> {
  const key = refreshSubjectVaultKey(custody.subject);
  observedGrants.delete(key);
  if (!custody.isCurrent()) return;
  // This realm's own queued writes (a pairing, say) land first, so the shared
  // copy is never mistaken for another realm's newer grant.
  await refreshSlotWritesSettled(custody.subject);
  const read = await readSharedCredential(custody.subject, custody.bearerConnectionKey);
  // Nothing was ever persisted here: this realm's memory is the only copy.
  if (read.status === "unavailable") return;
  if (read.status === "failed") throw new SharedCredentialRefusedError();
  if (!custody.isCurrent()) return;
  const untouched = sharedGrantUntouched(custody.subject, read.refreshSlot);
  observeSharedGrant(custody.subject, read.refreshSlot);
  observedGrants.set(key, read.refreshSlot);
  // Equal, or this realm's own rotation never reached the vault: keep memory.
  if (untouched || read.refreshToken === custody.current().refreshToken) return;
  // Another realm rotated, re-paired or removed this grant. Never carry its
  // bearer to an endpoint it was not issued for.
  if (!custody.canAdopt()) throw new SharedCredentialRefusedError();
  custody.apply({ accessToken: read.accessToken, refreshToken: read.refreshToken }, true);
}

/** `runExclusive` for a token lifecycle: adopt the shared copy, then refresh. */
export function runSharedRefresh<T>(
  custody: SharedCredentialCustody,
  run: () => Promise<T>,
): Promise<T> {
  return runCredentialExclusive(custody.subject, async () => {
    await adoptSharedCredential(custody);
    return run();
  });
}

/**
 * `onTokensRefreshed` for a token lifecycle, awaited inside the exclusive
 * section: persist the rotation unless the grant changed underneath it.
 */
export async function commitSharedRefresh(
  custody: SharedCredentialCustody,
  tokens: RemoteTokenSnapshot,
): Promise<void> {
  if (!custody.isCurrent()) return;
  const key = refreshSubjectVaultKey(custody.subject);
  const expected = observedGrants.get(key) ?? null;
  observedGrants.delete(key);
  const pair = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  // This realm switches to its rotation at once; the shared copy is committed
  // below, still inside the exclusive section.
  custody.apply(pair, false);
  try {
    const outcome = await commitSharedCredential({
      subject: custody.subject,
      expected,
      refreshToken: tokens.refreshToken,
      isCurrent: () => custody.isCurrent(),
      ...(custody.bearerConnectionKey !== undefined
        ? {
            bearer: {
              connectionKey: custody.bearerConnectionKey,
              accessToken: tokens.accessToken,
            },
          }
        : {}),
    });
    // A removal or re-pair retired this custody while it committed: the
    // successor owns the grant now.
    if (!custody.isCurrent()) return;
    if (outcome === "committed") {
      custody.apply(pair, true);
    } else if (outcome === "conflict") {
      // Another writer replaced the grant while this exchange ran; its copy is
      // the shared one now.
      await adoptSharedCredential(custody);
    } else if (outcome === "failed") {
      // The vault still holds the grant this exchange just spent, and any realm
      // replaying it would revoke every session: remove it so they fail closed.
      await commitSharedCredential({
        subject: custody.subject,
        expected,
        refreshToken: undefined,
        isCurrent: () => custody.isCurrent(),
      });
    }
  } catch (error) {
    console.warn("[remoteServers] unable to settle the shared credential", error);
  }
}

export function __resetSharedCredentialsForTest(): void {
  observedGrants.clear();
  realmQueues.clear();
}
