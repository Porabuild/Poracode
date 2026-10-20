import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PoracodeBridge } from "@/shared/ipc";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { RemoteClientError } from "@/shared/remote/clientErrors";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import {
  __resetBrowserBridgeForTest,
  browserBridgeOwnerKey,
} from "@/renderer/state/remoteServers/browserBridge";
import {
  readBrowserReviewCache,
  writeBrowserReviewCache,
  resetBrowserReviewCacheForTest,
  callBrowserReviewProcedure,
} from "./offlineReviewCache";

const initial = useRemoteServersStore.getState();
const server: RemoteServerRecord = {
  connectionId: "connection-a",
  desktopId: "desktop-a",
  endpoint: "https://desktop.example/prefix/",
  label: "Desktop",
  accessToken: "test-token",
  scopes: ["session:read", "session:operate"],
};
const input = {
  projectLocation: { kind: "posix", path: "/repo" },
  prNumber: 7,
  forgeAccount: { forge: "gitlab", host: "https://git.example", login: "alice" },
  forgeRepository: "team/app",
};
const marks = { storage: "host", files: [] };
const schema = z.object({ value: z.string() });

function online(value: boolean) {
  useRemoteServersStore.setState({
    runtime: {
      "connection-a": { status: value ? "online" : "offline", projects: [], threads: [] },
    },
  });
}
function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("poracode-review-cache");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
beforeEach(() => {
  __resetBrowserBridgeForTest();
  window.poracode = {} as PoracodeBridge;
  installBrowserClientRuntime(window.poracode);
  useRemoteServersStore.setState({ servers: [server] });
  window.localStorage.setItem(
    "poracode.browser.review-owner.v1",
    JSON.stringify([1, "connection-a", server.desktopId, server.endpoint]),
  );
  online(true);
});
afterEach(async () => {
  await resetBrowserReviewCacheForTest();
  await deleteDatabase();
  __resetBrowserBridgeForTest();
  useRemoteServersStore.setState(initial, true);
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
});

it("reopens a validated snapshot after restart and rejects malformed cached data", async () => {
  expect(await readBrowserReviewCache("first-release", schema)).toBeUndefined();
  await writeBrowserReviewCache("owner-a", { value: "cached" });
  await resetBrowserReviewCacheForTest();
  expect(await readBrowserReviewCache("owner-a", schema)).toEqual({ value: "cached" });
  expect(await readBrowserReviewCache("owner-b", schema)).toBeUndefined();
  await writeBrowserReviewCache("bad", { value: 7 });
  expect(await readBrowserReviewCache("bad", schema)).toBeUndefined();
});

it("serves cached reads while offline and sends no writes or account-mismatched reads", async () => {
  const call = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>().mockResolvedValue(marks);
  const client = { callRemoteProcedure: call } as unknown as RemoteDesktopClient;
  const owner = browserBridgeOwnerKey(server);
  await callBrowserReviewProcedure(client, "forgeGetPrViewedFiles", input, owner);
  online(false);
  expect(await callBrowserReviewProcedure(client, "forgeGetPrViewedFiles", input, owner)).toEqual(
    marks,
  );
  await expect(
    callBrowserReviewProcedure(
      client,
      "forgeGetPrViewedFiles",
      { ...input, forgeAccount: { ...input.forgeAccount, login: "bob" } },
      owner,
    ),
  ).rejects.toMatchObject({ code: "offline" });
  await expect(
    callBrowserReviewProcedure(
      client,
      "forgeEditPrComment",
      { ...input, commentId: "c1", expectedBody: "old", body: "new" },
      owner,
    ),
  ).rejects.toMatchObject({ code: "offline" });
  expect(call).toHaveBeenCalledTimes(1);
  useRemoteServersStore.setState({
    servers: [{ ...server, endpoint: "https://desktop.example/other/" }],
  });
  await expect(
    callBrowserReviewProcedure(
      client,
      "forgeGetPrViewedFiles",
      input,
      browserBridgeOwnerKey({ ...server, endpoint: "https://desktop.example/other/" }),
    ),
  ).rejects.toMatchObject({ code: "cancelled" });
  expect(call).toHaveBeenCalledTimes(1);
});

it("never substitutes a cache for an authorization rejection or replays uncertain writes", async () => {
  const call = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>().mockResolvedValue(marks);
  const client = { callRemoteProcedure: call } as unknown as RemoteDesktopClient;
  const owner = browserBridgeOwnerKey(server);
  await callBrowserReviewProcedure(client, "forgeGetPrViewedFiles", input, owner);
  call.mockRejectedValue(new RemoteClientError("Denied", 403, "forbidden"));
  await expect(
    callBrowserReviewProcedure(client, "forgeGetPrViewedFiles", input, owner),
  ).rejects.toMatchObject({ status: 403 });
  call.mockRejectedValue(new RemoteClientError("Network", 0, "network"));
  await expect(
    callBrowserReviewProcedure(
      client,
      "forgeEditPrComment",
      { ...input, commentId: "c1", expectedBody: "old", body: "new" },
      owner,
    ),
  ).rejects.toMatchObject({ status: 0 });
  expect(call).toHaveBeenCalledTimes(3);
});

it("preserves future row and database versions without overwriting or deleting them", async () => {
  await writeBrowserReviewCache("future", { value: "old" });
  await resetBrowserReviewCacheForTest();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("poracode-review-cache", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve) => {
    const transaction = db.transaction("snapshots", "readwrite");
    transaction
      .objectStore("snapshots")
      .put({ id: "future", version: 2, serialized: "future bytes", updatedAt: 0 });
    transaction.oncomplete = () => resolve();
  });
  db.close();
  expect(await readBrowserReviewCache("future", schema)).toBeUndefined();
  await writeBrowserReviewCache("future", { value: "replacement" });
  await resetBrowserReviewCacheForTest();
  const futureDb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("poracode-review-cache", 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const stored = await new Promise<unknown>((resolve) => {
    const request = futureDb.transaction("snapshots").objectStore("snapshots").get("future");
    request.onsuccess = () => resolve(request.result);
  });
  expect(stored).toMatchObject({ version: 2, serialized: "future bytes" });
  futureDb.close();
  expect(await readBrowserReviewCache("future", schema)).toBeUndefined();
  await writeBrowserReviewCache("future", { value: "replacement" });
});

it("discards a host response when its owner changes during cache persistence", async () => {
  const call = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>().mockResolvedValue(marks);
  const original = IDBObjectStore.prototype.put;
  const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    const request = Reflect.apply(
      original,
      this,
      key === undefined ? [value] : [value, key],
    ) as IDBRequest;
    useRemoteServersStore.setState({
      servers: [{ ...server, endpoint: "https://desktop.example/other/" }],
    });
    return request;
  });
  try {
    await expect(
      callBrowserReviewProcedure(
        { callRemoteProcedure: call } as unknown as RemoteDesktopClient,
        "forgeGetPrViewedFiles",
        input,
        browserBridgeOwnerKey(server),
      ),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(call).toHaveBeenCalledTimes(1);
  } finally {
    put.mockRestore();
  }
});
