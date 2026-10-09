import { describe, expect, it } from "vitest";
import {
  extractContextPayloadSchema,
  generateCommitMessagePayloadSchema,
  generatePrSummaryPayloadSchema,
  generateTitlePayloadSchema,
} from "./git";

/** The shared non-selection fields every generation payload carries. */
function basePayload() {
  return {
    projectLocation: { kind: "posix" as const, path: "/repo" },
    agentKind: "codex",
  };
}

function extractPayload(selection?: unknown) {
  return {
    threadId: "thread-1",
    agentKind: "codex",
    sessionRef: { providerSessionId: "session-1", discoveredAt: "2026-10-09T00:00:00.000Z" },
    projectLocation: { kind: "posix", path: "/repo" },
    ...(selection !== undefined ? { selection } : {}),
  };
}

describe("generation payload canonical selection", () => {
  it("keeps an omitted selection on the existing utility default", () => {
    expect(generateCommitMessagePayloadSchema.safeParse(basePayload()).success).toBe(true);
    expect(
      generateTitlePayloadSchema.safeParse({ ...basePayload(), prompt: "Summarize" }).success,
    ).toBe(true);
    expect(
      generatePrSummaryPayloadSchema.safeParse({
        ...basePayload(),
        branch: "feature",
        baseBranch: "main",
      }).success,
    ).toBe(true);
    expect(extractContextPayloadSchema.safeParse(extractPayload()).success).toBe(true);
  });

  it("admits empty effort, false Fast, and default context as exact carrier values", () => {
    // The replaced scalar triple rejected `effort: ""` with `.min(1)` and the
    // old payloads had no thinking/contextSize at all; the canonical selection
    // preserves every axis exactly.
    const selection = {
      model: "",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "default",
    };
    expect(
      generateCommitMessagePayloadSchema.safeParse({ ...basePayload(), selection }).success,
    ).toBe(true);
    expect(
      generateTitlePayloadSchema.safeParse({ ...basePayload(), prompt: "t", selection }).success,
    ).toBe(true);
    expect(
      generatePrSummaryPayloadSchema.safeParse({
        ...basePayload(),
        branch: "feature",
        baseBranch: "main",
        selection,
      }).success,
    ).toBe(true);
    expect(extractContextPayloadSchema.safeParse(extractPayload(selection)).success).toBe(true);
  });

  it("round-trips a recognized v1 selection binding with its selection", () => {
    const selection = {
      model: "lead-a+sidekick-b",
      effort: "",
      fast: false,
      selectionBinding: {
        version: 1,
        kind: "family-member",
        owner: { agentKind: "vendor:profile-1", presentationMode: "terminal" },
        model: "lead-a2+sidekick-b2",
        inertValues: { effort: "", fast: false },
      },
    };
    expect(
      generateCommitMessagePayloadSchema.parse({ ...basePayload(), selection }).selection,
    ).toEqual(selection);
    expect(
      generateTitlePayloadSchema.parse({ ...basePayload(), prompt: "t", selection }).selection,
    ).toEqual(selection);
    expect(
      generatePrSummaryPayloadSchema.parse({
        ...basePayload(),
        branch: "feature",
        baseBranch: "main",
        selection,
      }).selection,
    ).toEqual(selection);
    expect(extractContextPayloadSchema.parse(extractPayload(selection)).selection).toEqual(
      selection,
    );
  });

  it("rejects malformed/future/unknown-key bindings visibly", () => {
    const malformedBindings = [
      { version: 2, kind: "family-member", owner: {}, model: "m", inertValues: {} },
      {
        version: 1,
        kind: "family-member",
        owner: { agentKind: "codex", presentationMode: "terminal" },
        model: "",
        inertValues: { effort: "" },
      },
      {
        version: 1,
        kind: "family-member",
        owner: { agentKind: "codex", presentationMode: "terminal" },
        model: "m",
        // Nonempty recorded-value map required: the all-absent map is refused.
        inertValues: {},
      },
      {
        version: 1,
        kind: "family-member",
        owner: { agentKind: "codex", presentationMode: "terminal" },
        model: "m",
        inertValues: { effort: "", unknown: true },
      },
    ];
    for (const selectionBinding of malformedBindings) {
      expect(
        generateCommitMessagePayloadSchema.safeParse({
          ...basePayload(),
          selection: { model: "m", selectionBinding },
        }).success,
      ).toBe(false);
    }
  });

  it("rejects null carriers and coerced values inside the selection", () => {
    expect(
      generateCommitMessagePayloadSchema.safeParse({
        ...basePayload(),
        selection: { model: "m", effort: null },
      }).success,
    ).toBe(false);
    expect(
      generateCommitMessagePayloadSchema.safeParse({
        ...basePayload(),
        selection: { model: "m", fast: "false" },
      }).success,
    ).toBe(false);
  });
});
