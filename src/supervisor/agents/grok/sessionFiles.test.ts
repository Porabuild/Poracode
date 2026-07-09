import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { grokSessionDirMaterialized, resolveGrokSessionArg } from "./sessionFiles";

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
});
