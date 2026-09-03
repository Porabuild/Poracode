import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MUSE_EFFORTS } from "../detection";
import { toMspApprovalMode } from "./argv";

/**
 * Pins the MSP wire contract the client speaks: the fixture is a verbatim
 * copy of `muse schema generate-json-schema` output (see protocol.ts header
 * for the regeneration command). Fails when the installed binary's schema
 * drifts from the method/enum names used in `msp/`.
 */
function loadSchemaFixture(): {
  description?: unknown;
  methods?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
  $defs?: Record<string, { enum?: unknown }>;
} {
  const path = new URL("./fixtures/msp.schema.json", import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as ReturnType<typeof loadSchemaFixture>;
}

describe("MSP schema fixture", () => {
  it("is the pinned Muse Session Protocol v1 bundle", () => {
    const schema = loadSchemaFixture();
    expect(typeof schema.description).toBe("string");
    expect(schema.description as string).toMatch(/Muse Session Protocol \(MSP\) v1/);
  });

  it("declares every method the client uses", () => {
    const schema = loadSchemaFixture();
    for (const method of ["initialize", "model/list"]) {
      expect(
        schema.methods?.[method],
        `schema fixture is missing the ${method} method`,
      ).toBeDefined();
    }
    expect(schema.notifications).toBeDefined();
  });

  it("keeps the ReasoningEffort enum in lockstep with the static ladder", () => {
    const schema = loadSchemaFixture();
    expect(schema.$defs?.["ReasoningEffort"]?.enum).toEqual([...MUSE_EFFORTS]);
  });

  it("covers every approval mode the argv mapper can emit", () => {
    const schema = loadSchemaFixture();
    const modes = schema.$defs?.["ApprovalMode"]?.enum;
    expect(Array.isArray(modes)).toBe(true);
    for (const policy of [
      "untrusted",
      "on-request",
      "never",
      "yolo",
      "bypassPermissions",
      undefined,
      "something-new",
    ]) {
      expect(modes).toContain(toMspApprovalMode(policy));
    }
  });
});
