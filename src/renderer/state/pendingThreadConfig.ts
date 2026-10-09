import type { Thread, ThreadConfig } from "@/shared/contracts";
import { isThreadConfigEqual } from "@/shared/contracts";
import { canonicalizeEffortId } from "@/shared/effortOrder";
import { threadConfigBaseSchema } from "@/shared/contracts/config";

let nextRevision = 0;

const configKeys = Object.keys(threadConfigBaseSchema.shape) as Array<keyof ThreadConfig>;
const selectionKeys: Array<keyof ThreadConfig> = [
  "model",
  "effort",
  "contextSize",
  "fast",
  "thinking",
  "selectionBinding",
];

/** Unsubmitted composer edits are client intent, not a provider acknowledgement. */
export interface PendingThreadConfig {
  readonly owner: Pick<
    Thread,
    "agentKind" | "agentInstanceId" | "presentationMode" | "remoteServerId"
  >;
  readonly config: ThreadConfig;
  readonly keys: readonly (keyof ThreadConfig)[];
  readonly revisions: Partial<Record<keyof ThreadConfig, number>>;
  readonly submissions: readonly number[];
}

/** Captured local edits retired by one in-flight dispatch, never serialized. */
export interface ThreadConfigSubmission extends Omit<PendingThreadConfig, "submissions"> {
  readonly id: number;
}

function fieldEquals(key: keyof ThreadConfig, left: ThreadConfig, right: ThreadConfig): boolean {
  return isThreadConfigEqual(
    { model: left.model, [key]: left[key] },
    { model: left.model, [key]: right[key] },
  );
}

function copyField(
  config: ThreadConfig,
  source: ThreadConfig,
  key: keyof ThreadConfig,
): ThreadConfig {
  const next = { ...config };
  if (Object.hasOwn(source, key)) Object.assign(next, { [key]: source[key] });
  else delete next[key];
  return next;
}

function sameOwner(pending: Pick<PendingThreadConfig, "owner">, thread: Thread): boolean {
  return (
    pending.owner.agentKind === thread.agentKind &&
    pending.owner.agentInstanceId === thread.agentInstanceId &&
    pending.owner.presentationMode === thread.presentationMode &&
    pending.owner.remoteServerId === thread.remoteServerId
  );
}

export function recordPendingThreadConfig(
  thread: Thread,
  config: ThreadConfig,
  previous?: PendingThreadConfig,
): PendingThreadConfig | undefined {
  if (thread.presentationMode !== "gui") return undefined;
  const owned = previous && sameOwner(previous, thread) ? previous : undefined;
  const keys = new Set(owned?.keys ?? []);
  const revisions = { ...owned?.revisions };
  const changed = new Set<keyof ThreadConfig>();
  for (const key of configKeys) {
    if (!fieldEquals(key, thread.config, config)) changed.add(key);
  }
  // A model choice owns its dependent axes, even when an axis happened to have
  // the same value on the previous model. Older model echoes must not mix them.
  if (!fieldEquals("model", thread.config, config)) {
    for (const key of selectionKeys) changed.add(key);
  }
  for (const key of changed) {
    keys.add(key);
    revisions[key] = ++nextRevision;
  }
  return keys.size || owned?.submissions.length
    ? {
        owner: {
          agentKind: thread.agentKind,
          ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
          ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
          ...(thread.remoteServerId ? { remoteServerId: thread.remoteServerId } : {}),
        },
        config,
        keys: [...keys],
        revisions,
        submissions: owned?.submissions ?? [],
      }
    : undefined;
}

/** Only the captured submission is retired; edits made after its capture survive. */
export function beginThreadConfigSubmission(
  pending: PendingThreadConfig,
  submitted: ThreadConfig,
): { pending: PendingThreadConfig; submission: ThreadConfigSubmission } {
  const keys = pending.keys.filter(
    (key) =>
      (pending.config.model !== submitted.model && selectionKeys.includes(key)) ||
      !fieldEquals(key, pending.config, submitted),
  );
  const id = ++nextRevision;
  return {
    pending: { ...pending, keys, submissions: [...pending.submissions, id] },
    submission: { ...pending, id, keys: pending.keys.filter((key) => !keys.includes(key)) },
  };
}

/** Restore a definite rejection only if this owner/field has not been edited since. */
export function finishThreadConfigSubmission(
  thread: Thread,
  pending: PendingThreadConfig | undefined,
  submission: ThreadConfigSubmission,
  restore: boolean,
): PendingThreadConfig | undefined {
  if (!pending || !sameOwner(submission, thread) || !pending.submissions.includes(submission.id))
    return pending;
  const keys = new Set(pending.keys);
  let config = pending.config;
  if (restore) {
    for (const key of submission.keys) {
      if (pending.revisions[key] !== submission.revisions[key]) continue;
      keys.add(key);
      config = copyField(config, submission.config, key);
    }
  }
  const submissions = pending.submissions.filter((id) => id !== submission.id);
  return keys.size || submissions.length
    ? supportedPendingConfig(thread, { ...pending, config, keys: [...keys], submissions })
    : undefined;
}

function supportedPendingConfig(
  incoming: Thread,
  pending: PendingThreadConfig,
): PendingThreadConfig | undefined {
  if (!sameOwner(pending, incoming)) return undefined;
  if (!pending.keys.includes("effort")) return pending;
  const model = incoming.sessionConfigOptions?.find(
    (option) => option.type === "select" && option.role === "model",
  );
  const effort = incoming.sessionConfigOptions?.find(
    (option) => option.type === "select" && option.role === "effort",
  );
  if (
    model?.type !== "select" ||
    model.currentValue !== pending.config.model ||
    !pending.config.effort ||
    (effort?.type === "select" &&
      effort.values.some(
        (option) =>
          canonicalizeEffortId(option.value) === canonicalizeEffortId(pending.config.effort!),
      ))
  )
    return pending;
  // With a confirmed current model, an absent selector is authoritative too.
  const keys = pending.keys.filter((key) => key !== "effort");
  return keys.length || pending.submissions.length ? { ...pending, keys } : undefined;
}

/** Volatile intent cannot outlive its row/owner or an explicitly narrowed ladder. */
export function retainPendingThreadConfigs(
  pending: Record<string, PendingThreadConfig>,
  threads: readonly Thread[],
): Record<string, PendingThreadConfig> {
  const ids = Object.keys(pending);
  if (!ids.length) return pending;
  const rows = new Map(threads.map((thread) => [thread.id, thread]));
  let next = pending;
  for (const id of ids) {
    const row = rows.get(id);
    const kept = row ? supportedPendingConfig(row, pending[id]!) : undefined;
    if (kept === pending[id]) continue;
    if (next === pending) next = { ...pending };
    if (kept) next[id] = kept;
    else delete next[id];
  }
  return next;
}

/** Carry desired next-turn fields through live echoes and host row replacements. */
export function preservePendingThreadConfig(
  incoming: Thread,
  pending: PendingThreadConfig | undefined,
): Thread {
  if (!pending) return incoming;
  pending = supportedPendingConfig(incoming, pending);
  if (!pending) return incoming;
  let config = incoming.config;
  for (const key of pending.keys) {
    if (fieldEquals(key, config, pending.config)) continue;
    config = copyField(config, pending.config, key);
  }
  return config === incoming.config ? incoming : { ...incoming, config };
}
