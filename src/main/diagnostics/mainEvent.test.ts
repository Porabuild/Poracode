import { describe, expect, it } from "vitest";
import type { SentryEventLike } from "@/shared/diagnostics/sentryPrivacy";
import { prepareMainSentryEvent } from "./mainEvent";

describe("main Sentry event preparation", () => {
  it.each([
    "Backend host exited with code 3221226091.",
    "Backend host exited with code 1073807364.",
    "Supervisor exited with code 3221226091",
    "Supervisor exited with code 1073807364",
    "Windows job object helper failed: helper exited with code 3221226091 before assignment.",
  ])("drops Windows system teardown reporting: %s", (message) => {
    const event: SentryEventLike = {
      exception: { values: [{ type: "Error", value: message }] },
      tags: { "poracode.process": "main" },
    };
    expect(prepareMainSentryEvent(event, "win32")).toBeNull();
    expect(prepareMainSentryEvent(event, "linux")).not.toBeNull();
  });

  it.each([
    "Backend host exited with code 0.",
    "Backend host exited with code 3221225781.",
    "Supervisor exited with code 1",
    "Windows job object helper failed: helper exited with code 1 before assignment.",
    "Unexpected failure: Backend host exited with code 3221226091.",
  ])("keeps other process failures: %s", (message) => {
    const event: SentryEventLike = {
      exception: { values: [{ type: "Error", value: message }] },
      tags: { "poracode.process": "main" },
    };
    expect(prepareMainSentryEvent(event, "win32")).not.toBeNull();
  });

  it("does not suppress matching errors from another process", () => {
    expect(
      prepareMainSentryEvent(
        {
          exception: {
            values: [{ type: "Error", value: "Backend host exited with code 3221226091." }],
          },
          tags: { "poracode.process": "renderer" },
        },
        "win32",
      ),
    ).not.toBeNull();
  });

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
