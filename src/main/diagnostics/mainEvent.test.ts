import { describe, expect, it } from "vitest";
import type { SentryEventLike } from "@/shared/diagnostics/sentryPrivacy";
import { prepareMainSentryEvent } from "./mainEvent";

describe("main Sentry event preparation", () => {
  it.each([
    {
      message: "net::ERR_NETWORK_CHANGED",
    },
    {
      exception: {
        values: [{ value: "net::ERR_NETWORK_CHANGED" }],
      },
    },
  ] satisfies SentryEventLike[])("drops the exact transient network-change error", (event) => {
    expect(prepareMainSentryEvent(event, "darwin")).toBeNull();
  });

  it.each([
    {
      message: "net::ERR_INTERNET_DISCONNECTED",
    },
    {
      exception: {
        values: [{ value: "Navigation failed: net::ERR_NETWORK_CHANGED" }],
      },
    },
    {
      exception: {
        values: [{ value: "net::ERR_NETWORK_CHANGED " }],
      },
    },
  ] satisfies SentryEventLike[])("keeps nearby Electron network failures", (event) => {
    expect(prepareMainSentryEvent(event, "darwin")).toEqual(event);
  });
});
