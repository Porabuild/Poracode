import { mkdtempSync, rmSync, unlinkSync, watch, type FSWatcher } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileAtomic } from "@/shared/atomicFile";
import { defaultSharedSettings } from "@/shared/settings";
import {
  readSupervisorSharedSettings,
  SupervisorSharedSettingsCache,
} from "./supervisorSharedSettings";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, watch: vi.fn<typeof actual.watch>(actual.watch) };
});

const tempDirs: string[] = [];
const caches: SupervisorSharedSettingsCache[] = [];

afterEach(() => {
  for (const cache of caches.splice(0)) cache.dispose();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.mocked(watch).mockReset();
});

function writeTheme(settingsPath: string, themeMode: "dark" | "light"): void {
  writeFileAtomic(
    settingsPath,
    `${JSON.stringify({ ...defaultSharedSettings, themeMode }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

describe("SupervisorSharedSettingsCache", () => {
  it("observes a settings file created after its initial missing-file read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    const cache = new SupervisorSharedSettingsCache(settingsPath);
    caches.push(cache);

    expect(cache.read().themeMode).toBe(defaultSharedSettings.themeMode);
    writeTheme(settingsPath, "light");

    // The directory watcher owns creation and atomic replacement. Propagation
    // is deliberately asynchronous (the next read picks the new document up),
    // matching the ratified cache contract — not a synchronous freshness
    // promise for the instant after a commit.
    await vi.waitFor(() => expect(cache.read().themeMode).toBe("light"), { timeout: 2_000 });
  });

  it("reads the replacement written while its first watcher attaches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    writeTheme(settingsPath, "dark");
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(watch).mockImplementationOnce((...args) => {
      // Model another process's atomic write in the read/registration gap.
      // The real watcher attaches to the new inode and cannot replay its creation.
      writeTheme(settingsPath, "light");
      return actual.watch(...args);
    });
    const cache = new SupervisorSharedSettingsCache(settingsPath);
    caches.push(cache);

    expect(cache.read().themeMode).toBe("light");
  });

  it("refreshes settings when a failed watch registration later succeeds", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    writeTheme(settingsPath, "dark");
    vi.mocked(watch).mockImplementationOnce(() => {
      throw Object.assign(new Error("watch temporarily unavailable"), { code: "EMFILE" });
    });
    const cache = new SupervisorSharedSettingsCache(settingsPath);
    caches.push(cache);

    expect(cache.read().themeMode).toBe("dark");
    writeTheme(settingsPath, "light");

    expect(cache.read().themeMode).toBe("light");
  });

  it("observes back-to-back atomic replacements through one long-lived watcher", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    writeTheme(settingsPath, "dark");
    const cache = new SupervisorSharedSettingsCache(settingsPath);
    caches.push(cache);

    expect(cache.read().themeMode).toBe("dark");

    // No settling sleep between replacements: this is the burst regime that
    // the old close-inside-callback re-registration missed. Each write must
    // still be observed through the single watcher attached at first read.
    for (let iteration = 0; iteration < 6; iteration += 1) {
      const mode = iteration % 2 === 0 ? "light" : "dark";
      writeTheme(settingsPath, mode);
      await vi.waitFor(() => expect(cache.read().themeMode).toBe(mode), { timeout: 2_000 });
    }
    expect(vi.mocked(watch)).toHaveBeenCalledTimes(1);
  });
});

describe("SupervisorSharedSettingsCache watcher lifetime", () => {
  it("keeps the directory watcher attached across ordinary invalidations", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    writeTheme(settingsPath, "dark");
    const cache = new SupervisorSharedSettingsCache(settingsPath);
    caches.push(cache);

    expect(cache.read().themeMode).toBe("dark");
    const watcher = vi.mocked(watch).mock.results.at(-1)?.value as FSWatcher;
    const closeSpy = vi.spyOn(watcher, "close");

    // Ordinary invalidation (watcher callback, explicit settings writes) only
    // drops the cached document. Closing the watcher here would re-open the
    // registration window for the write that triggered the invalidation.
    for (let iteration = 0; iteration < 5; iteration += 1) {
      cache.invalidate();
      expect(cache.read().themeMode).toBe("dark");
    }

    expect(vi.mocked(watch)).toHaveBeenCalledTimes(1);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("re-reads once after attach so a write lost in the registration window cannot stay stale", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    writeTheme(settingsPath, "dark");
    // A watcher that never delivers models a write that lands before the
    // FSEvents stream is live: the real watcher cannot replay it either.
    vi.mocked(watch).mockImplementationOnce(
      () =>
        ({
          on: vi.fn<(...args: unknown[]) => unknown>(),
          close: vi.fn<() => void>(),
        }) as unknown as FSWatcher,
    );
    const cache = new SupervisorSharedSettingsCache(settingsPath);
    caches.push(cache);

    expect(cache.read().themeMode).toBe("dark");
    writeTheme(settingsPath, "light");

    // The bounded attach revalidation re-reads the document once; without it
    // the cache would serve the pre-attach read indefinitely.
    await vi.waitFor(() => expect(cache.read().themeMode).toBe("light"), { timeout: 2_000 });
  });

  it("closes the dead watcher on error and re-arms on the next read without a stale close", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    writeTheme(settingsPath, "dark");
    const cache = new SupervisorSharedSettingsCache(settingsPath);
    caches.push(cache);

    expect(cache.read().themeMode).toBe("dark");
    const first = vi.mocked(watch).mock.results.at(-1)?.value as FSWatcher;
    const firstClose = vi.spyOn(first, "close");

    first.emit("error", new Error("watcher failed"));
    expect(firstClose).toHaveBeenCalledTimes(1);

    writeTheme(settingsPath, "light");
    expect(cache.read().themeMode).toBe("light");
    expect(vi.mocked(watch)).toHaveBeenCalledTimes(2);

    // A retired watcher's late error must not close the live replacement.
    const second = vi.mocked(watch).mock.results.at(-1)?.value as FSWatcher;
    const secondClose = vi.spyOn(second, "close");
    first.emit("error", new Error("late watcher failure"));
    expect(secondClose).not.toHaveBeenCalled();
    expect(cache.read().themeMode).toBe("light");
  });

  it("closes the watcher on dispose and tolerates a repeated dispose", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    writeTheme(settingsPath, "dark");
    const cache = new SupervisorSharedSettingsCache(settingsPath);

    expect(cache.read().themeMode).toBe("dark");
    const watcher = vi.mocked(watch).mock.results.at(-1)?.value as FSWatcher;
    const closeSpy = vi.spyOn(watcher, "close");

    cache.dispose();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    cache.dispose();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("warns once when the directory watch cannot be established, without the settings path", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    vi.mocked(watch).mockImplementation(() => {
      throw Object.assign(new Error("watch unavailable"), { code: "EMFILE" });
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const cache = new SupervisorSharedSettingsCache(settingsPath);
      caches.push(cache);

      cache.read();
      cache.read();
      cache.read();

      // Reads still work; every failed registration retries, but only the
      // first failure in the episode is diagnosed.
      expect(vi.mocked(watch)).toHaveBeenCalledTimes(3);
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toContain("EMFILE");
      expect(message).not.toContain(dir);
      expect(message).not.toContain("settings.json");
    } finally {
      warn.mockRestore();
    }
  });

  it("re-arms the watch warning after a later successful attachment", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-supervisor-settings-"));
    tempDirs.push(dir);
    const settingsPath = join(dir, "settings.json");
    writeTheme(settingsPath, "dark");
    vi.mocked(watch).mockImplementationOnce(() => {
      throw Object.assign(new Error("watch unavailable"), { code: "EMFILE" });
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const cache = new SupervisorSharedSettingsCache(settingsPath);
      caches.push(cache);

      expect(cache.read().themeMode).toBe("dark");
      expect(warn).toHaveBeenCalledTimes(1);

      // The next read attaches for real, which ends the failure episode.
      expect(cache.read().themeMode).toBe("dark");
      const live = vi.mocked(watch).mock.results.at(-1)?.value as FSWatcher;
      live.emit("error", new Error("watcher died"));
      vi.mocked(watch).mockImplementationOnce(() => {
        throw Object.assign(new Error("watch unavailable"), { code: "EMFILE" });
      });
      expect(cache.read().themeMode).toBe("dark");
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});

function makeSettingsCache(): { settingsPath: string; cache: SupervisorSharedSettingsCache } {
  const dir = mkdtempSync(join(tmpdir(), "poracode-admission-settings-"));
  tempDirs.push(dir);
  const settingsPath = join(dir, "settings.json");
  const cache = new SupervisorSharedSettingsCache(settingsPath);
  caches.push(cache);
  return { settingsPath, cache };
}

function writeDocument(settingsPath: string, value: unknown): void {
  writeFileAtomic(settingsPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function writeAdmission(settingsPath: string, admission: unknown): void {
  writeDocument(settingsPath, { ...defaultSharedSettings, hostResourceAdmission: admission });
}

describe("SupervisorSharedSettingsCache host resource admission", () => {
  it("resolves the same partial document as the settings authority", () => {
    const { settingsPath, cache } = makeSettingsCache();
    writeAdmission(settingsPath, { maxActiveAgentSessions: 8 });

    expect(cache.read().hostResourceAdmission).toEqual({
      maxActiveAgentSessions: 8,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
    });
    const resolved = cache.readHostResourceAdmission();
    expect(resolved.resolution).toEqual({ kind: "configured" });
    expect(resolved.policy).toEqual({
      maxActiveAgentSessions: 8,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
      overloadRetryAfterMs: 1_000,
    });
  });

  it("fails closed for an invalid present value at startup", () => {
    const { settingsPath, cache } = makeSettingsCache();
    writeAdmission(settingsPath, {
      maxActiveAgentSessions: -1,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
    });

    const resolved = cache.readHostResourceAdmission();
    expect(resolved.resolution).toEqual({
      kind: "unavailable",
      problem: "host-resource-admission-invalid",
    });
    expect(resolved.policy.refuseNewStarts).toBe("host-resource-admission-invalid");
  });

  it("fails closed for malformed JSON and non-object documents at startup", () => {
    const malformed = makeSettingsCache();
    writeFileAtomic(malformed.settingsPath, '{"hostResourceAdmission":', {
      encoding: "utf8",
      mode: 0o600,
    });
    expect(malformed.cache.readHostResourceAdmission().resolution).toEqual({
      kind: "unavailable",
      problem: "settings-document-unparseable",
    });

    const notObject = makeSettingsCache();
    writeFileAtomic(notObject.settingsPath, "42", { encoding: "utf8", mode: 0o600 });
    expect(notObject.cache.readHostResourceAdmission().resolution).toEqual({
      kind: "unavailable",
      problem: "settings-document-not-object",
    });
  });

  it("keeps a missing file as legacy transitional unlimited before any valid policy", () => {
    const { cache } = makeSettingsCache();
    const resolved = cache.readHostResourceAdmission();
    expect(resolved.resolution).toEqual({ kind: "missing" });
    expect(resolved.policy).toMatchObject({
      maxActiveAgentSessions: 0,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
    });
    expect(resolved.policy.refuseNewStarts).toBeUndefined();
  });

  it("latches the last known valid policy across an atomic invalid replacement", async () => {
    const { settingsPath, cache } = makeSettingsCache();
    writeAdmission(settingsPath, {
      maxActiveAgentSessions: 4,
      maxActiveTerminalShells: 2,
      maxActiveGenerationHelpers: 1,
    });
    expect(cache.readHostResourceAdmission().resolution).toEqual({ kind: "configured" });

    writeFileAtomic(settingsPath, "{not json", { encoding: "utf8", mode: 0o600 });
    await vi.waitFor(
      () =>
        expect(cache.readHostResourceAdmission().resolution).toEqual({
          kind: "retained",
          problem: "settings-document-unparseable",
        }),
      { timeout: 2_000 },
    );
    expect(cache.readHostResourceAdmission().policy).toMatchObject({
      maxActiveAgentSessions: 4,
      maxActiveTerminalShells: 2,
      maxActiveGenerationHelpers: 1,
    });

    // A later valid write recovers without a restart.
    writeAdmission(settingsPath, {
      maxActiveAgentSessions: 6,
      maxActiveTerminalShells: 2,
      maxActiveGenerationHelpers: 1,
    });
    await vi.waitFor(
      () => expect(cache.readHostResourceAdmission().policy.maxActiveAgentSessions).toBe(6),
      { timeout: 2_000 },
    );
  });

  it("keeps last known valid limits when the file is deleted and recreated", async () => {
    const { settingsPath, cache } = makeSettingsCache();
    writeAdmission(settingsPath, {
      maxActiveAgentSessions: 4,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
    });
    expect(cache.readHostResourceAdmission().resolution).toEqual({ kind: "configured" });

    unlinkSync(settingsPath);
    await vi.waitFor(
      () => expect(cache.readHostResourceAdmission().resolution).toEqual({ kind: "missing" }),
      { timeout: 2_000 },
    );
    expect(cache.readHostResourceAdmission().policy.maxActiveAgentSessions).toBe(4);

    writeAdmission(settingsPath, {
      maxActiveAgentSessions: 9,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
    });
    await vi.waitFor(
      () => expect(cache.readHostResourceAdmission().policy.maxActiveAgentSessions).toBe(9),
      { timeout: 2_000 },
    );
  });

  it("resets to transitional unlimited on an explicit field removal in a valid document", async () => {
    const { settingsPath, cache } = makeSettingsCache();
    writeAdmission(settingsPath, {
      maxActiveAgentSessions: 4,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
    });
    expect(cache.readHostResourceAdmission().policy.maxActiveAgentSessions).toBe(4);

    // A valid document that explicitly removes the whole field (a
    // hand-edited legacy shape); current writers always carry the object.
    const { hostResourceAdmission: _removed, ...withoutAdmission } = defaultSharedSettings;
    writeDocument(settingsPath, withoutAdmission);
    await vi.waitFor(
      () => expect(cache.readHostResourceAdmission().resolution).toEqual({ kind: "absent" }),
      { timeout: 2_000 },
    );
    const removed = cache.readHostResourceAdmission();
    expect(removed.policy).toMatchObject({ maxActiveAgentSessions: 0 });
    expect(removed.policy.refuseNewStarts).toBeUndefined();

    // Explicit removal is positive evidence: a later malformed document keeps
    // unlimited rather than failing closed.
    writeFileAtomic(settingsPath, "{not json", { encoding: "utf8", mode: 0o600 });
    await vi.waitFor(
      () =>
        expect(cache.readHostResourceAdmission().resolution).toEqual({
          kind: "retained",
          problem: "settings-document-unparseable",
        }),
      { timeout: 2_000 },
    );
    expect(cache.readHostResourceAdmission().policy.refuseNewStarts).toBeUndefined();
  });

  it("recovers after a watcher error event invalidates the cache", async () => {
    const { settingsPath, cache } = makeSettingsCache();
    writeDocument(settingsPath, { ...defaultSharedSettings, themeMode: "dark" });
    expect(cache.read().themeMode).toBe("dark");

    const watcher = vi.mocked(watch).mock.results.at(-1)?.value as FSWatcher;
    watcher.emit("error", new Error("watcher failed"));

    writeTheme(settingsPath, "light");
    expect(cache.read().themeMode).toBe("light");
  });

  it("keeps the legacy read helper's behavior for missing and malformed files", () => {
    const missingDir = mkdtempSync(join(tmpdir(), "poracode-admission-legacy-"));
    tempDirs.push(missingDir);
    const missingPath = join(missingDir, "settings.json");
    expect(readSupervisorSharedSettings(missingPath).themeMode).toBe(
      defaultSharedSettings.themeMode,
    );

    const { settingsPath } = makeSettingsCache();
    writeFileAtomic(settingsPath, "{not json", { encoding: "utf8", mode: 0o600 });
    expect(readSupervisorSharedSettings(settingsPath).themeMode).toBe(
      defaultSharedSettings.themeMode,
    );
  });
});
