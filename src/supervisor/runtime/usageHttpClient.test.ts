import { afterEach, describe, expect, it, vi } from "vitest";
import { createNodeHttpClient } from "./usageHttpClient";

describe("createNodeHttpClient", () => {
  afterEach(() => vi.unstubAllGlobals());

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
