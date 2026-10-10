import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenCode } from "@opencode/client";
import type { OpenCode2Client } from "./clientTypes";
import { awaitOpenCode2Activation } from "./readiness";

function fixture(status = 404) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  fetch.mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("await-activation")) return new Response(null, { status });
    return Response.json({ location: { directory: "/repo" }, data: [] });
  });
  const client = OpenCode.make({ baseUrl: "http://localhost:4096", fetch });
  return { fetch, client };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("OpenCode 2 activation compatibility", () => {
  it("uses the activation barrier on older servers", async () => {
    const { fetch, client } = fixture(204);
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await awaitOpenCode2Activation(client, { location: { directory: "/repo" } }, { signal });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(signal);
    expect(timeout).not.toHaveBeenCalled();
  });

  it("waits for the cold inventory when the activation endpoint was removed", async () => {
    const { fetch, client } = fixture();
    fetch
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(
        Response.json({ data: [{ source: { type: "builtin" }, state: { status: "active" } }] }),
      );
    const pending = awaitOpenCode2Activation(client, { location: { directory: "/repo" } });
    await pending;
    expect(fetch).toHaveBeenCalledTimes(3);
    const urls = fetch.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map((url) => url.pathname)).toEqual([
      "/api/plugin/await-activation",
      "/api/plugin",
      "/api/plugin",
    ]);
    expect(urls.every((url) => url.searchParams.get("location[directory]") === "/repo")).toBe(true);
  });

  it.each([401, 500])("propagates HTTP %s without polling", async (status) => {
    const { fetch, client } = fixture(status);
    await expect(awaitOpenCode2Activation(client)).rejects.toBeDefined();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("propagates transport failures without polling", async () => {
    const { fetch, client } = fixture();
    fetch.mockRejectedValue(new Error("offline"));
    await expect(awaitOpenCode2Activation(client)).rejects.toMatchObject({ reason: "Transport" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("cancels inventory polling with the caller's signal", async () => {
    const { fetch, client } = fixture();
    const controller = new AbortController();
    const pending = awaitOpenCode2Activation(client, undefined, { signal: controller.signal });
    const rejected = pending.catch((error: unknown) => error);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    controller.abort();
    expect(await rejected).toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("bounds a cold inventory wait when no caller signal is supplied", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const client = {
      plugin: {
        awaitActivation: vi.fn<() => Promise<void>>().mockRejectedValue(
          Object.assign(new Error("UnexpectedStatus", { cause: { status: 404 } }), {
            name: "ClientError",
            reason: "UnexpectedStatus",
          }),
        ),
        list: vi.fn<() => Promise<{ data: unknown[] }>>().mockResolvedValue({ data: [] }),
      },
    } as unknown as OpenCode2Client;
    const pending = awaitOpenCode2Activation(client);
    const rejected = pending.catch((error: unknown) => error);
    await vi.waitFor(() => expect(client.plugin.list).toHaveBeenCalledOnce());
    controller.abort();
    expect(await rejected).toBeInstanceOf(Error);
    expect(timeout).toHaveBeenCalledWith(60_000);
    expect(client.plugin.list).toHaveBeenCalledOnce();
  });
});
