import { readdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { resolveBetterSqliteNativeBindingOptions } from "@/main/db/connection";
import { stripInjectedContext } from "./text";
const TITLE_MAX_CHARS = 200;
function cleanTitle(raw: string): string | undefined {
  const text = stripInjectedContext(raw).replace(/\s+/gu, " ").trim();
  if (text.length === 0) return undefined;
  return text.length > TITLE_MAX_CHARS ? `${text.slice(0, TITLE_MAX_CHARS)}…` : text;
}

export function readCodexTitles(homeDir: string): Map<string, string> {
  const titles = new Map<string, string>();
  let database: InstanceType<typeof Database> | undefined;
  try {
    const stateFile = readdirSync(homeDir)
      .filter((name) => /^state_\d+\.sqlite$/u.test(name))
      .sort((left, right) => Number(left.slice(6, -7)) - Number(right.slice(6, -7)))
      .at(-1);
    if (!stateFile) return titles;
    database = new Database(join(homeDir, stateFile), {
      ...resolveBetterSqliteNativeBindingOptions(),
      readonly: true,
      fileMustExist: true,
    });
    const rows = database.prepare("SELECT id, name, title FROM threads").all() as Array<{
      id: string;
      name: string | null;
      title: string | null;
    }>;
    for (const row of rows) {
      const title = cleanTitle(row.name ?? "") ?? cleanTitle(row.title ?? "");
      if (title) titles.set(row.id, title);
    }
  } catch {
    // No index, or one this build cannot read: the first prompt stands in.
  } finally {
    database?.close();
  }
  return titles;
}
