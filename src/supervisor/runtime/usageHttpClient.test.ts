import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNodeHttpClient } from "./usageHttpClient";

describe("createNodeHttpClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["EAI_AGAIN", "ENOTFOUND", "ECONNRESET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"])(
    "recovers a GET from %s without requiring a manual refresh",
    async (code) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new TypeError("fetch failed", { cause: { code } }))
        .mockResolvedValueOnce(new Response('{"usage":42}', { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const request = createNodeHttpClient().request({
        url: "https://usage.example/quota",
        headers: { Authorization: "Bearer fixture" },
        redirect: "error",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await request).toMatchObject({ status: 200, body: '{"usage":42}' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1]).toEqual(fetchMock.mock.calls[0]);
    },
  );

  it("stops after one retry when the connection remains unavailable", async () => {
    const error = new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(error);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createNodeHttpClient().request({ url: "https://usage.example/quota", method: "GET" }),
    ).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the original timeout while waiting to retry", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createNodeHttpClient().request({ url: "https://usage.example/quota", timeoutMs: 500 }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts the retry at the original deadline", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed", { cause: { code: "ETIMEDOUT" } }))
      .mockImplementationOnce(
        async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
              once: true,
            });
          }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createNodeHttpClient().request({ url: "https://usage.example/quota", timeoutMs: 1_500 }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 429, 503])("does not retry HTTP %i responses", async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status }));
    vi.stubGlobal("fetch", fetchMock);

    expect(
      await createNodeHttpClient().request({ url: "https://usage.example/quota" }),
    ).toMatchObject({
      status,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["CERT_HAS_EXPIRED", "ERR_INVALID_URL", undefined])(
    "does not retry non-transient failures (%s)",
    async (code) => {
      const error = new TypeError("fetch failed", { cause: { code } });
      const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(error);
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        createNodeHttpClient().request({ url: "https://usage.example/quota" }),
      ).rejects.toBe(error);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("does not replay a POST after a connection failure", async () => {
    const error = new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(error);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createNodeHttpClient().request({
        url: "https://oauth.example/token",
        method: "POST",
        body: "fixture-form",
      }),
    ).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovers from an actual socket closed before the response", async () => {
    let requests = 0;
    const server = createServer((req, res) => {
      requests += 1;
      if (requests === 1) req.socket.destroy();
      else res.end('{"usage":42}');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      expect(
        await createNodeHttpClient().request({ url: `http://127.0.0.1:${port}/quota` }),
      ).toMatchObject({ status: 200, body: '{"usage":42}' });
      expect(requests).toBe(2);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("passes the caller's redirect policy to fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createNodeHttpClient().request({
      method: "POST",
      url: "https://oauth2.googleapis.com/token",
      body: "secret-form",
      redirect: "error",
    });

    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("error");
  });
});
