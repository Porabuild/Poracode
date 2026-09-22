import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { environmentImageRefKey } from "@/shared/remote/clientEnvironmentImages";
import { remoteImageRef } from "@/shared/remote/imageRef";
import type { RemoteImageRefValue } from "@/shared/remote";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteTokenLifecycle, RemoteTokenSnapshot } from "@/shared/remote/clientTypes";
import type { RemoteEnvironmentClient } from "@/shared/remote/clientEnvironments";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import {
  closeImageLightbox,
  ImageLightboxHost,
} from "@/renderer/components/composer/ImageLightbox";
import { ThreadImagesDock } from "@/renderer/components/thread/ThreadImagesDock";
import { useThreadGalleryImages } from "@/renderer/components/thread/useThreadGalleryImages";
import { useRemoteImageRefUrl } from "./useRemoteImageReadiness";
import {
  __resetEnvironmentSessionDependenciesForTest,
  __resetEnvironmentSessionsForTest,
  configureEnvironmentSessions,
  environmentImageReadinessFor,
  environmentSessionForServer,
  type EnvironmentClientSession,
} from "./environmentSessions";
import { __resetRemoteServersStoreForTest, useRemoteServersStore } from "../remoteServersStore";
import type { RemoteServerRecord } from "./types";

const PARENT_KEY = "conn-parent";
const ENV_KEY = "conn-child";
const CHILD_DESKTOP = "child-desktop";
const THREAD_ID = "thread-1";
const HOST_REF: RemoteImageRefValue = {
  threadId: THREAD_ID,
  itemId: "item-host",
  path: ["images", 0],
  mime: "image/png",
  bytes: 1,
  width: 8,
  height: 8,
};
const HOST_KEY = environmentImageRefKey(HOST_REF);
const INLINE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function parentRecord(): RemoteServerRecord {
  return {
    connectionId: PARENT_KEY,
    desktopId: "parent-desktop",
    label: "Parent",
    endpoint: "http://127.0.0.1:49153/",
    accessToken: "parent-access",
    scopes: ["session:read"],
    transport: { kind: "direct" },
  } as RemoteServerRecord;
}

function environmentRecord(overrides: Partial<RemoteServerRecord> = {}): RemoteServerRecord {
  return {
    connectionId: ENV_KEY,
    desktopId: CHILD_DESKTOP,
    label: "Child",
    endpoint: "http://127.0.0.1:49153/api/environments/x/proxy/",
    accessToken: "child-access",
    scopes: ["session:read"],
    transport: {
      kind: "environment",
      parentConnectionId: PARENT_KEY,
      environmentId: "11111111-1111-4111-8111-111111111111",
      childDesktopId: CHILD_DESKTOP,
    },
    ...overrides,
  } as RemoteServerRecord;
}

interface FakeEnvironmentClient {
  readonly urls: Map<string, string>;
  readonly listeners: Map<string, Set<() => void>>;
  readonly requested: Set<string>;
  disposed: boolean;
  client: RemoteEnvironmentClient;
}

function fakeEnvironmentClient(): FakeEnvironmentClient {
  const state: FakeEnvironmentClient = {
    urls: new Map(),
    listeners: new Map(),
    requested: new Set(),
    disposed: false,
    client: null as unknown as RemoteEnvironmentClient,
  };
  const resolution = (key: string) => ({
    key,
    url: state.urls.get(key) ?? "",
    pending: !state.urls.has(key),
  });
  const client = {
    setTokenLifecycle: () => undefined,
    dispose: () => {
      state.disposed = true;
      state.listeners.clear();
    },
    imageResolutionFor: (key: string) => resolution(key),
    imageRefResolution: (ref: RemoteImageRefValue) => {
      state.requested.add(environmentImageRefKey(ref));
      return resolution(environmentImageRefKey(ref));
    },
    localImageResolution: (path: string) => {
      state.requested.add(path);
      return resolution(path);
    },
    imageRefUrl: (ref: RemoteImageRefValue) => state.urls.get(environmentImageRefKey(ref)) ?? "",
    localImageUrl: (path: string) => state.urls.get(path) ?? "",
    subscribeImageKey: (key: string, listener: () => void) => {
      let listeners = state.listeners.get(key);
      if (!listeners) {
        listeners = new Set();
        state.listeners.set(key, listeners);
      }
      listeners.add(listener);
      return () => {
        state.listeners.get(key)?.delete(listener);
      };
    },
  } as unknown as RemoteEnvironmentClient;
  state.client = client;
  return state;
}

function fakeParentClient(): RemoteDesktopClient {
  let lifecycle: RemoteTokenLifecycle | null = null;
  return {
    setTokenLifecycle: (next: RemoteTokenLifecycle) => {
      lifecycle = next;
    },
    setCertFingerprintPin: () => undefined,
    refreshTokens: async () => {
      const snapshot: RemoteTokenSnapshot = { accessToken: "parent-rotated", refreshToken: "r2" };
      lifecycle?.onTokensRefreshed(snapshot);
      return snapshot;
    },
    environmentWebSocketTicket: async () => ({ ticket: "t", expiresAt: "" }),
  } as unknown as RemoteDesktopClient;
}

