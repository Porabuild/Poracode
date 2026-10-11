import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "./jsonSchema";
import { annotateUnknownFieldPolicy, zodObjectUnknownFieldPolicy } from "./unknownFields";

describe("unknown-field IR policy", () => {
  it("preserves strip, reject, and passthrough independently", () => {
    expect(zodObjectUnknownFieldPolicy(z.object({ a: z.string() }))).toBe("strip");
    expect(zodObjectUnknownFieldPolicy(z.object({ a: z.string() }).strict())).toBe("reject");
    expect(zodObjectUnknownFieldPolicy(z.object({ a: z.string() }).passthrough())).toBe(
      "passthrough",
    );
  });

  it("does not globally force additionalProperties false or true", () => {
    const strip = zodToJsonSchema(z.object({ a: z.string() }), "output") as {
      additionalProperties?: unknown;
      "x-poracode-unknownFields"?: string;
    };
    const reject = zodToJsonSchema(z.object({ a: z.string() }).strict(), "output") as {
      additionalProperties?: unknown;
      "x-poracode-unknownFields"?: string;
    };
    const passthrough = zodToJsonSchema(z.object({ a: z.string() }).passthrough(), "output") as {
      additionalProperties?: unknown;
      "x-poracode-unknownFields"?: string;
    };

    expect(strip["x-poracode-unknownFields"]).toBe("strip");
    expect(strip.additionalProperties).toBe(true);
    expect(reject["x-poracode-unknownFields"]).toBe("reject");
    expect(reject.additionalProperties).toBe(false);
    expect(passthrough["x-poracode-unknownFields"]).toBe("passthrough");
    expect(passthrough.additionalProperties).not.toBe(false);

    const mixed = annotateUnknownFieldPolicy({ type: "object" }, "strip");
    expect(mixed.additionalProperties).toBe(true);
    expect(annotateUnknownFieldPolicy({ type: "object" }, "reject").additionalProperties).toBe(
      false,
    );
  });
});
