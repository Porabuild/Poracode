import { describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient, type RemoteFetch } from "./client";

describe("device preview transport", () => {
  it("preserves the authenticated environment proxy prefix and refuses another host's stale handle", async () => {
    const fetcher = vi.fn<RemoteFetch>(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "device_session_expired", message: "Attach again." } }),
          { status: 410, headers: { "content-type": "application/json" } },
        ),
    );
    const client = new RemoteDesktopClient(
      "https://host.example/api/environments/child/proxy/",
      "child-credential",
      fetcher,
    );
    await expect(client.deviceFrame("thread-1", "stale-session")).rejects.toMatchObject({
      status: 410,
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://host.example/api/environments/child/proxy/api/threads/thread-1/devices/stale-session/frame",
    );
    expect(init?.headers?.authorization).toBe("Bearer child-credential");
  });
  it("cancels an in-flight snapshot without reporting a transport failure", async () => {
    const entered = Promise.withResolvers<void>();
    const fetcher = vi.fn<RemoteFetch>(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          entered.resolve();
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    const client = new RemoteDesktopClient("https://host.example", "credential", fetcher);
    const abort = new AbortController();
    const pending = client
      .deviceFrame("thread-1", "session", abort.signal)
      .catch((error: unknown) => error);
    await entered.promise;
    abort.abort();
    expect(await pending).toMatchObject({ status: 499, code: "cancelled" });
  });
  it("uses a browser-permitted POST for ephemeral lease detachment", async () => {
    const fetcher = vi.fn<RemoteFetch>(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new RemoteDesktopClient(
      "https://host.example/api/environments/child/proxy/",
      "credential",
      fetcher,
    );
    await client.detachDevice("thread-1", "lease-1");
    expect(String(fetcher.mock.calls[0]![0])).toBe(
      "https://host.example/api/environments/child/proxy/api/threads/thread-1/devices/lease-1/detach",
    );
    expect(fetcher.mock.calls[0]![1]?.method).toBe("POST");
  });
});
