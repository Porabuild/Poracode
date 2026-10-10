import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenCode } from "@opencode/client";
import type { OpenCode2Client } from "./clientTypes";
import { awaitOpenCode2Activation } from "./readiness";

function fixture(status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  fetch.mockImplementation(async () => {
    if (status !== 200) return new Response(null, { status });
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
  it("waits for the cold inventory before reading the catalog", async () => {
    const { fetch, client } = fixture();
    fetch
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(
        Response.json({ data: [{ source: { type: "builtin" }, state: { status: "active" } }] }),
      );
    const pending = awaitOpenCode2Activation(client, { location: { directory: "/repo" } });
    await pending;
    expect(fetch).toHaveBeenCalledTimes(2);
    const urls = fetch.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map((url) => url.pathname)).toEqual(["/api/plugin", "/api/plugin"]);
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
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(await rejected).toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bounds a cold inventory wait when no caller signal is supplied", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const client = {
      plugin: {
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
