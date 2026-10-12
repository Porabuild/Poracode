import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { coalesceByKey } from "@/shared/coalesce";
import { runMacKeychainCommand, resetMacKeychainProcessStateForTests } from "./macKeychainProcess";

/**
 * Leave time to answer the authorization dialog. Killing the client after five
 * seconds can interrupt "Always Allow" before its grant is committed.
 */
const AUTHORIZATION_TIMEOUT_MS = 120_000;

export interface MacKeychainItem {
  service: string;
  account: string;
}

// A denial, cancellation or timeout must not start another password dialog on
// the next usage poll. Scope the decision to this item and process, so another
// account still works. An explicit refresh or restart permits a new attempt.
const suppressedItems = new Set<string>();
const passwordReads = new Map<string, Promise<string | undefined>>();
const attributeReads = new Map<string, Promise<string | undefined>>();
const authorizationRetries = new AsyncLocalStorage<Map<string, Promise<void>>>();

/** Permit one authorization attempt per item within an explicit user refresh. */
export function withMacKeychainAuthorizationRetry<T>(run: () => Promise<T>): Promise<T> {
  return authorizationRetries.run(new Map(), run);
}

function itemKey(item: MacKeychainItem): string {
  return JSON.stringify([item.service, item.account]);
}

function suppressAuthorizationFailure(key: string, error: unknown): void {
  // Exit 44 is errSecItemNotFound: no authorization dialog was involved. Keep
  // discovering an item created by a later CLI login without an app restart.
  if ((error as { code?: unknown } | null)?.code !== 44) suppressedItems.add(key);
}

function prepareAuthorization(key: string): Promise<void> | undefined {
  const retries = authorizationRetries.getStore();
  if (!retries) return undefined;
  const existing = retries.get(key);
  if (existing) return existing;
  // A forced subset can overlap a larger background collection. Wait for its
  // dialog to settle before clearing the refusal and starting a fresh attempt.
  const prepared = (async () => {
    await passwordReads.get(key);
    suppressedItems.delete(key);
  })();
  // Retain the settled preparation too: a failed retry must stay suppressed for
  // the rest of this action, and siblings must share its pending dialog wait.
  retries.set(key, prepared);
  return prepared;
}

/** Read fresh password data; concurrent requests share one authorization. */
export async function readMacKeychainPassword(item: MacKeychainItem): Promise<string | undefined> {
  if (process.platform !== "darwin") return undefined;
  const key = itemKey(item);
  const retry = prepareAuthorization(key);
  if (retry) await retry;
  if (suppressedItems.has(key)) return undefined;
  return coalesceByKey(passwordReads, key, async () => {
    try {
      const { stdout } = await runMacKeychainCommand(
        ["find-generic-password", "-a", item.account, "-w", "-s", item.service],
        AUTHORIZATION_TIMEOUT_MS,
      );
      return stdout.trim() || undefined;
    } catch (error) {
      suppressAuthorizationFailure(key, error);
      return undefined;
    }
  });
}

/**
 * Non-secret identity for a persisted credential grant. Omitting -w and -g
 * requests only attributes. Dates detect replacement/login; the keychain path
 * distinguishes matching items in different keychains.
 */
export async function readMacKeychainFingerprint(
  item: MacKeychainItem,
): Promise<string | undefined> {
  if (process.platform !== "darwin") return undefined;
  const key = itemKey(item);
  if (suppressedItems.has(key)) return undefined;
  return coalesceByKey(attributeReads, key, async () => {
    try {
      const { stdout } = await runMacKeychainCommand(
        ["find-generic-password", "-a", item.account, "-s", item.service],
        5_000,
      );
      const identity = stdout.match(/^keychain: .+$/m)?.[0];
      const created = stdout.match(/^\s*"cdat"<timedate>=.+$/m)?.[0].trim();
      const modified = stdout.match(/^\s*"mdat"<timedate>=.+$/m)?.[0].trim();
      if (!identity || !created || !modified) return undefined;
      return createHash("sha256").update([identity, created, modified].join("\n")).digest("hex");
    } catch {
      return undefined;
    }
  });
}

/** Update password data without changing the item's existing access policy. */
export async function writeMacKeychainPassword(
  item: MacKeychainItem,
  content: string,
): Promise<void> {
  if (process.platform !== "darwin") return;
  const key = itemKey(item);
  const retry = prepareAuthorization(key);
  if (retry) await retry;
  if (suppressedItems.has(key)) throw new Error("Keychain access is unavailable for this launch.");
  try {
    await runMacKeychainCommand(
      ["add-generic-password", "-U", "-a", item.account, "-s", item.service, "-w", content],
      AUTHORIZATION_TIMEOUT_MS,
    );
  } catch (error) {
    suppressAuthorizationFailure(key, error);
    // execFile errors embed argv, which contains the password. Never pass that
    // error (or its cause) to a caller that might log it.
    // eslint-disable-next-line preserve-caught-error -- The cause contains secret argv.
    throw new Error("Unable to update the Keychain password.");
  }
}

/** Simulate a new process between deterministic tests; never reset on polling. */
export function resetMacKeychainStateForTests(): void {
  resetMacKeychainProcessStateForTests();
  suppressedItems.clear();
  passwordReads.clear();
  attributeReads.clear();
}
