import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, toNamespacedPath } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    chmodSync: vi.fn<typeof original.chmodSync>(original.chmodSync),
    readFileSync: vi.fn<typeof original.readFileSync>(original.readFileSync),
  };
});
import { resolveServerInstallLayout } from "./serverInstallLayout";
import {
  isTerminalUpgradePhase,
  isUpgradeStagingForLayout,
  readServerUpgradeJournal,
  readServerUpgradeJournalState,
  removeServerUpgradeJournal,
  resolveUpgradePrefixForLayout,
  resolveUpgradeStaging,
  serverUpgradeJournalPath,
  writeServerUpgradeJournal,
} from "./serverUpgradeJournal";

const dirs: string[] = [];
afterEach(() => {
  vi.mocked(readFileSync).mockReset();
  for (const dir of dirs.splice(0)) {
    if (dirname(realpathSync.native(dir)) !== realpathSync.native(tmpdir()))
      throw new Error("Fixture cleanup is outside the temporary directory.");
    rmSync(dir, { recursive: true, force: true });
  }
});

function prefixFixture(): { prefix: string; releaseDir: string } {
  const prefix = mkdtempSync(join(tmpdir(), "poracode-upgrade-journal-"));
  dirs.push(prefix);
  const releaseDir = join(prefix, "releases", "release-fixture");
  mkdirSync(join(releaseDir, "lib"), { recursive: true });
  mkdirSync(join(releaseDir, "resources"), { recursive: true });
  writeFileSync(join(releaseDir, "package.json"), `${JSON.stringify({ version: "1.0.0" })}\n`);
  writeFileSync(join(releaseDir, "lib", "server.cjs"), "fixture\n");
  return { prefix, releaseDir };
}

