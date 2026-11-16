import { describe, expect, it } from "vitest";
import { QWEN_DEFAULT_MODEL_ID, QWEN_RETIRED_PREVIEW_MODEL_ID } from "./qwenModels";
import { RETIRED_MODEL_REPLACEMENTS, retiredModelReplacement } from "./retiredModels";

describe("retiredModelReplacement", () => {
  it("maps a registered retired model to its replacement", () => {
    expect(retiredModelReplacement("qwen", QWEN_RETIRED_PREVIEW_MODEL_ID)).toBe(
      QWEN_DEFAULT_MODEL_ID,
    );
  });

  it("leaves current models, other agent kinds and profile kinds alone", () => {
    expect(retiredModelReplacement("qwen", QWEN_DEFAULT_MODEL_ID)).toBeUndefined();
    expect(retiredModelReplacement("claude:qwen", QWEN_RETIRED_PREVIEW_MODEL_ID)).toBeUndefined();
    expect(retiredModelReplacement("codex", QWEN_RETIRED_PREVIEW_MODEL_ID)).toBeUndefined();
  });

  it("never resolves inherited object keys from persisted strings", () => {
    expect(retiredModelReplacement("constructor", "toString")).toBeUndefined();
    expect(retiredModelReplacement("qwen", "__proto__")).toBeUndefined();
    expect(retiredModelReplacement("qwen", "hasOwnProperty")).toBeUndefined();
  });

  it("only registers replacements that are not themselves retired", () => {
    for (const [agentKind, models] of Object.entries(RETIRED_MODEL_REPLACEMENTS)) {
      for (const replacement of Object.values(models)) {
        expect(retiredModelReplacement(agentKind, replacement)).toBeUndefined();
      }
    }
  });
});
