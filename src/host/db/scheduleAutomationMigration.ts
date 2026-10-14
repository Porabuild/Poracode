import type Database from "better-sqlite3";

/** Schema 59 preserves schedule configuration and makes historical failures reviewable. */
export function migrateScheduleAutomation(sqlite: InstanceType<typeof Database>): void {
  const add = (table: string, column: string, definition: string) => {
    const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((entry) => entry.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  add("scheduled_tasks", "automation", "TEXT");
  add("scheduled_tasks", "iteration_count", "INTEGER NOT NULL DEFAULT 0");
  for (const [column, definition] of [
    ["scheduled_for", "TEXT"],
    ["trigger", "TEXT NOT NULL DEFAULT 'scheduled'"],
    ["attempt", "INTEGER NOT NULL DEFAULT 1"],
    ["iteration", "INTEGER NOT NULL DEFAULT 1"],
    ["result", "TEXT"],
    ["automation_snapshot", "TEXT"],
    ["unread", "INTEGER NOT NULL DEFAULT 0"],
    ["archived_at", "TEXT"],
  ])
    add("scheduled_task_runs", column!, definition!);

  sqlite.exec(`
    UPDATE scheduled_task_runs SET scheduled_for = started_at WHERE scheduled_for IS NULL;
    CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_inbox
      ON scheduled_task_runs (unread, archived_at, started_at DESC, id DESC);
  `);
  const rows = sqlite
    .prepare(
      "SELECT id, status, summary, completed_at FROM scheduled_task_runs WHERE result IS NULL AND status != 'running'",
    )
    .all() as { id: string; status: string; summary: string | null; completed_at: string | null }[];
  const update = sqlite.prepare(
    "UPDATE scheduled_task_runs SET result = ?, unread = ?, archived_at = ? WHERE id = ?",
  );
  for (const row of rows) {
    const needsAttention = row.status === "failed" || row.status === "interrupted";
    const archivedAt = needsAttention ? null : row.completed_at;
    update.run(
      JSON.stringify({
        outcome: needsAttention ? "needs-attention" : "unknown",
        summary: row.summary?.slice(0, 2_000) ?? null,
        severity: row.status === "failed" ? "error" : needsAttention ? "warning" : "info",
        unread: needsAttention,
        archivedAt,
        changedFiles: [],
        stopReason: "legacy-run",
      }),
      needsAttention ? 1 : 0,
      archivedAt,
      row.id,
    );
  }
}
