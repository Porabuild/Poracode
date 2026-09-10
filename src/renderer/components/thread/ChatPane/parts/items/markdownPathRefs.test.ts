import { describe, expect, it } from "vitest";
import {
  AUTO_PATH_FILE_HREF_PREFIX,
  AUTO_PATH_FILE_PREFIX,
  AUTO_PATH_FOLDER_HREF_PREFIX,
  AUTO_PATH_FOLDER_PREFIX,
  parsePathRefUrl,
  pathRefUrl,
} from "./markdownPathRefs";
import type { ProjectPathRef } from "./parseProjectPathRef";

describe("markdown path references", () => {
  it.each<ProjectPathRef>([
    { kind: "file", path: "/tmp/report:2026" },
    { kind: "file", path: "/tmp/report:20-26" },
    {
      kind: "file",
      path: String.raw`C:\Reports\draft (final)?#100%:2026.txt`,
      line: 20,
      endLine: 26,
    },
    { kind: "folder", path: String.raw`C:\Reports\draft (final)?#100%` },
  ])("roundtrips the v2 format without changing the reference: %j", (ref) => {
    expect(parsePathRefUrl(pathRefUrl(ref))).toEqual(ref);
  });

  it("keeps the path opaque and metadata explicit", () => {
    expect(pathRefUrl({ kind: "file", path: "/tmp/report:2026" })).toBe(
      `${AUTO_PATH_FILE_HREF_PREFIX}v2/%2Ftmp%2Freport%3A2026`,
    );
    expect(pathRefUrl({ kind: "file", path: "/tmp/report:2026", line: 20, endLine: 26 })).toBe(
      `${AUTO_PATH_FILE_HREF_PREFIX}v2/%2Ftmp%2Freport%3A2026?line=20&endLine=26`,
    );
    expect(pathRefUrl({ kind: "folder", path: "/tmp/reports" })).toBe(
      `${AUTO_PATH_FOLDER_HREF_PREFIX}v2/%2Ftmp%2Freports`,
    );
  });

  it.each<[string, ProjectPathRef]>([
    [
      `${AUTO_PATH_FILE_HREF_PREFIX}src%2Fmain.ts%3A12-18`,
      { kind: "file", path: "src/main.ts", line: 12, endLine: 18 },
    ],
    [`${AUTO_PATH_FOLDER_HREF_PREFIX}src%2Fcomponents`, { kind: "folder", path: "src/components" }],
    [
      `${AUTO_PATH_FILE_PREFIX}src%2Fmain.ts%3A12-18`,
      { kind: "file", path: "src/main.ts", line: 12, endLine: 18 },
    ],
    [`${AUTO_PATH_FOLDER_PREFIX}src%2Fcomponents`, { kind: "folder", path: "src/components" }],
  ])("reads a legacy stored reference: %s", (href, ref) => {
    expect(parsePathRefUrl(href)).toEqual(ref);
  });

  it("rejects malformed and unsupported versioned references safely", () => {
    expect(parsePathRefUrl(`${AUTO_PATH_FILE_HREF_PREFIX}v3/%2Ftmp%2Freport.ts`)).toBeNull();
    expect(parsePathRefUrl(`${AUTO_PATH_FILE_HREF_PREFIX}v2/%E0%A4`)).toBeNull();
    expect(
      parsePathRefUrl(`${AUTO_PATH_FILE_HREF_PREFIX}v2/%2Ftmp%2Freport.ts?line=20&line=21`),
    ).toBeNull();
    expect(
      parsePathRefUrl(`${AUTO_PATH_FOLDER_HREF_PREFIX}v2/%2Ftmp%2Freports?line=20`),
    ).toBeNull();
    expect(parsePathRefUrl(`${AUTO_PATH_FILE_PREFIX}src%2Fbad%ZZ`)).toEqual({
      kind: "file",
      path: "src%2Fbad%ZZ",
    });
    expect(parsePathRefUrl(`${AUTO_PATH_FOLDER_HREF_PREFIX}src%2Fbad%ZZ`)).toEqual({
      kind: "folder",
      path: "src%2Fbad%ZZ",
    });
  });
});
