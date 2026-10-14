import { describe, expect, it } from "vitest";
import type { CrossagentRankSource } from "@/shared/crossagentRanking";
import { prepareSubagentRun } from "./spawnPlan";
import { readDispatchTrace, snapshotDispatchTrace } from "./dispatchTrace";
import { SECRET, provider, savedRoute, requestFor, harness } from "./dispatchTrace.testHelpers";

describe("dispatch trace provenance", () => {
  it.each<CrossagentRankSource>([
    "manual-override",
    "tag-affinity",
    "crossagent-usage",
    "favorite",
    "agent-usage",
    "built-in",
  ])("retains the existing %s rank source", (source) => {
    const request = requestFor({ prompt: SECRET }, [provider("fixture-primary", source)]);
    expect(request.dispatchProvenance?.selection).toMatchObject({
      source,
      rankSource: source,
      explicitFields: { provider: false, model: false, effort: false, fast: false },
    });
  });

  it("records partial explicit fields without hiding ranked defaults", () => {
    const request = requestFor({ prompt: SECRET, fast: false, model: "fixture-model" }, [
      provider("fixture-primary", "tag-affinity"),
    ]);
    expect(request.dispatchProvenance?.selection).toMatchObject({
      source: "explicit",
      rankSource: "tag-affinity",
      explicitFields: { provider: false, model: true, effort: false, fast: true },
    });
  });

  it.each([
    [{}, "saved-route", "saved-route", "any-failure", 1],
    [{ retry_on: "startup" }, "saved-route", "per-call", "startup", 1],
    [{ fallbacks: [] }, "per-call", "default", "startup", 0],
    [{ fallbacks: [], retry_on: "any-failure" }, "per-call", "per-call", "any-failure", 0],
    [{ fallbacks: [{ provider: "fixture-fallback" }] }, "per-call", "default", "startup", 1],
  ] as const)(
    "records effective saved/per-call policy for %j",
    (args, source, retryModeSource, retryMode, count) => {
      const h = harness();
      const request = requestFor({ prompt: SECRET, ...args }, [
        provider("fixture-primary", "manual-override", savedRoute()),
        provider("fixture-fallback"),
      ]);
      const plan = prepareSubagentRun(h, h.parent, request);
      expect(plan.dispatchTrace?.selection).toMatchObject({
        source: "manual-override",
        routeTags: ["review"],
        primary: {
          provider: "fixture-primary",
          model: "fixture-model",
          effort: "high",
          fast: false,
        },
      });
      expect(plan.dispatchTrace?.fallbackPolicy).toMatchObject({
        source,
        retryModeSource,
        retryMode,
      });
      expect(plan.dispatchTrace?.fallbackPolicy.entries).toHaveLength(count);
    },
  );

  it("does not claim a saved route when explicit selection diverges", () => {
    const route = { ...savedRoute(), fast: true };
    const request = requestFor({ prompt: SECRET, fast: false }, [
      provider("fixture-primary", "manual-override", route),
    ]);
    expect(request.fallbacks).toBeUndefined();
    expect(request.dispatchProvenance).toMatchObject({
      fallbackSource: "none",
      retryModeSource: "default",
    });
    expect(request.dispatchProvenance?.selection.routeTags).toBeUndefined();
  });

  it("bounds and allowlists retained metadata without retaining caller objects", () => {
    const h = harness();
    const request = requestFor({
      prompt: SECRET,
      dispatchProvenance: { selection: { source: SECRET } },
    });
    const plan = prepareSubagentRun(h, h.parent, request);
    request.dispatchProvenance!.selection.matchedTags = ["changed"];
    expect(plan.dispatchTrace?.selection.matchedTags).toEqual(["review"]);
    const attempt = {
      ...plan.attempts[0]!,
      provider: "p".repeat(4000),
      model: "m".repeat(4000),
      config: { ...plan.attempts[0]!.config, effort: "e".repeat(4000), privateEnv: SECRET },
    };
    // Test the projection against an oversized resolved plan, not arbitrary public error text.
    const snapshot = snapshotDispatchTrace(
      request,
      Array.from({ length: 20 }, () => attempt),
      "startup",
    );
    const trace = readDispatchTrace(
      snapshot,
      [
        {
          attempt: 1,
          provider: SECRET,
          model: SECRET,
          status: "failed",
          output: SECRET,
          error: SECRET,
        },
      ],
      19,
      "running",
    );
    expect(trace.selection.primary.provider).toHaveLength(256);
    expect(trace.selection.primary.model).toHaveLength(256);
    expect(trace.selection.primary.effort).toHaveLength(256);
    expect(trace.fallbackPolicy.entries).toHaveLength(3);
    expect(trace.attempts).toHaveLength(4);
    expect(JSON.stringify(trace)).not.toContain(SECRET);
    expect(JSON.stringify(trace).length).toBeLessThan(10_000);
  });
});
