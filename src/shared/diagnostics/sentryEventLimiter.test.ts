import { describe, expect, it } from "vitest";
import type { SentryEventLike } from "./sentryPrivacy";
import { createSentryEventLimiter } from "./sentryEventLimiter";

function event(functionName: string, value = "request failed"): SentryEventLike {
  return {
    exception: {
      values: [
        {
          type: "Error",
          value,
          mechanism: { handled: true },
          stacktrace: {
            frames: [{ function: functionName, filename: "[app-file]/supervisor.cjs", lineno: 12 }],
          },
        },
      ],
    },
    tags: { "poracode.process": "supervisor" },
  };
}

describe("Sentry event limiter", () => {
  it("keeps the first three events for a signature and admits a distinct stack", () => {
    const limit = createSentryEventLimiter();

    expect(limit(event("ghListPrs"))).toBe(true);
    expect(limit(event("ghListPrs"))).toBe(true);
    expect(limit(event("ghListPrs"))).toBe(true);
    expect(limit(event("ghListPrs"))).toBe(false);
    expect(limit(event("readProjectFile"))).toBe(true);
  });

  it("keeps provider variants distinct when they share an explicit fingerprint", () => {
    const limit = createSentryEventLimiter({ maxEventsPerSignature: 1 });
    const structuredFailure = {
      ...event("structuredRuntimeFailure"),
      fingerprint: ["poracode", "structured-runtime", "structured-runtime-turn", "turn-failed"],
      tags: {
        "poracode.process": "supervisor",
        "poracode.provider": "codex",
        "poracode.runtime_kind": "structured",
      },
    } satisfies SentryEventLike;

    expect(limit(structuredFailure)).toBe(true);
    expect(
      limit({
        ...structuredFailure,
        tags: { ...structuredFailure.tags, "poracode.provider": "claude" },
      }),
    ).toBe(true);
    expect(limit(structuredFailure)).toBe(false);
  });

  it("admits a repeated signature after its window expires", () => {
    let timestamp = 1_000;
    const limit = createSentryEventLimiter({ now: () => timestamp, windowMs: 1_000 });
    const repeated = event("ghListPrs");

    expect(limit(repeated)).toBe(true);
    expect(limit(repeated)).toBe(true);
    expect(limit(repeated)).toBe(true);
    expect(limit(repeated)).toBe(false);
    timestamp += 1_001;
    expect(limit(repeated)).toBe(true);
  });

  it.each([undefined, ["native-crash"]])(
    "keeps native process and platform variants distinct with fingerprint %j",
    (fingerprint) => {
      const limit = createSentryEventLimiter({ maxEventsPerSignature: 1 });
      const native = {
        platform: "native",
        level: "fatal",
        tags: { "poracode.process": "main", "event.process": "browser" },
        ...(fingerprint ? { fingerprint } : {}),
      } satisfies SentryEventLike;

      expect(limit(native)).toBe(true);
      expect(limit(native)).toBe(false);
      expect(limit({ ...native, tags: { ...native.tags, "event.process": "renderer" } })).toBe(
        true,
      );
      expect(limit({ ...native, platform: "javascript" })).toBe(true);
    },
  );

  it("reserves process capacity from handled errors for crashes", () => {
    const limit = createSentryEventLimiter({
      maxEventsPerSignature: 10,
      maxEventsPerProcess: 3,
      maxHandledEventsPerProcess: 1,
    });

    expect(limit(event("handledError"))).toBe(true);
    expect(limit(event("secondHandledError"))).toBe(false);
    expect(
      limit({
        ...event("uncaughtError"),
        exception: {
          values: [
            {
              type: "Error",
              value: "uncaught",
              mechanism: { handled: false },
              stacktrace: { frames: [{ function: "uncaughtError" }] },
            },
          ],
        },
      }),
    ).toBe(true);
    expect(limit({ ...event("nativeCrash"), platform: "native" })).toBe(true);
    expect(limit(event("processBudgetExceeded"))).toBe(false);
  });

  it("bounds tracked signature memory", () => {
    const limit = createSentryEventLimiter({
      maxEventsPerSignature: 10,
      maxEventsPerProcess: 10,
      maxTrackedSignatures: 2,
    });

    expect(limit(event("first"))).toBe(true);
    expect(limit(event("second"))).toBe(true);
    expect(limit(event("third"))).toBe(true);
    expect(limit(event("first"))).toBe(true);
  });

  it("keeps separate limiter state for independent processes", () => {
    const mainLimit = createSentryEventLimiter({ maxEventsPerProcess: 1 });
    const supervisorLimit = createSentryEventLimiter({ maxEventsPerProcess: 1 });
    const first = event("sameError");

    expect(mainLimit(first)).toBe(true);
    expect(mainLimit(event("differentError"))).toBe(false);
    expect(supervisorLimit(first)).toBe(true);
  });
});
