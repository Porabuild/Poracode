import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event, LegacyOpenCodeClient } from "./legacySdk";
import { subscribeOpenCodeServerEvents } from "./sdkEventHub";

// Regression keys for the symlinked-scratch defect: OpenCode realpaths the
// request directory before stamping SSE envelopes, so a subscriber keyed by
// the lexical form ("/var/..." vs "/private/var/...") must still receive its
// session's events instead of silently dropping all of them.
const RESOLVED_DIRECTORY = "/private/var/folders/zz/poracode-project";
const LEXICAL_DIRECTORY = "/var/folders/zz/poracode-project";

function heldStream(...values: readonly unknown[]): AsyncGenerator<unknown> {
  return (async function* () {
    for (const value of values) {
      yield value;
    }
    // Hold the stream open so the hub's reconnect loop stays parked.
    await new Promise<never>(() => undefined);
  })();
}

function eventClientWith(...values: readonly unknown[]): LegacyOpenCodeClient {
  return {
    global: {
      event: vi.fn<() => Promise<{ stream: AsyncGenerator<unknown> }>>().mockResolvedValue({
        stream: heldStream(...values),
      }),
    },
  } as unknown as LegacyOpenCodeClient;
}

function sessionEnvelope(directory: string, sessionID: string): unknown {
  return {
    directory,
    payload: {
      id: `evt-${sessionID}`,
      type: "session.status",
      properties: { sessionID, status: { type: "busy" } },
    },
  };
}

describe("subscribeOpenCodeServerEvents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delivers events stamped with the resolved directory key", async () => {
    const onEvent = vi.fn<(event: Event) => void>();
    const unsubscribe = subscribeOpenCodeServerEvents({
      eventClient: eventClientWith(sessionEnvelope(RESOLVED_DIRECTORY, "ses_a")),
      directory: RESOLVED_DIRECTORY,
      onEvent,
    });

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session.status",
        properties: expect.objectContaining({ sessionID: "ses_a" }),
      }),
    );
    unsubscribe();
  });

  it("rescues a directory-mismatched event through the sessionID claim", async () => {
    const onEvent = vi.fn<(event: Event) => void>();
    const claimsEvent = vi
      .fn<(event: Event) => boolean>()
      .mockImplementation(
        (event) =>
          (event.properties as { sessionID?: string } | undefined)?.sessionID === "ses_own",
      );
    const unsubscribe = subscribeOpenCodeServerEvents({
      eventClient: eventClientWith(
        sessionEnvelope(LEXICAL_DIRECTORY, "ses_unrelated"),
        sessionEnvelope(LEXICAL_DIRECTORY, "ses_own"),
      ),
      directory: RESOLVED_DIRECTORY,
      claimsEvent,
      onEvent,
    });

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session.status",
        properties: expect.objectContaining({ sessionID: "ses_own" }),
      }),
    );
    unsubscribe();
  });

  it("warns once per directory when an event matches no subscriber", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const onEvent = vi.fn<(event: Event) => void>();
    const unsubscribe = subscribeOpenCodeServerEvents({
      eventClient: eventClientWith(
        sessionEnvelope(LEXICAL_DIRECTORY, "ses_unrelated"),
        sessionEnvelope(LEXICAL_DIRECTORY, "ses_also_unrelated"),
      ),
      directory: RESOLVED_DIRECTORY,
      onEvent,
    });

    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(LEXICAL_DIRECTORY));
    expect(onEvent).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("prefers the directory route and never double-delivers", async () => {
    const onEvent = vi.fn<(event: Event) => void>();
    const claimsEvent = vi.fn<(event: Event) => boolean>().mockReturnValue(true);
    const unsubscribe = subscribeOpenCodeServerEvents({
      eventClient: eventClientWith(sessionEnvelope(RESOLVED_DIRECTORY, "ses_a")),
      directory: RESOLVED_DIRECTORY,
      claimsEvent,
      onEvent,
    });

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onEvent).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
