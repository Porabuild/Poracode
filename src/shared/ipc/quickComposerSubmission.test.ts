import { describe, expect, it } from "vitest";
import { quickComposerSubmissionSchema } from "./schemas";

const base = {
  projectId: "project-1",
  input: {
    agentKind: "codex",
    config: { model: "gpt-5" },
  },
};

describe("quickComposerSubmissionSchema", () => {
  it("accepts an attachment-only submission", () => {
    const result = quickComposerSubmissionSchema.safeParse({
      ...base,
      input: {
        ...base.input,
        prompt: "",
        segments: [{ kind: "attachment", path: "C:\\shots\\one.png" }],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty prompt with no segments", () => {
    const result = quickComposerSubmissionSchema.safeParse({
      ...base,
      input: { ...base.input, prompt: "" },
    });
    expect(result.success).toBe(false);
    expect(result.success ? null : result.error.issues[0]?.path).toEqual(["input", "prompt"]);
  });

  it("rejects an empty prompt with only an empty text segment", () => {
    const result = quickComposerSubmissionSchema.safeParse({
      ...base,
      input: {
        ...base.input,
        prompt: "",
        segments: [{ kind: "text", content: "" }],
      },
    });
    expect(result.success).toBe(false);
    expect(result.success ? null : result.error.issues[0]?.path).toEqual(["input", "prompt"]);
  });

  it("preserves optional client receipts while retaining the released handoff shape", () => {
    const legacy = { ...base, input: { ...base.input, prompt: "legacy" } };
    expect(quickComposerSubmissionSchema.parse(legacy)).toEqual(legacy);
    const current = {
      ...base,
      input: {
        ...base.input,
        prompt: "current",
        threadId: "thread",
        clientSubmissionId: "receipt",
      },
    };
    expect(quickComposerSubmissionSchema.parse(current)).toEqual(current);
  });

  it("accepts a plain text prompt", () => {
    const result = quickComposerSubmissionSchema.safeParse({
      ...base,
      input: { ...base.input, prompt: "hi" },
    });
    expect(result.success).toBe(true);
  });
});
