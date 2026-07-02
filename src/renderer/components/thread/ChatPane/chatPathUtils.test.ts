import { describe, expect, it } from "vitest";
import { normalizeChatProjectPath, toProjectRelativeDisplayPath } from "./chatPathUtils";

describe("normalizeChatProjectPath", () => {
  it("normalizes Windows project-absolute paths to project-relative paths", () => {
    expect(
      normalizeChatProjectPath("C:/repo/src/supervisor/agents/acp/session.ts:945", {
        kind: "windows",
        path: "C:\\repo",
      }),
    ).toBe("src/supervisor/agents/acp/session.ts:945");
  });

  it("normalizes POSIX project-absolute paths to project-relative paths", () => {
    expect(
      normalizeChatProjectPath("/home/me/repo/src/supervisor/agents/acp/session.ts:945", {
        kind: "posix",
        path: "/home/me/repo",
      }),
    ).toBe("src/supervisor/agents/acp/session.ts:945");
  });

  it("normalizes POSIX file URIs to project-relative paths", () => {
    expect(
      normalizeChatProjectPath("file:///home/me/repo/src/supervisor/agents/acp/session.ts:945", {
        kind: "posix",
        path: "/home/me/repo",
      }),
    ).toBe("src/supervisor/agents/acp/session.ts:945");
  });

  it("preserves out-of-project absolute POSIX paths for external-file editor routing", () => {
    expect(
      normalizeChatProjectPath("/etc/hosts", {
        kind: "posix",
        path: "/home/me/repo",
      }),
    ).toBe("/etc/hosts");
  });

  it("preserves out-of-project file URIs as absolute paths", () => {
    expect(
      normalizeChatProjectPath("file:///etc/hosts", {
        kind: "posix",
        path: "/home/me/repo",
      }),
    ).toBe("/etc/hosts");
  });

  it("normalizes WSL Linux paths to project-relative paths", () => {
    expect(
      normalizeChatProjectPath("/home/me/repo/src/supervisor/agents/acp/session.ts:945", {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/me/repo",
        uncPath: "\\\\wsl$\\Ubuntu\\home\\me\\repo",
      }),
    ).toBe("src/supervisor/agents/acp/session.ts:945");
  });

  it("normalizes WSL UNC paths to project-relative paths", () => {
    expect(
      normalizeChatProjectPath(
        "\\\\wsl$\\Ubuntu\\home\\me\\repo\\src\\supervisor\\agents\\acp\\session.ts:945",
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/repo",
          uncPath: "\\\\wsl$\\Ubuntu\\home\\me\\repo",
        },
      ),
    ).toBe("src/supervisor/agents/acp/session.ts:945");
  });
});

describe("toProjectRelativeDisplayPath", () => {
  it("relativizes a Windows worktree-absolute path to a project-relative path", () => {
    expect(
      toProjectRelativeDisplayPath(
        "C:\\Users\\me\\.poracode\\worktrees\\repo-abc\\src\\renderer\\App.tsx",
        { kind: "windows", path: "C:\\Users\\me\\.poracode\\worktrees\\repo-abc" },
      ),
    ).toBe("src/renderer/App.tsx");
  });

  it("relativizes a POSIX project-absolute path", () => {
    expect(
      toProjectRelativeDisplayPath("/home/me/repo/packages/agents-usage/src/types.ts", {
        kind: "posix",
        path: "/home/me/repo",
      }),
    ).toBe("packages/agents-usage/src/types.ts");
  });

  it("relativizes WSL Linux and UNC paths", () => {
    const location = {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/home/me/repo",
      uncPath: "\\\\wsl$\\Ubuntu\\home\\me\\repo",
    };
    expect(toProjectRelativeDisplayPath("/home/me/repo/src/main.ts", location)).toBe("src/main.ts");
    expect(
      toProjectRelativeDisplayPath("\\\\wsl$\\Ubuntu\\home\\me\\repo\\src\\main.ts", location),
    ).toBe("src/main.ts");
  });

  it("keeps out-of-root Windows paths absolute with their original separators", () => {
    const outside = "C:\\Users\\me\\other-project\\notes.md";
    expect(
      toProjectRelativeDisplayPath(outside, {
        kind: "windows",
        path: "C:\\Users\\me\\.poracode\\worktrees\\repo-abc",
      }),
    ).toBe(outside);
  });

  it("keeps out-of-root POSIX paths absolute", () => {
    expect(
      toProjectRelativeDisplayPath("/etc/hosts", { kind: "posix", path: "/home/me/repo" }),
    ).toBe("/etc/hosts");
  });

  it("passes already-relative paths through unchanged", () => {
    expect(
      toProjectRelativeDisplayPath("src/renderer/App.tsx", {
        kind: "windows",
        path: "C:\\Users\\me\\repo",
      }),
    ).toBe("src/renderer/App.tsx");
  });

  it('renders the working dir itself as "."', () => {
    expect(
      toProjectRelativeDisplayPath("C:\\Users\\me\\repo", {
        kind: "windows",
        path: "C:\\Users\\me\\repo",
      }),
    ).toBe(".");
  });
});
