import { readFileSync, writeFileSync } from "node:fs";
import { replaceSettingsSubject } from "@/backend/settings/settingsSubjects";
import type { SupervisorSettingsWriter } from "./supervisorSettingsWriter";

/**
 * Explicit standalone writer for tests that run without a settings owner. It
 * applies each subject edit to the raw document the way the authority does,
 * so the version marker and unknown fields survive; it never runs the
 * authority's admission or credential checks.
 */
export function fileSettingsWriter(settingsPath: string): SupervisorSettingsWriter {
  return {
    admit: async () => {},
    commit: async (edits) => {
      let raw: Record<string, unknown> = {};
      try {
        raw = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      for (const { subject, value } of edits) replaceSettingsSubject(raw, subject, value);
      writeFileSync(settingsPath, JSON.stringify(raw, null, 2), "utf8");
    },
  };
}

export function fileSettingsTarget(settingsPath: string): {
  settingsPath: string;
  settingsWriter: SupervisorSettingsWriter;
} {
  return { settingsPath, settingsWriter: fileSettingsWriter(settingsPath) };
}
