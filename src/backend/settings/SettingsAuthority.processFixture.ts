// Real process fault fixture. Never imported by a production entry point.
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const [root, mode] = process.argv.slice(2);
if (!root || !mode) throw new Error("Missing settings process fixture arguments.");
let resume: (() => void) | undefined;
let active = true;
let authority: import("./SettingsAuthority").SettingsAuthority | undefined;
process.on("message", (message) => {
  if (message === "continue") resume?.();
  if (message === "read")
    process.send?.({ type: "read", theme: authority?.readSettings().themeMode });
});
async function pause(stage: string): Promise<void> {
  const gate = Promise.withResolvers<void>();
  resume = gate.resolve;
  process.send?.({ type: "stage", stage });
  await gate.promise;
  resume = undefined;
}

const originalOpen = fs.open.bind(fs);
const originalRename = fs.rename.bind(fs);
fs.open = async (...args: Parameters<typeof fs.open>) => {
  const file = await originalOpen(...args);
  const originalSync = file.sync.bind(file);
  const temporary = String(args[0]).endsWith(".tmp");
  const directory = String(args[0]) === root;
  file.sync = async () => {
    if (temporary && mode === "file-sync-failure") throw new Error("Fixture file sync failed");
    if (directory && mode === "directory-sync-failure")
      throw new Error("Fixture directory sync failed");
    await originalSync();
    if (temporary && mode === "after-file-sync") await pause("file-synced");
    if (temporary && mode === "lease-loss") active = false;
    if (directory && mode === "during-directory-sync") await pause("directory-synced");
  };
  return file;
};
fs.rename = async (...args: Parameters<typeof fs.rename>) => {
  if (mode === "before-rename") await pause("before-rename");
  await originalRename(...args);
  if (mode === "after-rename") await pause("renamed");
};
syncBuiltinESMExports();

const { SettingsAuthority } = await import("./SettingsAuthority");
const { settingsSubjectId } = await import("@/shared/settingsTransactions");
const reported: string[] = [];
const generation = randomUUID();
authority = await SettingsAuthority.open({
  lease: {
    paths: { dataRoot: root },
    generation,
    assertActive: (expected) => {
      if (!active || expected !== generation) throw new Error("Fixture lease lost");
    },
  },
  reportError: (error) => {
    reported.push(String(error));
  },
});
const snapshot = authority.snapshot();
const subject = { kind: "field", field: "themeMode" } as const;
try {
  const result = await authority.mutate(
    {
      version: 1,
      authorityId: snapshot.authorityId,
      edits: [
        {
          subject,
          expectedRevision: snapshot.revisions[settingsSubjectId(subject)],
          operation: "set",
          value: "light",
        },
      ],
    },
    () => true,
  );
  process.send?.({
    type: "result",
    result,
    cachedTheme: authority.readSettings().themeMode,
    reported,
  });
} catch (error) {
  process.send?.({
    type: "failure",
    message: String(error),
    contents: await fs.readFile(join(root, "settings.json"), "utf8"),
    reported,
  });
} finally {
  await authority.close();
  process.disconnect?.();
}
