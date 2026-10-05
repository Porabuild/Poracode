import {
  activationForClient,
  backendResetListeners,
  createImageActivation,
  createObjectUrl,
  emitManagedBackendReset,
  imageBytes,
  installManagedImageRuntime,
  publishImageActivation,
  revokeObjectUrl,
  setupManagedImageFixture,
  teardownManagedImageFixture,
} from "./managedLoopbackImages.testFixtures";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient, type RemoteFetch } from "@/shared/remote/client";
import type { RemoteEnvironmentImageBytes } from "@/shared/remote/clientEnvironmentImages";
import { remoteImageRefPath, type RemoteImageRefValue } from "@/shared/remote/imageRef";
import { resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { failManagedParentAuthority } from "./remoteServers/managedLoopbackOwner";
import {
  installManagedLoopbackImages,
  readManagedLoopbackImageSession,
  subscribeManagedLoopbackImages,
  useManagedLoopbackImageSession,
} from "./managedLoopbackImages";

const ref: RemoteImageRefValue = {
  threadId: "managed-thread",
  itemId: "managed-image",
  path: ["images", 0],
  mime: "image/png",
  bytes: 4,
};

beforeEach(setupManagedImageFixture);
afterEach(teardownManagedImageFixture);

describe("managed loopback image custody", () => {
  it("installs an already-live activation once with pure, stable snapshots and keyed deduplication", async () => {
    const activation = createImageActivation();
    publishImageActivation(activation);
    expect(readManagedLoopbackImageSession()).toBeNull();
    const host = installManagedImageRuntime();
    const session = readManagedLoopbackImageSession()!;
    installManagedLoopbackImages(host);
    expect(readManagedLoopbackImageSession()).toBe(session);
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(session.readiness)).toBe(true);
    for (let index = 0; index < 10; index += 1) {
      expect(readManagedLoopbackImageSession()).toBe(session);
      expect(session.readiness.resolveRef(ref)).toBe("");
      expect(session.readiness.resolvePath("/tmp/image.png")).toBe("");
    }
    expect(activation.client.fetchTicketedImageBytes).not.toHaveBeenCalled();
    expect(createObjectUrl).not.toHaveBeenCalled();
    const listener = vi.fn<() => void>();
    const unsubscribe = session.readiness.subscribeRef(ref, listener);
    session.readiness.requestRef(ref);
    session.readiness.requestRef({ ...ref });
    session.readiness.requestPath("/tmp/image.png");
    session.readiness.requestPath("/tmp/image.png");
    expect(activation.client.fetchTicketedImageBytes).toHaveBeenCalledTimes(2);
    expect(activation.client.fetchTicketedImageBytes).toHaveBeenCalledWith(
      remoteImageRefPath(ref),
      expect.any(AbortSignal),
    );
    await waitFor(() => expect(session.readiness.resolveRef(ref)).toBe("blob:managed-image-1"));
    expect(listener).toHaveBeenCalledOnce();
    expect(session.readiness.resolvePath("/tmp/image.png")).toBe("blob:managed-image-2");
    unsubscribe();
    failManagedParentAuthority("descriptor unavailable");
    expect(readManagedLoopbackImageSession()).toBe(session);
    expect(session.readiness.resolveRef(ref)).toBe("blob:managed-image-1");
  });

  it("preserves readiness, listeners and bytes through same-client credential rotation", async () => {
    const ticketAuthorizations: Array<string | null> = [];
    const fetch = vi.fn<RemoteFetch>((url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/oauth/token") {
        return Promise.resolve(
          Response.json({
            accessToken: "rotated-access",
            refreshToken: "rotated-refresh",
            tokenType: "Bearer",
            scopes: ["session:read"],
            expiresAt: "2030-01-01",
          }),
        );
      }
      if (path === "/api/files/image-ticket") {
        ticketAuthorizations.push(new Headers(init?.headers).get("authorization"));
        return Promise.resolve(
          Response.json({ ticket: "lc_img_fixture", expiresAt: "2030-01-01" }),
        );
      }
      return Promise.resolve(
        new Response(imageBytes.bytes.slice().buffer, { headers: { "content-type": "image/png" } }),
      );
    });
    const client = new RemoteDesktopClient("http://127.0.0.1:49152/", "initial-access", fetch, {
      tokenLifecycle: { refreshToken: () => "initial-refresh", onTokensRefreshed: () => undefined },
    });
    const activation = activationForClient(client);
    publishImageActivation(activation);
    installManagedImageRuntime();
    const session = readManagedLoopbackImageSession()!;
    const listener = vi.fn<() => void>();
    const unsubscribe = session.readiness.subscribeRef(ref, listener);
    session.readiness.requestRef(ref);
    await waitFor(() => expect(session.readiness.resolveRef(ref)).toBe("blob:managed-image-1"));
    await client.refreshTokens();
    publishImageActivation(activation);
    expect(readManagedLoopbackImageSession()).toBe(session);
    session.readiness.requestRef(ref);
    session.readiness.requestRef({ ...ref, itemId: "second-image" });
    await waitFor(() => expect(createObjectUrl).toHaveBeenCalledTimes(2));
    expect(ticketAuthorizations).toEqual(["Bearer initial-access", "Bearer rotated-access"]);
    expect(listener).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("rebinds a mounted consumer on late activation and fences a same-port pending predecessor", async () => {
    installManagedImageRuntime();
    const { result } = renderHook(useManagedLoopbackImageSession);
    expect(result.current).toBeNull();
    const held = Promise.withResolvers<RemoteEnvironmentImageBytes>();
    const predecessor = createImageActivation(() => held.promise);
    act(() => publishImageActivation(predecessor));
    const previous = result.current!;
    previous.readiness.requestRef(ref);
    const signal = vi.mocked(predecessor.client.fetchTicketedImageBytes).mock.calls[0]![1];
    const successor = createImageActivation();
    expect(successor.endpoint).toBe(predecessor.endpoint);
    act(() => publishImageActivation(successor));
    expect(signal.aborted).toBe(true);
    expect(result.current).not.toBe(previous);
    result.current!.readiness.requestRef(ref);
    held.resolve(imageBytes);
    await waitFor(() =>
      expect(result.current!.readiness.resolveRef(ref)).toBe("blob:managed-image-1"),
    );
    expect(previous.readiness.resolveRef(ref)).toBe("");
    expect(createObjectUrl).toHaveBeenCalledOnce();
    act(() => publishImageActivation(null));
    expect(result.current).toBeNull();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:managed-image-1");
  });

  it("resets the image epoch without a socket reopen and keeps the same authenticated routing client", async () => {
    const held = Promise.withResolvers<RemoteEnvironmentImageBytes>();
    const activation = createImageActivation();
    vi.mocked(activation.client.fetchTicketedImageBytes).mockImplementationOnce(() => held.promise);
    publishImageActivation(activation);
    installManagedImageRuntime();
    const previous = readManagedLoopbackImageSession()!;
    previous.readiness.requestRef(ref);
    const signal = vi.mocked(activation.client.fetchTicketedImageBytes).mock.calls[0]![1];
    const changed = vi.fn<() => void>();
    const unsubscribe = subscribeManagedLoopbackImages(changed);
    emitManagedBackendReset();
    const replacement = readManagedLoopbackImageSession()!;
    expect(replacement).not.toBe(previous);
    expect(signal.aborted).toBe(true);
    expect(changed).toHaveBeenCalled();
    replacement.readiness.requestRef(ref);
    held.resolve(imageBytes);
    await waitFor(() => expect(replacement.readiness.resolveRef(ref)).toBe("blob:managed-image-1"));
    expect(activation.client.fetchTicketedImageBytes).toHaveBeenCalledTimes(2);
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(previous.readiness.resolveRef(ref)).toBe("");
    unsubscribe();
  });

  it.each(["runtime-first", "activation-first"])(
    "cleans up in %s teardown order",
    async (order) => {
      const activation = createImageActivation();
      publishImageActivation(activation);
      installManagedImageRuntime();
      const previous = readManagedLoopbackImageSession()!;
      previous.readiness.requestRef(ref);
      await waitFor(() => expect(createObjectUrl).toHaveBeenCalledOnce());
      const listenerCount = backendResetListeners.size;
      if (order === "runtime-first") {
        resetClientRuntimeForTest();
        publishImageActivation(null);
      } else {
        publishImageActivation(null);
        resetClientRuntimeForTest();
      }
      expect(readManagedLoopbackImageSession()).toBeNull();
      expect(previous.readiness.resolveRef(ref)).toBe("");
      expect(revokeObjectUrl).toHaveBeenCalledOnce();
      expect(backendResetListeners.size).toBe(listenerCount - 1);
      publishImageActivation(createImageActivation());
      expect(readManagedLoopbackImageSession()).toBeNull();
    },
  );
});
