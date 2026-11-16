import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, PromptSegment, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import type { PersistedRuntimeItem } from "@/shared/ipc";
import { RemoteClientError, type RemoteBoundedThreadHistoryResult } from "@/shared/remote/client";
import { useAppStore } from "@/renderer/state/appStore";
import {
  bridgeThreadInputSegments,
  remoteProjectId,
  remoteThreadId,
} from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  materializeCrossHostThreadMentions,
  parseProjectedRemoteThreadId,
} from "./crossHostThreadMention";

const mocks = vi.hoisted(() => ({
  entityHost:
    vi.fn<(entity: { id: string; remoteServerId?: string; remoteId?: string }) => unknown>(),
  remoteBridgeClient: null as {
    boundedThreadHistory: (threadId: string) => Promise<RemoteBoundedThreadHistoryResult>;
  } | null,
}));

vi.mock("@/renderer/state/entityHost", () => ({
  entityHost: mocks.entityHost,
}));
vi.mock("@/renderer/browser/remoteBridge", () => ({
  getRemoteBridgeClient: () => mocks.remoteBridgeClient,
}));
vi.mock("@/renderer/state/remote/historyNoticeCapability", () => ({
  hostSupportsRuntimeHistoryNoticesFor: () => false,
}));

const originalAppState = useAppStore.getState();

