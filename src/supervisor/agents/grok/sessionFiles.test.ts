import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import {
  createGrokSessionTracker,
  discoverGrokSessionRef,
  grokSessionDirMaterialized,
  resolveGrokSessionArg,
  snapshotGrokPreSpawnSessions,
} from "./sessionFiles";

const SESSION_ID = "11111111-2222-4333-8444-555555555555";

describe("grok session materialization (native)", () => {
  let grokHome: string;
  let projectDir: string;
  let location: ProjectLocation;
  let previousGrokHome: string | undefined;

  beforeEach(() => {
    grokHome = mkdtempSync(join(tmpdir(), "grok-home-"));
    projectDir = join(tmpdir(), "grok-proj");
    previousGrokHome = process.env["GROK_HOME"];
    process.env["GROK_HOME"] = grokHome;
    location = { kind: "windows", path: projectDir } as ProjectLocation;
  });

  afterEach(() => {
    if (previousGrokHome === undefined) delete process.env["GROK_HOME"];
    else process.env["GROK_HOME"] = previousGrokHome;
    rmSync(grokHome, { recursive: true, force: true });
  });

  it("reports false for a session id that never materialized", () => {
    expect(grokSessionDirMaterialized(location, projectDir, SESSION_ID)).toBe(false);
  });

  it("reports true once grok wrote the session dir", () => {
    mkdirSync(join(grokHome, "sessions", encodeURIComponent(projectDir), SESSION_ID), {
      recursive: true,
    });
    expect(grokSessionDirMaterialized(location, projectDir, SESSION_ID)).toBe(true);
  });

  it("resolveGrokSessionArg re-assigns unmaterialized ids with -s and resumes real ones with -r", () => {
    expect(resolveGrokSessionArg(location, projectDir, SESSION_ID)).toEqual({
      kind: "new",
      sessionId: SESSION_ID,
    });
    mkdirSync(join(grokHome, "sessions", encodeURIComponent(projectDir), SESSION_ID), {
      recursive: true,
    });
    expect(resolveGrokSessionArg(location, projectDir, SESSION_ID)).toEqual({
      kind: "resume",
      sessionId: SESSION_ID,
    });
  });

  it("uses an explicit profile home instead of the process-wide GROK_HOME", () => {
    const profileHome = mkdtempSync(join(tmpdir(), "grok-profile-home-"));
    try {
      mkdirSync(join(profileHome, "sessions", encodeURIComponent(projectDir), SESSION_ID), {
        recursive: true,
      });
      expect(grokSessionDirMaterialized(location, projectDir, SESSION_ID, profileHome)).toBe(true);
      expect(resolveGrokSessionArg(location, projectDir, SESSION_ID, profileHome)).toEqual({
        kind: "resume",
        sessionId: SESSION_ID,
      });
    } finally {
      rmSync(profileHome, { recursive: true, force: true });
    }
  });

  it("keeps pre-spawn snapshots isolated between adapter trackers", async () => {
    const profileHome = mkdtempSync(join(tmpdir(), "grok-profile-home-"));
    const sessionsDir = join(profileHome, "sessions", encodeURIComponent(projectDir));
    const oldSession = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const newSession = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const firstTracker = createGrokSessionTracker();
    const secondTracker = createGrokSessionTracker();
    try {
      mkdirSync(join(sessionsDir, oldSession), { recursive: true });
      snapshotGrokPreSpawnSessions(location, projectDir, profileHome, firstTracker);
      mkdirSync(join(sessionsDir, newSession), { recursive: true });
      snapshotGrokPreSpawnSessions(location, projectDir, profileHome, secondTracker);

      await expect(
        discoverGrokSessionRef(location, projectDir, profileHome, firstTracker),
      ).resolves.toMatchObject({ providerSessionId: newSession });
      await expect(
        discoverGrokSessionRef(location, projectDir, profileHome, secondTracker),
      ).resolves.toBeUndefined();
    } finally {
      rmSync(profileHome, { recursive: true, force: true });
    }
  });
});
