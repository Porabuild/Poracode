import { afterEach, describe, expect, it } from "vitest";
import { friendlyError, msg, setMessageResolver } from "@/shared/messages";
import type { ModelSelection } from "@/shared/selectionBinding.schemas.ts";
import {
  assertOneShotControlsMapped,
  assertOneShotProjectionMatches,
  legacyOneShotPositionals,
  resolveCheckedOneShotBuilderSelection,
  resolveCheckedOneShotResumeSelection,
  resolveOneShotSelection,
  unstampedOneShotSelection,
  UnsupportedOneShotControlError,
} from "./oneShotSelection";

function selection(overrides: Partial<ModelSelection> = {}): ModelSelection {
  return { model: "m", ...overrides };
}

describe("legacyOneShotPositionals", () => {
  it("keeps presence exact: omitted, empty, and false stay distinct", () => {
    expect(legacyOneShotPositionals(selection())).toEqual({ model: "m" });
    expect(legacyOneShotPositionals(selection({ effort: "", fast: false }))).toEqual({
      model: "m",
      effort: "",
      fast: false,
    });
    expect(legacyOneShotPositionals(selection({ effort: "high", fast: true }))).toEqual({
      model: "m",
      effort: "high",
      fast: true,
    });
  });

  it("never projects the binding into the positionals", () => {
    const stamped = selection({
      selectionBinding: {
        version: 1,
        kind: "family-member",
        owner: { agentKind: "devin:acme", presentationMode: "terminal" },
        model: "m",
        inertValues: { effort: "" },
      },
    });
    expect(legacyOneShotPositionals(stamped)).toEqual({ model: "m" });
  });
});

describe("unstampedOneShotSelection", () => {
  it("constructs the selection scalars represent without inventing carriers", () => {
    expect(unstampedOneShotSelection("m")).toEqual({ model: "m" });
    expect(unstampedOneShotSelection("m", "", false)).toEqual({
      model: "m",
      effort: "",
      fast: false,
    });
    expect(Object.hasOwn(unstampedOneShotSelection("m"), "thinking")).toBe(false);
    expect(Object.hasOwn(unstampedOneShotSelection("m"), "selectionBinding")).toBe(false);
  });
});

describe("assertOneShotProjectionMatches", () => {
  it("accepts the matching projection", () => {
    const tuple = selection({ effort: "", fast: false });
    expect(() =>
      assertOneShotProjectionMatches(tuple, { model: "m", effort: "", fast: false }),
    ).not.toThrow();
  });

  it("refuses value and presence mismatches as visible input errors", () => {
    const tuple = selection({ effort: "high", fast: true });
    expect(() =>
      assertOneShotProjectionMatches(tuple, { model: "m", effort: "low", fast: true }),
    ).toThrow(/disagree \(effort\)/);
    // Presence counts: an omitted axis is not an empty/false carrier.
    expect(() => assertOneShotProjectionMatches(tuple, { model: "m" })).toThrow(/effort, fast/);
    expect(() => assertOneShotProjectionMatches(selection({ effort: "" }), { model: "m" })).toThrow(
      /effort/,
    );
    expect(() =>
      assertOneShotProjectionMatches(selection({ fast: false }), { model: "m", fast: true }),
    ).toThrow(/fast/);
    expect(() => assertOneShotProjectionMatches(selection(), { model: "other" })).toThrow(/model/);
  });
});

