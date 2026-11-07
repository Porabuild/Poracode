import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import {
  discoverGrokSessionRef,
  grokSessionDirMaterialized,
  resolveGrokSessionArg,
  snapshotGrokPreSpawnSessions,
} from "./sessionFiles";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
}));

const SESSION_ID = "11111111-2222-4333-8444-555555555555";

describe("grok session materialization (native)", async () => {
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
    vi.restoreAllMocks();
    if (previousGrokHome === undefined) delete process.env["GROK_HOME"];
    else process.env["GROK_HOME"] = previousGrokHome;
    rmSync(grokHome, { recursive: true, force: true });
  });

  it("reports false for a session id that never materialized", async () => {
    expect(await grokSessionDirMaterialized(location, projectDir, SESSION_ID)).toBe(false);
  });

  it("retains the completed snapshot while another launch scans", async () => {
    mkdirSync(join(grokHome, "sessions", encodeURIComponent(projectDir), SESSION_ID), {
      recursive: true,
    });
    await snapshotGrokPreSpawnSessions(location, projectDir);
    const read = fsPromises.readdir;
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(fsPromises, "readdir").mockImplementationOnce(async (...args) => {
      entered();
      await blocked;
      return read(...args);
    });
    const pending = snapshotGrokPreSpawnSessions(location, projectDir);
    await started;
    try {
      expect(await discoverGrokSessionRef(location, projectDir)).toBeUndefined();
    } finally {
      release();
      await pending;
    }
  });

  it("reports true once grok wrote the session dir", async () => {
    mkdirSync(join(grokHome, "sessions", encodeURIComponent(projectDir), SESSION_ID), {
      recursive: true,
    });
    expect(await grokSessionDirMaterialized(location, projectDir, SESSION_ID)).toBe(true);
  });

  it("reports true after the project moves because UUID resumes are global", async () => {
    const originalProjectDir = join(tmpdir(), "grok-original-proj");
    mkdirSync(join(grokHome, "sessions", encodeURIComponent(originalProjectDir), SESSION_ID), {
      recursive: true,
    });

    expect(await grokSessionDirMaterialized(location, projectDir, SESSION_ID)).toBe(true);
    expect(await resolveGrokSessionArg(location, projectDir, SESSION_ID)).toEqual({
      kind: "resume",
      sessionId: SESSION_ID,
    });
  });

  it("resolveGrokSessionArg re-assigns unmaterialized ids with -s and resumes real ones with -r", async () => {
    expect(await resolveGrokSessionArg(location, projectDir, SESSION_ID)).toEqual({
      kind: "new",
      sessionId: SESSION_ID,
    });
    mkdirSync(join(grokHome, "sessions", encodeURIComponent(projectDir), SESSION_ID), {
      recursive: true,
    });
    expect(await resolveGrokSessionArg(location, projectDir, SESSION_ID)).toEqual({
      kind: "resume",
      sessionId: SESSION_ID,
    });
  });
});
