import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { Thread } from "@/shared/contracts";

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
const { nativeBindingEnv, sqliteAvailable } = (() => {
  try {
    new Database(":memory:").close();
    return { nativeBindingEnv: undefined, sqliteAvailable: true };
  } catch {
    const available = existsSync(serverNativeBinding);
    return {
      nativeBindingEnv: available ? serverNativeBinding : undefined,
      sqliteAvailable: available,
    };
  }
})();

function testThread(): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Runtime persistence",
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "working",
    attention: "working",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

export { nativeBindingEnv, sqliteAvailable, testThread };
