import type Database from "better-sqlite3";

interface WatchIdentity {
  pr_number: number;
  active_thread_id: string | null;
  watch_enabled: number;
  auto_merge: number;
  blocked_reason: string | null;
}

/** Preserve the complete watch tied to an existing fix, including its checkpoint and config. */
export function rehomeProjectWatches(
  sqlite: InstanceType<typeof Database>,
  duplicateId: string,
  canonicalId: string,
): void {
  const duplicates = sqlite
    .prepare("SELECT * FROM pr_watches WHERE project_id = ?")
    .all(duplicateId) as WatchIdentity[];
  const select = sqlite.prepare("SELECT * FROM pr_watches WHERE project_id = ? AND pr_number = ?");
  const remove = sqlite.prepare("DELETE FROM pr_watches WHERE project_id = ? AND pr_number = ?");
  const move = sqlite.prepare(
    "UPDATE pr_watches SET project_id = ? WHERE project_id = ? AND pr_number = ?",
  );
  for (const duplicate of duplicates) {
    const canonical = select.get(canonicalId, duplicate.pr_number) as WatchIdentity | undefined;
    if (!canonical) {
      move.run(canonicalId, duplicateId, duplicate.pr_number);
      continue;
    }
    // Prefer an existing fix's entire row. Otherwise prefer enabled automation,
    // with the canonical row breaking ties; never mix a model/config/checkpoint.
    const preferDuplicate =
      !canonical.active_thread_id &&
      (Boolean(duplicate.active_thread_id) ||
        (!(canonical.watch_enabled || canonical.auto_merge) &&
          Boolean(duplicate.watch_enabled || duplicate.auto_merge)));
    remove.run(preferDuplicate ? canonicalId : duplicateId, duplicate.pr_number);
    if (preferDuplicate) move.run(canonicalId, duplicateId, duplicate.pr_number);

    // One scalar active-thread slot cannot represent two different fixes. Both
    // thread rows are retained, but automatic work waits for an explicit mode
    // selection so finishing one fix cannot launch another beside the other.
    if (
      canonical.blocked_reason === "duplicate-project-watches" ||
      duplicate.blocked_reason === "duplicate-project-watches" ||
      (canonical.active_thread_id &&
        duplicate.active_thread_id &&
        canonical.active_thread_id !== duplicate.active_thread_id)
    ) {
      sqlite
        .prepare(
          "UPDATE pr_watches SET watch_enabled = 0, auto_merge = 0, last_error = NULL, blocked_reason = 'duplicate-project-watches' WHERE project_id = ? AND pr_number = ?",
        )
        .run(canonicalId, duplicate.pr_number);
    }
  }
}
