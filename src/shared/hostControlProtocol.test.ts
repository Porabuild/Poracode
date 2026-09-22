import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  HOST_CONTROL_PROTOCOL_VERSION,
  hostControlReplySchema,
  hostControlRequestSchema,
  hostControlStatusResultSchema,
  hostDescriptionSchema,
} from "./hostControlProtocol";

const request = {
  version: HOST_CONTROL_PROTOCOL_VERSION,
  requestId: randomUUID(),
  ownerGeneration: randomUUID(),
  operation: "describe",
  payload: {},
};
const capabilities = {
  ssh: true,
  browserPanel: false,
  chromeBridge: true,
  computerUse: true,
  nativeSecrets: false,
  portForward: true,
  autoUpdate: false,
  osNotifications: false,
};
const description = {
  profileNamespace: "/profile",
  dataRoot: "/profile.host-v1",
  mode: "headless",
  state: "ready",
  operations: ["describe", "issue-pairing"],
  capabilities,
  remoteProtocolVersion: 12,
  endpoint: "https://example.test/s/host/",
};

describe("owner management contract", () => {
  it("accepts closed operations and preserves a legitimate endpoint base path", () => {
    expect(hostControlRequestSchema.parse(request)).toEqual(request);
    expect(
      hostControlRequestSchema.parse({ ...request, operation: "issue-pairing" }).operation,
    ).toBe("issue-pairing");
    expect(
      hostControlRequestSchema.parse({
        ...request,
        operation: "issue-pairing",
        payload: {},
      }).payload,
    ).toEqual({});
    expect(
      hostControlRequestSchema.parse({
        ...request,
        operation: "issue-pairing",
        payload: { preset: "viewer" },
      }).payload,
    ).toEqual({ preset: "viewer" });
    expect(hostDescriptionSchema.parse(description).endpoint).toBe(description.endpoint);
  });

  it("accepts a pre-C.3 describe payload without autoUpdate/osNotifications", () => {
    const { autoUpdate, osNotifications, ...legacy } = capabilities;
    expect(
      hostDescriptionSchema.parse({ ...description, capabilities: legacy }).capabilities,
    ).toEqual(capabilities);
    expect(autoUpdate).toBe(false);
    expect(osNotifications).toBe(false);
  });

  it("describes host-declared service capabilities as a closed boolean set", () => {
    expect(hostDescriptionSchema.parse(description).capabilities).toEqual(capabilities);
    expect(
      hostDescriptionSchema.safeParse({
        ...description,
        capabilities: { ...capabilities, extra: true },
      }).success,
    ).toBe(false);
    expect(
      hostDescriptionSchema.safeParse({ ...description, capabilities: { ...capabilities, ssh: 1 } })
        .success,
    ).toBe(false);
    // Round-2: every flag is optional-with-default-false on the wire, so an
    // explicitly undefined flag parses and fails closed; unknown keys and
    // non-boolean values stay rejected.
    const lenient = hostDescriptionSchema.safeParse({
      ...description,
      capabilities: { ...capabilities, portForward: undefined },
    });
    expect(lenient.success).toBe(true);
    expect(lenient.success && lenient.data.capabilities.portForward).toBe(false);
  });

  it.each([
    { version: HOST_CONTROL_PROTOCOL_VERSION - 1 },
    { version: HOST_CONTROL_PROTOCOL_VERSION + 1 },
    { ownerGeneration: undefined },
    { operation: "attach" },
    { operation: "call-database" },
    { payload: { baseDir: "/other" } },
    { actor: "administrator" },
  ])("refuses incompatible or expanded requests (%j)", (changed) => {
    expect(hostControlRequestSchema.safeParse({ ...request, ...changed }).success).toBe(false);
  });

  it("rejects a version-1 peer on both directions of the capabilities boundary", () => {
    // Old reader -> new host: a version-1 describe request is refused, so a
    // pre-capabilities client can never read version-2 semantics loosely.
    const v1Request = { ...request, version: 1 };
    expect(hostControlRequestSchema.safeParse(v1Request).success).toBe(false);
    // Old builder -> new reader: the version-1 describe shape (no
    // capabilities object, operation list still named `capabilities`) fails
    // the version-2 schema loudly instead of degrading.
    const v1Description = {
      profileNamespace: description.profileNamespace,
      dataRoot: description.dataRoot,
      mode: "headless",
      state: "ready",
      capabilities: ["describe", "issue-pairing"],
      remoteProtocolVersion: 12,
      endpoint: description.endpoint,
    };
    expect(hostDescriptionSchema.safeParse(v1Description).success).toBe(false);
    const v1Reply = {
      version: 1,
      requestId: request.requestId,
      ownerGeneration: request.ownerGeneration,
      ok: true,
      result: v1Description,
    };
    expect(hostControlReplySchema.safeParse(v1Reply).success).toBe(false);
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
      version: HOST_CONTROL_PROTOCOL_VERSION,
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

  describe("D4 upgrade identity operations", () => {
    const build = {
      version: "1.8.1",
      sourceRevision: null,
      entrypointSha256: "a".repeat(64),
      root: "/opt/poracode/releases/release-fixture",
      layoutKind: "prefix",
    };
    const statusResult = {
      profileNamespace: description.profileNamespace,
      dataRoot: description.dataRoot,
      mode: "headless",
      state: "starting",
      admission: "held",
      endpoint: null,
      build,
    };

    it("accepts the additive status and admit operations under version 2", () => {
      expect(
        hostControlRequestSchema.parse({ ...request, operation: "status", payload: {} }),
      ).toMatchObject({ operation: "status", payload: {} });
      expect(
        hostControlRequestSchema.parse({
          ...request,
          operation: "admit",
          payload: { expectedVersion: "1.8.1", expectedEntrypointSha256: "a".repeat(64) },
        }),
      ).toMatchObject({ operation: "admit" });
      // An admit without the expected identity can never release admission.
      expect(
        hostControlRequestSchema.safeParse({ ...request, operation: "admit", payload: {} }).success,
      ).toBe(false);
      expect(
        hostControlRequestSchema.safeParse({
          ...request,
          operation: "admit",
          payload: { expectedVersion: "1.8.1", expectedEntrypointSha256: "not-a-digest" },
        }).success,
      ).toBe(false);
    });

    it("keeps the strict describe shape unchanged for older local peers", () => {
      // The operation list stays at its historical two entries: a pre-D4 peer
      // parses a new owner's describe, and discovers status/admit by trying.
      expect(hostDescriptionSchema.parse(description).operations).toEqual([
        "describe",
        "issue-pairing",
      ]);
      expect(
        hostDescriptionSchema.safeParse({ ...description, operations: ["describe", "status"] })
          .success,
      ).toBe(false);
    });

    it("round-trips the status result and rejects a widened identity", () => {
      expect(hostControlStatusResultSchema.parse(statusResult)).toEqual(statusResult);
      expect(
        hostControlStatusResultSchema.safeParse({ ...statusResult, admission: "maybe" }).success,
      ).toBe(false);
      expect(
        hostControlStatusResultSchema.safeParse({
          ...statusResult,
          build: { ...build, entrypointSha256: "short" },
        }).success,
      ).toBe(false);
      const reply = {
        version: HOST_CONTROL_PROTOCOL_VERSION,
        requestId: request.requestId,
        ownerGeneration: request.ownerGeneration,
        ok: true,
        result: statusResult,
      };
      expect(hostControlReplySchema.parse(reply)).toEqual(reply);
    });

    it("exposes identity refusal codes without free-form detail", () => {
      for (const code of ["identity-mismatch", "not-staging"]) {
        const reply = {
          version: HOST_CONTROL_PROTOCOL_VERSION,
          requestId: request.requestId,
          ownerGeneration: request.ownerGeneration,
          ok: false,
          error: { code },
        };
        expect(hostControlReplySchema.parse(reply)).toEqual(reply);
      }
    });
  });
});