function TranscriptProbe() {
  const readiness = environmentImageReadinessFor(ENV_KEY);
  const url = useRemoteImageRefUrl(HOST_REF, readiness);
  return <span data-testid="transcript-url">{url}</span>;
}

function GalleryProbe() {
  const gallery = useThreadGalleryImages(THREAD_ID);
  return (
    <>
      <span data-testid="gallery-count">{gallery.length}</span>
      <ThreadImagesDock gallery={gallery} threadId={THREAD_ID} />
      <ImageLightboxHost />
    </>
  );
}

function seedThread() {
  const thread = {
    id: THREAD_ID,
    projectId: "project-1",
    title: "Remote thread",
    agentKind: "claude",
    config: {},
    status: "idle",
    remoteId: "rt-1",
    remoteServerId: ENV_KEY,
  } as unknown as Thread;
  useAppStore.setState({
    threads: [thread],
    projects: [
      {
        id: "project-1",
        name: "Repo",
        location: { kind: "posix", path: "/r" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    runtimeItemIdsByThread: { [THREAD_ID]: ["item-inline", "item-host"] },
    runtimeItemsByIdByThread: {
      [THREAD_ID]: {
        "item-inline": {
          id: "item-inline",
          type: "assistant_message",
          state: "completed",
          payload: {
            content: [{ kind: "image", dataUrl: INLINE_PNG, name: "inline.png" }],
          },
          streams: {},
        },
        "item-host": {
          id: "item-host",
          type: "assistant_message",
          state: "completed",
          payload: {
            content: [
              {
                kind: "image",
                dataUrl: remoteImageRef(HOST_REF),
                name: "host.png",
              },
            ],
          },
          streams: {},
        },
      },
    },
    runtimeStructuralVersionByThread: { [THREAD_ID]: 1 },
  } as never);
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("environment image consumers through rebuilds (C1 F6/R3)", () => {
  let created: FakeEnvironmentClient[];
  let session: EnvironmentClientSession | undefined;

  beforeEach(() => {
    created = [];
    __resetRemoteServersStoreForTest();
    useRemoteServersStore.setState({
      servers: [parentRecord(), environmentRecord()],
    });
    configureEnvironmentSessions({
      getState: () => useRemoteServersStore.getState(),
      clientFactory: () => () => fakeParentClient(),
      certPinForConnection: () => undefined,
      refreshTokenForSubject: () => undefined,
      rememberRefreshToken: () => undefined,
      writeRefreshTokenToVault: async () => true,
      deleteRefreshTokenFromVault: async () => undefined,
      createEnvironmentClient: () => {
        const fake = fakeEnvironmentClient();
        created.push(fake);
        return fake.client;
      },
    });
    seedThread();
  });

  afterEach(() => {
    closeImageLightbox();
    __resetRemoteServersStoreForTest();
    __resetEnvironmentSessionDependenciesForTest();
    __resetEnvironmentSessionsForTest();
    useAppStore.setState({
      threads: [],
      projects: [],
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeStructuralVersionByThread: {},
    } as never);
  });

  it("keeps mounted transcript and gallery subscriptions through a parent rotation, rebinds them on a real rebuild, and updates the open lightbox", async () => {
    render(
      <>
        <TranscriptProbe />
        <GalleryProbe />
      </>,
    );
    await flush();

    expect(created).toHaveLength(1);
    expect(created[0]!.listeners.get(HOST_KEY)?.size).toBe(2);
    expect(created[0]!.requested.has(HOST_KEY)).toBe(true);

    // 1. Parent-token rotation: no child rebuild, listeners intact.
    session = environmentSessionForServer(environmentRecord());
    await act(async () => {
      await session!.parentAuthority.ensureLive();
    });
    expect(created).toHaveLength(1);
    expect(created[0]!.disposed).toBe(false);
    expect(created[0]!.listeners.get(HOST_KEY)?.size).toBe(2);

    // 2. Real rebuild (child bearer changed): both mounted consumers rebind.
    await act(async () => {
      useRemoteServersStore.setState({
        servers: [parentRecord(), environmentRecord({ accessToken: "child-repaired" })],
      });
    });
    await flush();
    expect(created).toHaveLength(2);
    expect(created[0]!.disposed).toBe(true);
    expect(created[1]!.listeners.get(HOST_KEY)?.size).toBe(2);
    expect(created[1]!.requested.has(HOST_KEY)).toBe(true);

    // 3. The gallery panel still offers its resolved image; open the lightbox
    // while the host-held image is pending.
    expect(screen.getByTestId("gallery-count").textContent).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: /Open image 1 of 1/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    // 4. The host-held blob lands on the replacement client.
    await act(async () => {
      created[1]!.urls.set(HOST_KEY, "blob:repair");
      for (const listener of created[1]!.listeners.get(HOST_KEY) ?? []) listener();
    });
    await flush();

    expect(screen.getByTestId("transcript-url").textContent).toBe("blob:repair");
    expect(screen.getByTestId("gallery-count").textContent).toBe("2");
    // The open lightbox received the resolved image: navigating reaches it.
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("host.png");
  });
});