describe("server upgrade journal (D4)", () => {
  it.skipIf(process.platform !== "win32")(
    "holds admission for a namespaced Windows candidate using the existing format-1 journal",
    () => {
      const fixture = prefixFixture();
      const prefix = realpathSync.native(fixture.prefix);
      const releaseDir = realpathSync.native(fixture.releaseDir);
      writeServerUpgradeJournal(prefix, {
        prefix,
        releaseId: "release-fixture",
        releaseDir,
        previousTarget: null,
        phase: "swapped",
        detail: null,
        backupPath: null,
        expectedVersion: "1.0.0",
        expectedEntrypointSha256: "a".repeat(64),
        forwardOnlyMigration: false,
      });
      const layout = resolveServerInstallLayout({
        libDir: toNamespacedPath(join(releaseDir, "lib")),
      });
      expect(resolveUpgradePrefixForLayout(layout)).toBe(prefix);
      expect(resolveUpgradeStaging({ layout, env: {} })).toBe(true);
      writeFileSync(serverUpgradeJournalPath(prefix), '{"formatVersion":99}');
      expect(resolveUpgradeStaging({ layout, env: {} })).toBe(true);
      removeServerUpgradeJournal(prefix);
      expect(resolveUpgradeStaging({ layout, env: {} })).toBe(false);
    },
  );

  it("round-trips every phase and classifies terminal phases", () => {
    const { prefix, releaseDir } = prefixFixture();
    for (const phase of ["staging", "staged", "swapped", "recovery-required"] as const) {
      writeServerUpgradeJournal(prefix, {
        prefix,
        releaseId: "release-fixture",
        releaseDir,
        previousTarget: null,
        phase,
        detail: phase === "staging" ? null : "detail",
        backupPath: null,
        expectedVersion: "1.0.0",
        expectedEntrypointSha256: "a".repeat(64),
        forwardOnlyMigration: false,
      });
      expect(readServerUpgradeJournal(prefix)?.phase).toBe(phase);
    }
    expect(isTerminalUpgradePhase("complete")).toBe(true);
    expect(isTerminalUpgradePhase("failed")).toBe(true);
    expect(isTerminalUpgradePhase("recovery-required")).toBe(true);
    expect(isTerminalUpgradePhase("swapped")).toBe(false);
    removeServerUpgradeJournal(prefix);
    expect(readServerUpgradeJournal(prefix)).toBeNull();
  });

  it("rejects a corrupt or future journal instead of acting on it", () => {
    const { prefix } = prefixFixture();
    writeFileSync(serverUpgradeJournalPath(prefix), "{not json\n");
    expect(readServerUpgradeJournal(prefix)).toBeNull();
    expect(readServerUpgradeJournalState(prefix)).toMatchObject({ state: "invalid" });
    writeFileSync(
      serverUpgradeJournalPath(prefix),
      `${JSON.stringify({ formatVersion: 99, phase: "swapped" })}\n`,
    );
    expect(readServerUpgradeJournal(prefix)).toBeNull();
    expect(readServerUpgradeJournalState(prefix)).toMatchObject({ state: "invalid" });
    // Absence is the only state that may proceed.
    removeServerUpgradeJournal(prefix);
    expect(readServerUpgradeJournalState(prefix)).toEqual({ state: "absent" });
  });

  it("rejects a format-1 journal with a phase this build does not know (V1)", () => {
    const { prefix, releaseDir } = prefixFixture();
    const otherDir = join(prefix, "releases", "release-other");
    mkdirSync(join(otherDir, "lib"), { recursive: true });
    mkdirSync(join(otherDir, "resources"), { recursive: true });
    writeFileSync(join(otherDir, "package.json"), `${JSON.stringify({ version: "0.9.0" })}\n`);
    writeFileSync(join(otherDir, "lib", "server.cjs"), "old\n");
    writeFileSync(
      serverUpgradeJournalPath(prefix),
      `${JSON.stringify({
        formatVersion: 1,
        prefix,
        releaseId: "release-fixture",
        releaseDir,
        previousTarget: null,
        phase: "verifying-by-a-future-build",
        updatedAt: "2026-01-01T00:00:00.000Z",
        detail: null,
        backupPath: null,
        expectedVersion: null,
        expectedEntrypointSha256: null,
        forwardOnlyMigration: false,
      })}\n`,
    );
    const read = readServerUpgradeJournalState(prefix);
    expect(read).toMatchObject({ state: "invalid" });
    expect(read.state === "invalid" ? read.reason : "").toContain("verifying-by-a-future-build");
    // Unknown phase semantics hold admission for every release under the
    // prefix, not only the release the unknown-shaped record happens to name.
    expect(
      isUpgradeStagingForLayout(resolveServerInstallLayout({ libDir: join(releaseDir, "lib") })),
    ).toBe(true);
    expect(
      isUpgradeStagingForLayout(resolveServerInstallLayout({ libDir: join(otherDir, "lib") })),
    ).toBe(true);
  });

  it("never treats a symlink or a dangling symlink at the journal path as absent (V2)", () => {
    const { prefix, releaseDir } = prefixFixture();
    const layout = resolveServerInstallLayout({ libDir: join(releaseDir, "lib") });
    const journalPath = serverUpgradeJournalPath(prefix);
    symlinkSync(join(prefix, "missing.json"), journalPath);
    expect(readServerUpgradeJournalState(prefix)).toMatchObject({
      state: "unreadable",
      reason: "the journal path is not a regular file",
    });
    expect(isUpgradeStagingForLayout(layout)).toBe(true);
    rmSync(journalPath, { force: true });
    // A symlink that currently resolves to a valid journal is still refused:
    // the journal must be a regular file this process owns, never a link.
    writeServerUpgradeJournal(prefix, {
      prefix,
      releaseId: "release-fixture",
      releaseDir,
      previousTarget: null,
      phase: "staged",
      detail: null,
      backupPath: null,
      expectedVersion: "1.0.0",
      expectedEntrypointSha256: "a".repeat(64),
      forwardOnlyMigration: false,
    });
    renameSync(journalPath, join(prefix, "journal-target.json"));
    symlinkSync(join(prefix, "journal-target.json"), journalPath);
    expect(readServerUpgradeJournalState(prefix)).toMatchObject({ state: "unreadable" });
    expect(isUpgradeStagingForLayout(layout)).toBe(true);
  });

  it("writes the nonsecret staging journal readable by the service user (F1)", () => {
    const { prefix, releaseDir } = prefixFixture();
    writeServerUpgradeJournal(prefix, {
      prefix,
      releaseId: "release-fixture",
      releaseDir,
      previousTarget: null,
      phase: "swapped",
      detail: null,
      backupPath: null,
      expectedVersion: "1.0.0",
      expectedEntrypointSha256: "a".repeat(64),
      forwardOnlyMigration: true,
    });
    expect(chmodSync).toHaveBeenCalledWith(serverUpgradeJournalPath(prefix), 0o644);
    expect(statSync(serverUpgradeJournalPath(prefix)).mode & 0o777).toBe(
      process.platform === "win32" ? 0o666 : 0o644,
    );
  });

  it("treats a present but unreadable journal as staging, never as absent (F1/F3)", () => {
    const { prefix, releaseDir } = prefixFixture();
    writeServerUpgradeJournal(prefix, {
      prefix,
      releaseId: "release-fixture",
      releaseDir,
      previousTarget: null,
      phase: "swapped",
      detail: null,
      backupPath: null,
      expectedVersion: "1.0.0",
      expectedEntrypointSha256: "a".repeat(64),
      forwardOnlyMigration: true,
    });
    const path = serverUpgradeJournalPath(prefix);
    const layout = resolveServerInstallLayout({ libDir: join(releaseDir, "lib") });
    vi.mocked(readFileSync).mockImplementation(() => {
      throw Object.assign(new Error("read denied"), { code: "EACCES", path });
    });
    expect(readServerUpgradeJournalState(prefix).state).toBe("unreadable");
    // The convenience read cannot distinguish unreadable from absent...
    expect(readServerUpgradeJournal(prefix)).toBeNull();
    // ...but the candidate must hold admission, not start openly.
    expect(isUpgradeStagingForLayout(layout)).toBe(true);
  });

  it("holds admission for releases under the prefix while the journal is invalid (F3)", () => {
    const { prefix, releaseDir } = prefixFixture();
    writeFileSync(serverUpgradeJournalPath(prefix), "{not json\n");
    const layout = resolveServerInstallLayout({ libDir: join(releaseDir, "lib") });
    expect(readServerUpgradeJournalState(prefix).state).toBe("invalid");
    expect(isUpgradeStagingForLayout(layout)).toBe(true);
    // A future format fails closed the same way.
    writeFileSync(
      serverUpgradeJournalPath(prefix),
      `${JSON.stringify({ formatVersion: 2, phase: "swapped" })}\n`,
    );
    expect(readServerUpgradeJournalState(prefix).state).toBe("invalid");
    expect(isUpgradeStagingForLayout(layout)).toBe(true);
    // Once an operator resolves the journal, the hold is gone.
    removeServerUpgradeJournal(prefix);
    expect(isUpgradeStagingForLayout(layout)).toBe(false);
  });

  it("honors only the exact direct-spawn staging marker (F6)", () => {
    const { prefix, releaseDir } = prefixFixture();
    const layout = resolveServerInstallLayout({ libDir: join(releaseDir, "lib") });
    expect(resolveUpgradeStaging({ env: { PORACODE_UPGRADE_STAGING: "1" } })).toBe(true);
    expect(resolveUpgradeStaging({ env: { PORACODE_UPGRADE_STAGING: "true" } })).toBe(false);
    expect(resolveUpgradeStaging({ env: { PORACODE_UPGRADE_STAGING: "0" } })).toBe(false);
    expect(resolveUpgradeStaging({ env: {} })).toBe(false);
    // The journal hold is authoritative and the marker cannot release it.
    writeServerUpgradeJournal(prefix, {
      prefix,
      releaseId: "release-fixture",
      releaseDir,
      previousTarget: null,
      phase: "swapped",
      detail: null,
      backupPath: null,
      expectedVersion: "1.0.0",
      expectedEntrypointSha256: "a".repeat(64),
      forwardOnlyMigration: true,
    });
    expect(resolveUpgradeStaging({ layout, env: { PORACODE_UPGRADE_STAGING: "0" } })).toBe(true);
    removeServerUpgradeJournal(prefix);
    expect(resolveUpgradeStaging({ layout, env: {} })).toBe(false);
    // A direct spawn is staged even when the journal is not readable.
    expect(resolveUpgradeStaging({ layout, env: { PORACODE_UPGRADE_STAGING: "1" } })).toBe(true);
  });

  it("holds admission only for this release while an upgrade is in flight", () => {
    const { prefix, releaseDir } = prefixFixture();
    const layout = resolveServerInstallLayout({ libDir: join(releaseDir, "lib") });
    expect(resolveUpgradePrefixForLayout(layout)).toBe(prefix);
    expect(isUpgradeStagingForLayout(layout)).toBe(false);
    writeServerUpgradeJournal(prefix, {
      prefix,
      releaseId: "release-fixture",
      releaseDir,
      previousTarget: null,
      phase: "swapped",
      detail: null,
      backupPath: null,
      expectedVersion: "1.0.0",
      expectedEntrypointSha256: "a".repeat(64),
      forwardOnlyMigration: true,
    });
    expect(isUpgradeStagingForLayout(layout)).toBe(true);
    // A different release directory never stages.
    const otherDir = join(prefix, "releases", "release-other");
    mkdirSync(join(otherDir, "lib"), { recursive: true });
    mkdirSync(join(otherDir, "resources"), { recursive: true });
    writeFileSync(join(otherDir, "package.json"), `${JSON.stringify({ version: "0.9.0" })}\n`);
    writeFileSync(join(otherDir, "lib", "server.cjs"), "old\n");
    expect(
      isUpgradeStagingForLayout(resolveServerInstallLayout({ libDir: join(otherDir, "lib") })),
    ).toBe(false);
    // Once admission was granted, a restart is no longer staged.
    writeServerUpgradeJournal(prefix, {
      prefix,
      releaseId: "release-fixture",
      releaseDir,
      previousTarget: null,
      phase: "qualified",
      detail: null,
      backupPath: null,
      expectedVersion: "1.0.0",
      expectedEntrypointSha256: "a".repeat(64),
      forwardOnlyMigration: true,
    });
    expect(isUpgradeStagingForLayout(layout)).toBe(false);
  });

  it("writes atomically so a reader never observes a partial journal", () => {
    const { prefix, releaseDir } = prefixFixture();
    writeServerUpgradeJournal(prefix, {
      prefix,
      releaseId: "release-fixture",
      releaseDir,
      previousTarget: null,
      phase: "staging",
      detail: null,
      backupPath: null,
      expectedVersion: null,
      expectedEntrypointSha256: null,
      forwardOnlyMigration: false,
    });
    const raw = readFileSync(serverUpgradeJournalPath(prefix), "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
