import { describe, expect, it, vi } from "vitest";
import "@/renderer/components/providers/bootstrap";
import { resolveThreadMarkdownImageRoots, threadHostHomeDir } from "./threadMarkdownImageRoots";

vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ homeDir: "/home/me" }) }));

describe("thread markdown image roots", () => {
  it("offers this machine's home directory only to a thread whose host runs here", () => {
    expect(threadHostHomeDir({})).toBe("/home/me");
    expect(threadHostHomeDir({ remoteServerId: "desktop-1" })).toBeUndefined();
  });

  it("lets a provider resolve roots under the host's home, and none without one", () => {
    const input = {
      agentKind: "grok",
      sessionId: "session-1",
      projectLocation: { kind: "posix" as const, path: "/work/repo" },
    };
    expect(
      resolveThreadMarkdownImageRoots({ ...input, homeDir: threadHostHomeDir({}) }),
    ).toHaveLength(1);
    expect(
      resolveThreadMarkdownImageRoots({
        ...input,
        homeDir: threadHostHomeDir({ remoteServerId: "desktop-1" }),
      }),
    ).toBeUndefined();
  });
});
