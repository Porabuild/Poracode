import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  hostControlReplySchema,
  hostControlRequestSchema,
  hostDescriptionSchema,
} from "./hostControlProtocol";

const request = {
  version: 1,
  requestId: randomUUID(),
  ownerGeneration: randomUUID(),
  operation: "describe",
  payload: {},
};
const description = {
  profileNamespace: "/profile",
  dataRoot: "/profile.host-v1",
  mode: "headless",
  state: "ready",
  capabilities: ["describe", "issue-pairing"],
  remoteProtocolVersion: 12,
  endpoint: "https://example.test/s/host/",
};

describe("owner management contract", () => {
  it("accepts closed operations and preserves a legitimate endpoint base path", () => {
    expect(hostControlRequestSchema.parse(request)).toEqual(request);
    expect(
      hostControlRequestSchema.parse({ ...request, operation: "issue-pairing" }).operation,
    ).toBe("issue-pairing");
    expect(hostDescriptionSchema.parse(description).endpoint).toBe(description.endpoint);
  });

  it.each([
    { version: 0 },
    { version: 2 },
    { ownerGeneration: undefined },
    { operation: "attach" },
    { operation: "call-database" },
    { payload: { baseDir: "/other" } },
    { actor: "administrator" },
  ])("refuses incompatible or expanded requests (%j)", (changed) => {
    expect(hostControlRequestSchema.safeParse({ ...request, ...changed }).success).toBe(false);
  });

  it.each([
    "https://user:password@example.test/s/host/",
    "https://example.test/s/host/?token=secret",
    "https://example.test/s/host/#token=secret",
    "file:///profile",
  ])("does not advertise credential-bearing or non-HTTP endpoints (%s)", (endpoint) => {
    expect(hostDescriptionSchema.safeParse({ ...description, endpoint }).success).toBe(false);
  });

  it("requires correlated, closed replies with no secret-bearing error details", () => {
    const reply = {
      version: 1,
      requestId: request.requestId,
      ownerGeneration: request.ownerGeneration,
      ok: false,
      error: { code: "not-ready" },
    };
    expect(hostControlReplySchema.parse(reply)).toEqual(reply);
    expect(
      hostControlReplySchema.safeParse({
        ...reply,
        error: { code: "unavailable", message: "sensitive detail" },
      }).success,
    ).toBe(false);
    expect(hostControlReplySchema.safeParse({ ...reply, ownerGeneration: undefined }).success).toBe(
      false,
    );
  });
});
