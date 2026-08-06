// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createPostHogClient, type PostHogClientConfig } from "./posthogClient";

function parseBatchBody(
  fetchMock: { mock: { calls: Array<Parameters<typeof fetch>> } },
  index: number,
) {
  const request = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  return JSON.parse(String(request?.body)) as {
    batch: Array<{ event: string; properties: Record<string, unknown> }>;
  };
}

describe("posthog product analytics sender", () => {
  function createClient(config: PostHogClientConfig, fetchMock: typeof fetch) {
    let eventIndex = 0;
    return createPostHogClient({
      resolveConfig: () => config,
      resolveInstallId: () => "install-id",
      buildBaseProperties: (sessionId) => ({ $session_id: sessionId }),
      createEventId: () => `event-${++eventIndex}`,
      createSessionId: () => "session-id",
      now: () => "2026-07-09T00:00:00.000Z",
      fetch: fetchMock,
    });
  }

  const enabledConfig: PostHogClientConfig = {
    apiKey: "phc_test",
    host: "https://posthog.test",
    enabled: true,
  };

  it("does not send when PostHog is disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createClient({ ...enabledConfig, enabled: false }, fetchMock);

    client.capture("thread.started", { provider: "codex" });
    await client.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a single in-flight flush", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const client = createClient(enabledConfig, fetchMock);

    client.capture("thread.started", { provider: "codex" });
    const first = client.flush();
    const second = client.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(new Response("{}", { status: 200 }));
    await Promise.all([first, second]);
  });

  it("drains every queued batch in one flush", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    const client = createClient(enabledConfig, fetchMock);

    for (let index = 0; index < 45; index += 1) {
      client.capture("git.sync_action", { action: `event-${index}` });
    }
    await client.flush();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.map((_, index) => parseBatchBody(fetchMock, index).batch.length),
    ).toEqual([20, 20, 5]);
  });

  it("retries failed batches before newer events", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const client = createClient(enabledConfig, fetchMock);

    client.capture("git.sync_action", { action: "first" });
    await client.flush();
    client.capture("git.sync_action", { action: "second" });
    await client.flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(parseBatchBody(fetchMock, 1).batch.map((event) => event.properties.action)).toEqual([
      "first",
      "second",
    ]);
    expect(parseBatchBody(fetchMock, 0).batch[0]?.properties.$insert_id).toBe("event-1");
    expect(parseBatchBody(fetchMock, 1).batch[0]?.properties.$insert_id).toBe("event-1");
  });
});