describe("assertOneShotControlsMapped", () => {
  it("ignores absent carriers entirely on every axis", () => {
    expect(() => assertOneShotControlsMapped(selection())).not.toThrow();
    expect(() => assertOneShotControlsMapped(selection(), {})).not.toThrow();
  });

  it("refuses any present unmapped carrier, including default-valued ones", () => {
    for (const carrier of [
      { effort: "high" },
      { effort: "" },
      { fast: true },
      { fast: false },
      { thinking: false },
      { contextSize: "default" },
    ]) {
      expect(() => assertOneShotControlsMapped(selection(carrier))).toThrow(
        UnsupportedOneShotControlError,
      );
    }
    expect(() =>
      assertOneShotControlsMapped(selection({ thinking: true, contextSize: "" })),
    ).toThrowError(UnsupportedOneShotControlError);
    const axes = (() => {
      try {
        assertOneShotControlsMapped(selection({ effort: "high", fast: true, thinking: true }));
        return [];
      } catch (error) {
        return (error as UnsupportedOneShotControlError).axes;
      }
    })();
    expect(axes).toEqual(["effort", "fast", "thinking"]);
  });

  it("accepts every value of an axis the lane declares mapped", () => {
    expect(() =>
      assertOneShotControlsMapped(selection({ effort: "high", fast: false, thinking: false }), {
        effort: true,
        fast: true,
        thinking: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertOneShotControlsMapped(selection({ contextSize: "128k" }), { contextSize: true }),
    ).not.toThrow();
  });

  it("accepts only the exact inactive values a lane declares locally", () => {
    const mapping = { effort: { inactive: [""] }, fast: { inactive: [false] } };
    // The legacy default carriers stay accepted so default utility selections
    // keep flowing on lanes without a native mapping for the axis.
    expect(() =>
      assertOneShotControlsMapped(selection({ effort: "", fast: false }), mapping),
    ).not.toThrow();
    // Meaningful values on the same axes still refuse.
    expect(() => assertOneShotControlsMapped(selection({ effort: "high" }), mapping)).toThrow(
      UnsupportedOneShotControlError,
    );
    expect(() => assertOneShotControlsMapped(selection({ fast: true }), mapping)).toThrow(
      UnsupportedOneShotControlError,
    );
  });
});

describe("UnsupportedOneShotControlError user wording", () => {
  afterEach(() => {
    setMessageResolver(undefined);
  });

  it("carries the shared catalog message with no extra English implementation body", () => {
    // Without a resolver `msg` falls back to the shared English catalog, so
    // the error's message must equal that lookup exactly — the implementation
    // adds no English of its own.
    const error = new UnsupportedOneShotControlError(["effort", "fast"]);
    expect(error.message).toBe(msg("modelSelection.unsupportedOptions"));
    expect(error.message).toBe(
      "This agent does not support the selected model options. Choose different options and try again.",
    );
    // The refuted axes stay a programming-only diagnostic property.
    expect(error.axes).toEqual(["effort", "fast"]);
  });

  it("localizes through the installed resolver and the friendlyError static catalog", () => {
    setMessageResolver((key) =>
      key === "modelSelection.unsupportedOptions" ? "OPÇÕES-LOCALIZADAS" : undefined,
    );
    // A refusal built where the resolver is active (renderer-side resolver
    // installed in-process) already carries the localized wording.
    expect(new UnsupportedOneShotControlError(["thinking"]).message).toBe("OPÇÕES-LOCALIZADAS");
    // The real supervisor→renderer flow: the error crosses IPC as the
    // source-language string, and the renderer's friendlyError matches it
    // against the static catalog and re-resolves it in the active locale.
    setMessageResolver(undefined);
    const supervisorError = new UnsupportedOneShotControlError(["thinking"]);
    setMessageResolver((key) =>
      key === "modelSelection.unsupportedOptions" ? "OPÇÕES-LOCALIZADAS" : undefined,
    );
    expect(friendlyError(supervisorError)).toBe("OPÇÕES-LOCALIZADAS");
  });
});

describe("resolveCheckedOneShotBuilderSelection", () => {
  it("returns the supplied selection after validating the positionals", () => {
    const tuple = selection({ effort: "high", fast: true });
    expect(
      resolveCheckedOneShotBuilderSelection(
        { model: "m", effort: "high", fast: true },
        {
          selection: tuple,
        },
      ),
    ).toBe(tuple);
    expect(() =>
      resolveCheckedOneShotBuilderSelection(
        { model: "m", effort: "low", fast: true },
        {
          selection: tuple,
        },
      ),
    ).toThrow(/disagree/);
  });

  it("falls back to the unstamped scalar selection when no options carry one", () => {
    expect(
      resolveCheckedOneShotBuilderSelection({ model: "m", effort: "", fast: false }, undefined),
    ).toEqual({
      model: "m",
      effort: "",
      fast: false,
    });
    expect(resolveCheckedOneShotBuilderSelection({ model: "m" }, {})).toEqual({ model: "m" });
  });
});

describe("resolveOneShotSelection", () => {
  const adapter = { defaultOneShotModel: "fallback", label: "Test" };

  it("normalizes only the model and preserves every carrier verbatim", () => {
    const tuple = selection({
      model: "",
      effort: "",
      fast: false,
      thinking: true,
      contextSize: "128k",
    });
    // An empty model keeps the implicit/default convention only for adapters
    // that opted into implicit one-shot models.
    expect(
      resolveOneShotSelection(
        { ...adapter, allowsImplicitOneShotModel: true },
        tuple,
        () => new Error("no model"),
      ),
    ).toEqual({ ...tuple, model: "" });
    // The explicit pick always wins over the adapter default.
    expect(
      resolveOneShotSelection(adapter, selection({ model: "picked" }), () => new Error("no model")),
    ).toEqual({
      model: "picked",
    });
  });

  it("applies the adapter default to an omitted selection without inventing carriers", () => {
    expect(resolveOneShotSelection(adapter, undefined, () => new Error("no model"))).toEqual({
      model: "fallback",
    });
  });

  it("throws the caller's error when neither pick nor default exists", () => {
    expect(() =>
      resolveOneShotSelection({ label: "Test" }, undefined, () => new Error("no model")),
    ).toThrow("no model");
  });
});

describe("resume selection projection", () => {
  it("checks only the scalar model and retains every carrier by identity", () => {
    const tuple = Object.freeze(
      selection({ effort: "high", fast: true, thinking: true, contextSize: "1m" }),
    );
    expect(resolveCheckedOneShotResumeSelection("m", { selection: tuple })).toBe(tuple);
    expect(() => resolveCheckedOneShotResumeSelection("other", { selection: tuple })).toThrow(
      "model argument disagree",
    );
    expect(() => resolveCheckedOneShotResumeSelection(undefined, { selection: tuple })).toThrow(
      "model argument disagree",
    );
  });

  it("preserves the legacy omitted model and accepts an explicit empty projection", () => {
    expect(resolveCheckedOneShotResumeSelection(undefined, undefined)).toEqual({ model: "" });
    const tuple = selection({ model: "", effort: "", fast: false });
    expect(resolveCheckedOneShotResumeSelection("", { selection: tuple })).toBe(tuple);
  });
});
