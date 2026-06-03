import { describe, expect, it } from "vitest";
import {
  isAntigravityRoot,
  parseLsof,
  parsePortLines,
  type ProcInfo,
  resolveTargets,
} from "./antigravityProcessScan";

function proc(pid: number, ppid: number, haystack: string, csrf?: string): ProcInfo {
  return { pid, ppid, haystack: haystack.toLowerCase(), csrf };
}

describe("isAntigravityRoot", () => {
  it("matches agy, language_server, and antigravity-branded processes", () => {
    expect(isAntigravityRoot(proc(1, 0, "c:/users/x/agy.exe --serve"))).toBe(true);
    expect(isAntigravityRoot(proc(1, 0, "/opt/antigravity/language_server"))).toBe(true);
    expect(isAntigravityRoot(proc(1, 0, "antigravity helper"))).toBe(true);
  });

  it("does not match unrelated processes (a bare csrf flag is not enough)", () => {
    expect(isAntigravityRoot(proc(1, 0, "node server.js"))).toBe(false);
    expect(isAntigravityRoot(proc(1, 0, "windsurf --csrf_token=abc", "abc"))).toBe(false);
  });
});

describe("resolveTargets", () => {
  it("collects a matched root, all descendants, and CSRF tokens; skips unrelated trees", () => {
    const procs = [
      proc(1, 0, "agy.exe serve", "tok-a"),
      proc(2, 1, "agy child"),
      proc(3, 2, "agy grandchild", "tok-b"),
      proc(9, 0, "unrelated daemon", "tok-x"),
    ];
    const { pids, csrfTokens } = resolveTargets(procs);
    expect([...pids].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(csrfTokens.sort()).toEqual(["tok-a", "tok-b"]);
  });
});

describe("parsePortLines", () => {
  it("parses `<pid> <port>` lines and rejects invalid ones", () => {
    expect(parsePortLines("1234 51000\n9999 8080\ngarbage\n0 80\n1 99999")).toEqual([
      { pid: 1234, port: 51000 },
      { pid: 9999, port: 8080 },
    ]);
  });
});

describe("parseLsof", () => {
  it("pairs p<pid> records with the following n<addr:port> records", () => {
    expect(parseLsof("p1234\nn127.0.0.1:51000\np9999\nn[::1]:8080")).toEqual([
      { pid: 1234, port: 51000 },
      { pid: 9999, port: 8080 },
    ]);
  });
});
