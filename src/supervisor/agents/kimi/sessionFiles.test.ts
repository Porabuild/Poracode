import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import {
  discoverKimiSessionRef,
  makeKimiWatchSessionRef,
  resolveKimiSessionDir,
  resolveKimiSessionsWatchPaths,
  snapshotKimiPreSpawnSessions,
} from "./sessionFiles";

describe("kimi session discovery (native)", () => {
  let kimiHome: string;
  let location: ProjectLocation;
  let previousKimiHome: string | undefined;

  const sessionDir = (workDir: string, sessionId: string) =>
    join(kimiHome, "sessions", workDir, sessionId);

  const makeSession = (workDir: string, sessionId: string, cwd?: string) => {
    const dir = sessionDir(workDir, sessionId);
    mkdirSync(dir, { recursive: true });
    if (cwd !== undefined) {
      writeFileSync(join(dir, "state.json"), JSON.stringify({ title: sessionId, cwd }));
    }
    return dir;
  };

  const windowsLocation = (path: string): ProjectLocation =>
    ({ kind: "windows", path }) as ProjectLocation;

  beforeEach(() => {
    kimiHome = mkdtempSync(join(tmpdir(), "kimi-home-"));
    previousKimiHome = process.env["KIMI_CODE_HOME"];
    process.env["KIMI_CODE_HOME"] = kimiHome;
    location = windowsLocation(join(tmpdir(), "kimi-proj"));
  });

  afterEach(() => {
    if (previousKimiHome === undefined) delete process.env["KIMI_CODE_HOME"];
    else process.env["KIMI_CODE_HOME"] = previousKimiHome;
    rmSync(kimiHome, { recursive: true, force: true });
  });

  it("returns undefined when no sessions exist", async () => {
    snapshotKimiPreSpawnSessions(location);
    expect(await discoverKimiSessionRef(location)).toBeUndefined();
  });

  it("discovers the session dir created after the pre-spawn snapshot", async () => {
    makeSession("workA", "old-session");
    snapshotKimiPreSpawnSessions(location);
    makeSession("workA", "new-session");

    const ref = await discoverKimiSessionRef(location);
    expect(ref?.providerSessionId).toBe("new-session");
  });

  it("scans across every workDirKey dir", async () => {
    snapshotKimiPreSpawnSessions(location);
    makeSession("workB", "fresh-session");

    const ref = await discoverKimiSessionRef(location);
    expect(ref?.providerSessionId).toBe("fresh-session");
  });

  it("resolves an ACP session id across opaque workDirKey dirs", async () => {
    const dir = makeSession("workB", "session-from-acp");
    expect(await resolveKimiSessionDir(location, "session-from-acp")).toBe(dir);
    expect(await resolveKimiSessionDir(location, "missing-session")).toBeUndefined();
  });

  it("disambiguates multiple new candidates by the state.json cwd", async () => {
    const projA = join(tmpdir(), "kimi-proj-a");
    const locationA = windowsLocation(projA);

    snapshotKimiPreSpawnSessions(locationA);
    // Two brand-new sessions appear post-snapshot; only one belongs to this cwd.
    makeSession("workA", "mine", projA);
    makeSession("workOther", "theirs", join(tmpdir(), "kimi-proj-other"));

    const ref = await discoverKimiSessionRef(locationA);
    expect(ref?.providerSessionId).toBe("mine");
  });

  it("keeps two concurrent snapshots from clobbering each other", async () => {
    const projA = join(tmpdir(), "kimi-proj-a");
    const projB = join(tmpdir(), "kimi-proj-b");
    const locationA = windowsLocation(projA);
    const locationB = windowsLocation(projB);

    // Pre-existing sessions for both projects.
    makeSession("workA", "pre-A", projA);
    makeSession("workB", "pre-B", projB);

    // Two concurrent launches snapshot back to back — B must not wipe A's set.
    snapshotKimiPreSpawnSessions(locationA);
    snapshotKimiPreSpawnSessions(locationB);

    // Each launch mints its own new session.
    makeSession("workA", "new-A", projA);
    makeSession("workB", "new-B", projB);

    expect((await discoverKimiSessionRef(locationA))?.providerSessionId).toBe("new-A");
    expect((await discoverKimiSessionRef(locationB))?.providerSessionId).toBe("new-B");
  });

  it("returns undefined and does not throw when the sessions root is missing", async () => {
    rmSync(kimiHome, { recursive: true, force: true });

    snapshotKimiPreSpawnSessions(location);
    expect(await discoverKimiSessionRef(location)).toBeUndefined();

    // The watcher must tolerate a fresh install with no `.kimi-code` dir yet.
    const watch = makeKimiWatchSessionRef();
    const stop = watch(location, () => undefined);
    expect(() => stop?.()).not.toThrow();
  });

  it("watches the sessions root and the kimi home", () => {
    const paths = resolveKimiSessionsWatchPaths(location);
    expect(paths).toContain(join(kimiHome, "sessions"));
    expect(paths).toContain(kimiHome);
  });
});
