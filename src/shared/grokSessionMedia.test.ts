import { describe, expect, it } from "vitest";
import { resolveGrokSessionDir } from "./grokSessionMedia";

describe("resolveGrokSessionDir", () => {
  it("builds the native Windows session directory under ~/.grok/sessions", () => {
    expect(
      resolveGrokSessionDir({
        projectLocation: {
          kind: "windows",
          path: "E:\\work\\lightcode\\.poracode\\worktrees\\poracode-warm-yak-d27ed350",
        },
        sessionId: "019f6789-4fd1-7740-a828-9a42918d42e8",
        homeDir: "C:\\Users\\sdsle",
      }),
    ).toBe(
      [
        "C:\\Users\\sdsle",
        ".grok",
        "sessions",
        "E%3A%5Cwork%5Clightcode%5C.poracode%5Cworktrees%5Cporacode-warm-yak-d27ed350",
        "019f6789-4fd1-7740-a828-9a42918d42e8",
      ].join("\\"),
    );
  });

  it("honors GROK_HOME override", () => {
    expect(
      resolveGrokSessionDir({
        projectLocation: { kind: "posix", path: "/repo" },
        sessionId: "abc",
        homeDir: "/Users/me",
        grokHome: "/custom/grok",
      }),
    ).toBe(`/custom/grok/sessions/${encodeURIComponent("/repo")}/abc`);
  });

  it("returns null for WSL projects (session files are not local)", () => {
    expect(
      resolveGrokSessionDir({
        projectLocation: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/repo",
          uncPath: "\\\\wsl$\\Ubuntu\\home\\me\\repo",
        },
        sessionId: "abc",
        homeDir: "C:\\Users\\me",
      }),
    ).toBeNull();
  });
});
