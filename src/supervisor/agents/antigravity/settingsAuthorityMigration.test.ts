import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SettingsAuthority } from "@/backend/settings/SettingsAuthority";
import { LEGACY_ANTIGRAVITY_ACP_KIND } from "@/shared/agents/antigravity";
import { settingsSubjectId, type SettingsSubject } from "@/shared/settingsTransactions";

describe("Antigravity settings authority migration", () => {
  it("does not resurrect a deleted canonical entry on the next commit or restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "settings-alias-migration-"));
    const settingsPath = join(root, "settings.json");
    const generation = randomUUID();
    const lease = { paths: { dataRoot: root }, generation, assertActive: () => {} };
    let authority: SettingsAuthority | undefined;
    try {
      const future = { futureConfig: "private-on-disk", token: "lc-safe:v1:unchanged" };
      await writeFile(
        settingsPath,
        JSON.stringify({
          hiddenModels: { [LEGACY_ANTIGRAVITY_ACP_KIND]: ["fixture-model"] },
          providerConfigs: { [LEGACY_ANTIGRAVITY_ACP_KIND]: { model: "fixture-model", ...future } },
        }),
      );
      authority = await SettingsAuthority.open({ lease });
      const subject: SettingsSubject = { kind: "entry", field: "hiddenModels", key: "antigravity" };
      const before = authority.snapshot();
      expect(before.settings.hiddenModels.antigravity).toEqual(["fixture-model"]);
      expect(JSON.stringify(before)).not.toContain("private-on-disk");
      await authority.mutate(
        {
          version: 1,
          authorityId: before.authorityId,
          edits: [
            {
              operation: "delete",
              subject,
              expectedRevision: before.revisions[settingsSubjectId(subject)],
            },
          ],
        },
        () => true,
      );
      const current = authority.snapshot();
      expect(current.settings.hiddenModels.antigravity).toBeUndefined();
      const theme: SettingsSubject = { kind: "field", field: "themeMode" };
      await authority.mutate(
        {
          version: 1,
          authorityId: current.authorityId,
          edits: [
            {
              operation: "set",
              subject: theme,
              expectedRevision: current.revisions[settingsSubjectId(theme)],
              value: "light",
            },
          ],
        },
        () => true,
      );
      const raw = JSON.parse(await readFile(settingsPath, "utf8"));
      expect(raw.hiddenModels).toEqual({});
      expect(raw.providerConfigs.antigravity).toMatchObject(future);
      expect(raw.providerConfigs).not.toHaveProperty(LEGACY_ANTIGRAVITY_ACP_KIND);
      await authority.close();
      authority = await SettingsAuthority.open({ lease });
      expect(authority.readSettings().hiddenModels.antigravity).toBeUndefined();
    } finally {
      await authority?.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses a mutation whose migration would change an undeclared subject", async () => {
    const root = await mkdtemp(join(tmpdir(), "settings-alias-scope-"));
    let authority: SettingsAuthority | undefined;
    try {
      await writeFile(
        join(root, "settings.json"),
        JSON.stringify({ commitGenProvider: "fixture", commitGenModel: "gemini-3-flash-agent" }),
      );
      authority = await SettingsAuthority.open({
        lease: { paths: { dataRoot: root }, generation: randomUUID(), assertActive: () => {} },
      });
      const before = authority.snapshot();
      const bytes = await readFile(join(root, "settings.json"), "utf8");
      const subject: SettingsSubject = { kind: "field", field: "commitGenProvider" };
      await expect(
        authority.mutate(
          {
            version: 1,
            authorityId: before.authorityId,
            edits: [
              {
                operation: "set",
                subject,
                expectedRevision: before.revisions[settingsSubjectId(subject)],
                value: LEGACY_ANTIGRAVITY_ACP_KIND,
              },
            ],
          },
          () => true,
        ),
      ).rejects.toThrow("undeclared settings subject");
      expect(await readFile(join(root, "settings.json"), "utf8")).toBe(bytes);
    } finally {
      await authority?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
