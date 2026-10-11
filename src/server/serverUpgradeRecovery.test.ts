import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalHostPath } from "@/backend/ownership/hostRootPaths";
import type { ServerUpgradeJournalRead, ServerUpgradePhase } from "./serverUpgradeJournal";
import { defaultUpgradeIo } from "./serverUpgrade";
import { abandonServerUpgrade } from "./serverUpgradeRecovery";

/**
 * V3 regression: `--abandon-journal` must decide from the journal that is
 * present while it holds the prefix lock, never from the record read before
 * the lock. The partial mock scripts `readServerUpgradeJournalState` so the
 * pre-lock inspection and the under-lock re-read can differ deterministically;
 * a real second process cannot produce that interleaving on demand because the
 * read→lock window is a synchronous in-process gap.
 */
const journalMock = vi.hoisted(() => ({ scripted: [] as unknown[] }));

vi.mock("./serverUpgradeJournal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./serverUpgradeJournal")>();
  return {
    ...actual,
    readServerUpgradeJournalState: (prefix: string): ServerUpgradeJournalRead => {
      const next = journalMock.scripted.shift();
      return next === undefined
        ? actual.readServerUpgradeJournalState(prefix)
        : (next as ServerUpgradeJournalRead);
    },
  };
});

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  journalMock.scripted.length = 0;
});

function sandbox(): { prefix: string; releaseDir: string; journalPath: string } {
  const root = mkdtempSync(join(tmpdir(), "poracode-upgrade-recovery-"));
  dirs.push(root);
  const prefix = canonicalHostPath(join(root, "prefix"));
  mkdirSync(prefix, { recursive: true });
  const releaseDir = join(prefix, "releases", "release-interrupted");
  mkdirSync(join(releaseDir, "lib"), { recursive: true });
  mkdirSync(join(releaseDir, "resources"), { recursive: true });
  writeFileSync(join(releaseDir, "package.json"), `${JSON.stringify({ version: "1.1.0" })}\n`);
  writeFileSync(join(releaseDir, "lib", "server.cjs"), "interrupted\n");
  return { prefix, releaseDir, journalPath: join(prefix, "upgrade-journal.json") };
}

function okRead(
  prefix: string,
  releaseDir: string,
  phase: ServerUpgradePhase,
): Extract<ServerUpgradeJournalRead, { state: "ok" }> {
  return {
    state: "ok",
    journal: {
      formatVersion: 1,
      prefix,
      releaseId: "release-interrupted",
      releaseDir,
      previousTarget: null,
      phase,
      updatedAt: "2026-01-01T00:00:00.000Z",
      detail: null,
      backupPath: null,
      expectedVersion: null,
      expectedEntrypointSha256: null,
      forwardOnlyMigration: false,
    },
  };
}

const noOwnerIo = { ...defaultUpgradeIo, probeOwner: async () => null };

describe("server upgrade recovery under the prefix lock (V3)", () => {
  it("refuses to abandon a journal that vanished between inspection and the lock", async () => {
    const { prefix, releaseDir, journalPath } = sandbox();
    writeFileSync(journalPath, `${JSON.stringify(okRead(prefix, releaseDir, "staged").journal)}\n`);
    journalMock.scripted.push(okRead(prefix, releaseDir, "staged"));
    journalMock.scripted.push({ state: "absent" });

    await expect(
      abandonServerUpgrade(
        { from: "", prefix, json: true, abandonJournal: true, confirm: true },
        noOwnerIo,
      ),
    ).rejects.toMatchObject({ code: "SERVER_UPGRADE_REFUSED" });
    // Nothing was removed on the strength of the stale record.
    expect(existsSync(journalPath)).toBe(true);
    expect(existsSync(releaseDir)).toBe(true);
  });

  it("refuses to abandon when the journal was replaced with a readable one after inspection", async () => {
    const { prefix, releaseDir, journalPath } = sandbox();
    writeFileSync(journalPath, "{corrupt\n");
    journalMock.scripted.push({ state: "invalid", path: journalPath, reason: "corrupt" });
    journalMock.scripted.push(okRead(prefix, releaseDir, "staged"));

    await expect(
      abandonServerUpgrade(
        { from: "", prefix, json: true, abandonJournal: true, confirm: true },
        noOwnerIo,
      ),
    ).rejects.toMatchObject({ code: "SERVER_UPGRADE_RECOVERY_REFUSED" });
    expect(existsSync(journalPath)).toBe(true);
  });
});