function makeThread(overrides: Partial<Thread> & { id: string }): Thread {
  return {
    projectId: HOME_PROJECT_ID,
    title: overrides.id,
    agentKind: "claude",
    config: { model: "sonnet" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-11-11T00:00:00.000Z",
    updatedAt: "2026-11-11T00:00:00.000Z",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> & { id: string }): Project {
  return {
    name: overrides.id,
    location: { kind: "windows", path: `C:\\${overrides.id}` },
    createdAt: "2026-11-11T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.entityHost.mockReset();
  mocks.remoteBridgeClient = null;
  useRemoteServersStore.setState({
    servers: [
      {
        connectionId: "env-mac",
        desktopId: "desktop-mac",
        label: "Poracode on MacBook",
        endpoint: "http://127.0.0.1:4100/api/environments/mac/proxy",
        accessToken: "token",
        scopes: ["session:read"],
        transport: {
          kind: "environment",
          environmentId: "mac",
          managedHostDesktopId: "local",
          childDesktopId: "desktop-mac",
        },
      },
    ],
  });
  useAppStore.setState({
    projects: [
      makeProject({ id: HOME_PROJECT_ID, name: HOME_PROJECT_NAME }),
      makeProject({
        id: remoteProjectId("env-mac", HOME_PROJECT_ID),
        name: HOME_PROJECT_NAME,
        remoteServerId: "env-mac",
        remoteId: HOME_PROJECT_ID,
        location: { kind: "posix", path: "/Users/me", remoteServerId: "env-mac" },
      }),
    ],
    threads: [],
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
  });
});

afterEach(() => {
  useRemoteServersStore.setState({ servers: [] });
  useAppStore.setState(originalAppState, true);
});

describe("crossHostThreadMention", () => {
  it("parses projected remote thread ids and ignores non-projected ids", () => {
    expect(parseProjectedRemoteThreadId("remote:env-mac:thread:t-5001")).toEqual({
      desktopId: "env-mac",
      remoteId: "t-5001",
    });
    expect(parseProjectedRemoteThreadId("local-thread")).toBeUndefined();
    expect(parseProjectedRemoteThreadId("remote::thread:t1")).toBeUndefined();
    expect(parseProjectedRemoteThreadId("remote:env-mac:thread:")).toBeUndefined();
  });

  it("leaves same-host mentions untouched for both local and remote environments", async () => {
    const uploadBytes = vi.fn<(fileName: string, data: Uint8Array) => Promise<string>>();
    const localTarget = makeThread({ id: "local-1" });
    const localSegments: PromptSegment[] = [
      { kind: "thread", threadId: "local-2", title: "Local sibling" },
    ];
    expect(
      await materializeCrossHostThreadMentions({
        target: localTarget,
        segments: localSegments,
        uploadBytes,
      }),
    ).toEqual(localSegments);

    const remoteTarget = makeThread({
      id: remoteThreadId("env-mac", "t1"),
      remoteServerId: "env-mac",
      remoteId: "t1",
    });
    const remoteSegments: PromptSegment[] = [
      { kind: "thread", threadId: remoteThreadId("env-mac", "t2"), title: "Mac sibling" },
    ];
    expect(
      await materializeCrossHostThreadMentions({
        target: remoteTarget,
        segments: remoteSegments,
        uploadBytes,
      }),
    ).toEqual(remoteSegments);
    expect(uploadBytes).not.toHaveBeenCalled();
  });

  it("fetches a remote environment thread's transcript once and attaches it on the target host", async () => {
    const remoteId = "lume-5001";
    const viewThreadId = remoteThreadId("env-mac", remoteId);
    const remoteRow = makeThread({
      id: viewThreadId,
      remoteServerId: "env-mac",
      remoteId,
      projectId: remoteProjectId("env-mac", HOME_PROJECT_ID),
      title: "PR #5001: Prepare macOS Lume certification",
      worktreeBranch: "cert/lume",
    });
    useAppStore.setState({ threads: [remoteRow] });

    const runtimeItems: PersistedRuntimeItem[] = [
      {
        id: "u1",
        type: "user_message",
        state: "completed",
        payload: {
          content: [{ kind: "text", text: "Prepare the macOS Lume certification steps" }],
        },
        streams: {},
      },
      {
        id: "a1",
        type: "assistant_message",
        state: "completed",
        payload: {
          content: [{ kind: "text", text: "Signed notarization check passed on MacBook." }],
        },
        streams: {},
      },
    ];
    const boundedThreadHistory = vi
      .fn<
        (
          threadId: string,
          options: Record<string, unknown>,
        ) => Promise<{
          negotiation: "bounded";
          page: { snapshotSeq: number; thread: Thread; runtimeItems: PersistedRuntimeItem[] };
        }>
      >()
      .mockResolvedValue({
        negotiation: "bounded",
        page: {
          snapshotSeq: 4,
          thread: { ...remoteRow, id: remoteId, projectId: HOME_PROJECT_ID },
          runtimeItems,
        },
      });
    mocks.entityHost.mockReturnValue({
      hostId: remoteId,
      withClient: (run: (client: unknown) => Promise<unknown>) => run({ boundedThreadHistory }),
      projectThread: () => remoteRow,
      projectRuntimeItems: (items: PersistedRuntimeItem[]) => items,
    });

    const uploaded: { fileName: string; content: string }[] = [];
    const uploadBytes = vi.fn<(fileName: string, data: Uint8Array) => Promise<string>>(
      async (fileName: string, data: Uint8Array) => {
        uploaded.push({ fileName, content: new TextDecoder().decode(data) });
        return `/local/attachments/${fileName}`;
      },
    );

    const localTarget = makeThread({ id: "local-cua" });
    const mention: PromptSegment = {
      kind: "thread",
      threadId: viewThreadId,
      title: "PR #5001: Prepare macOS Lume certification",
    };
    const result = await materializeCrossHostThreadMentions({
      target: localTarget,
      segments: [
        { kind: "text", content: "inspect " },
        mention,
        { kind: "text", content: " " },
        mention,
      ],
      uploadBytes,
    });

    expect(boundedThreadHistory).toHaveBeenCalledExactlyOnceWith(
      remoteId,
      expect.objectContaining({ targetTimelineEntryCount: 100, compactDetails: true }),
    );
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]?.fileName).toBe(
      "referenced-thread-pr-5001-prepare-macos-lume-certification-lume5001.md",
    );
    expect(uploaded[0]?.content).toContain(
      "# Referenced Poracode thread: PR #5001: Prepare macOS Lume certification",
    );
    expect(uploaded[0]?.content).toContain("Environment: MacBook");
    expect(uploaded[0]?.content).toContain("Branch: cert/lume");
    expect(uploaded[0]?.content).toContain("Prepare the macOS Lume certification steps");
    expect(uploaded[0]?.content).toContain("Signed notarization check passed on MacBook.");
    expect(result).toEqual([
      {
        kind: "attachment",
        path: "/local/attachments/referenced-thread-pr-5001-prepare-macos-lume-certification-lume5001.md",
        mimeType: "text/markdown",
      },
      { kind: "text", content: "inspect " },
      mention,
      { kind: "text", content: " " },
      mention,
    ]);
  });

  it("extracts ANSI-stripped terminal scrollback for terminal-mode remote threads", async () => {
    const remoteId = "pty-thread";
    const viewThreadId = remoteThreadId("env-mac", remoteId);
    const remoteRow = makeThread({
      id: viewThreadId,
      remoteServerId: "env-mac",
      remoteId,
      projectId: remoteProjectId("env-mac", HOME_PROJECT_ID),
      presentationMode: "terminal",
      title: "SSH build log",
    });
    mocks.entityHost.mockReturnValue({
      hostId: remoteId,
      withClient: (run: (client: unknown) => Promise<unknown>) =>
        run({
          boundedThreadHistory: async () => ({
            negotiation: "bounded",
            page: {
              snapshotSeq: 1,
              thread: { ...remoteRow, id: remoteId, projectId: HOME_PROJECT_ID },
              runtimeItems: [],
              terminalScrollback: "\u001b[32mBUILD SUCCEEDED\u001b[0m\r\n",
            },
          }),
        }),
      projectThread: () => remoteRow,
      projectRuntimeItems: () => [],
    });

    let markdown = "";
    await materializeCrossHostThreadMentions({
      target: makeThread({ id: "local-1" }),
      segments: [{ kind: "thread", threadId: viewThreadId, title: "SSH build log" }],
      uploadBytes: async (_name, data) => {
        markdown = new TextDecoder().decode(data);
        return "/local/attachments/ssh.md";
      },
    });
    expect(markdown).toContain("BUILD SUCCEEDED");
    expect(markdown).not.toContain("\u001b[32m");
  });

  it("falls back to resident cached items when offline and throws when unreachable without cache", async () => {
    const viewThreadId = remoteThreadId("env-mac", "cached-1");
    mocks.entityHost.mockReturnValue({
      hostId: "cached-1",
      withClient: async () => {
        throw new Error("offline");
      },
      projectThread: (thread: Thread) => thread,
      projectRuntimeItems: (items: PersistedRuntimeItem[]) => items,
    });

    await expect(
      materializeCrossHostThreadMentions({
        target: makeThread({ id: "local-1" }),
        segments: [{ kind: "thread", threadId: viewThreadId, title: "Uncached remote" }],
        uploadBytes: async () => "/unused.md",
      }),
    ).rejects.toThrow("The thread's host is not connected.");

    useAppStore.setState({
      runtimeItemIdsByThread: { [viewThreadId]: ["u1"] },
      runtimeItemsByIdByThread: {
        [viewThreadId]: {
          u1: {
            id: "u1",
            type: "user_message",
            state: "completed",
            payload: { content: [{ kind: "text", text: "Cached remote message" }] },
            streams: {},
          },
        },
      },
    });

    let uploadedText = "";
    const result = await materializeCrossHostThreadMentions({
      target: makeThread({ id: "local-1" }),
      segments: [{ kind: "thread", threadId: viewThreadId, title: "Cached remote" }],
      uploadBytes: async (_name, data) => {
        uploadedText = new TextDecoder().decode(data);
        return "/local/attachments/cached.md";
      },
    });
    expect(result[0]).toEqual({
      kind: "attachment",
      path: "/local/attachments/cached.md",
      mimeType: "text/markdown",
    });
    expect(uploadedText).toContain("Cached remote message");
    expect(uploadedText).toContain("transcript cached on this device");

    // A 30s AbortSignal.timeout normalizes to RemoteClientError 499 cancelled
    // and must also fall back to the resident cache with the cached-copy note.
    mocks.entityHost.mockReturnValue({
      hostId: "cached-1",
      withClient: async () => {
        throw new RemoteClientError("Remote request was cancelled.", 499, "cancelled");
      },
      projectThread: (thread: Thread) => thread,
      projectRuntimeItems: (items: PersistedRuntimeItem[]) => items,
    });
    let timeoutText = "";
    await materializeCrossHostThreadMentions({
      target: makeThread({ id: "local-1" }),
      segments: [{ kind: "thread", threadId: viewThreadId, title: "Cached remote" }],
      uploadBytes: async (_name, data) => {
        timeoutText = new TextDecoder().decode(data);
        return "/local/attachments/cached-timeout.md";
      },
    });
    expect(timeoutText).toContain("Cached remote message");
    expect(timeoutText).toContain("transcript cached on this device");

    // An answered 404/409 refusal must not silently upload stale resident cache.
    mocks.entityHost.mockReturnValue({
      hostId: "cached-1",
      withClient: async () => {
        throw new RemoteClientError("Thread was deleted on host.", 404, "not_found");
      },
      projectThread: (thread: Thread) => thread,
      projectRuntimeItems: (items: PersistedRuntimeItem[]) => items,
    });
    await expect(
      materializeCrossHostThreadMentions({
        target: makeThread({ id: "local-1" }),
        segments: [{ kind: "thread", threadId: viewThreadId, title: "Cached remote" }],
        uploadBytes: async () => "/unused.md",
      }),
    ).rejects.toThrow("Thread was deleted on host.");
  });

  it("degrades projected mention segments for local/browser targets while keeping projected targets intact", () => {
    const segments: PromptSegment[] = [
      { kind: "attachment", path: "/local/attachments/ref.md", mimeType: "text/markdown" },
      { kind: "thread", threadId: "local-sibling", title: "Local sibling" },
      { kind: "thread", threadId: remoteThreadId("env-mac", "5001"), title: "PR #5001" },
    ];
    expect(bridgeThreadInputSegments({ id: "local-1" }, segments)).toEqual([
      { kind: "attachment", path: "/local/attachments/ref.md", mimeType: "text/markdown" },
      { kind: "thread", threadId: "local-sibling", title: "Local sibling" },
      { kind: "text", content: "@PR #5001" },
    ]);
    expect(
      bridgeThreadInputSegments(
        { id: remoteThreadId("env-mac", "t1"), remoteServerId: "env-mac" },
        segments,
      ),
    ).toBe(segments);
  });
});
