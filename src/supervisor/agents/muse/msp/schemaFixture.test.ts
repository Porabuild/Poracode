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
    for (const method of [
      "approval/decide",
      "goal/clear",
      "goal/edit",
      "goal/pause",
      "goal/resume",
      "goal/set",
      "initialize",
      "model/list",
      "session/compact",
      "session/resume",
      "session/setApprovalMode",
      "session/setModel",
      "session/start",
      "turn/interrupt",
      "turn/start",
      "turn/steer",
      "userInput/answer",
      "userInput/cancel",
    ]) {
      expect(
        schema.methods?.[method],
        `schema fixture is missing the ${method} method`,
      ).toBeDefined();
    }
    expect(schema.notifications).toBeDefined();
  });

  it("accepts every rung of the static effort ladder", () => {
    // Subset, not equality: the static ladder is the no-probe fallback, so
    // every entry must be servable by the pinned host — but additive host
    // growth (1.3.0 added `max`) is adopted at runtime by the `--help` probe
    // and must not force the static list (which pre-growth hosts also read).
    const schema = loadSchemaFixture();
    const ladder = schema.$defs?.["ReasoningEffort"]?.enum;
    expect(Array.isArray(ladder)).toBe(true);
    for (const effort of MUSE_EFFORTS) {
      expect(ladder).toContain(effort);
    }
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
