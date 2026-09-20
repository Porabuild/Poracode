import { z } from "zod";

// Version 2 is the host-declared service-capabilities boundary (V5 plan 1.2 /
// finding H6): the describe result renames its operation list to
// `operations` and gains the closed `capabilities` object declaring which
// host services this authority actually composes. A version-1 peer rejects a
// version-2 request/reply on the literal version check, and a version-2 peer
// rejects a version-1 peer the same way — there is no cross-version describe.
export const HOST_CONTROL_PROTOCOL_VERSION = 2;
export const HOST_CONTROL_DISCOVERY_VERSION = 1;
export const HOST_CONTROL_DISCOVERY_FILE = "host-control.json";
export const HOST_CONTROL_MAX_REQUEST_BYTES = 4_096;
export const HOST_CONTROL_MAX_RESPONSE_BYTES = 16_384;

const rootSchema = z.string().min(1).max(4_096);
const endpointSchema = z
  .string()
  .max(8_192)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  });

export const hostControlDiscoverySchema = z.strictObject({
  formatVersion: z.literal(HOST_CONTROL_DISCOVERY_VERSION),
  profileNamespace: rootSchema,
  dataRoot: rootSchema,
  ownerGeneration: z.uuid(),
  transport: z.strictObject({
    kind: z.literal("http-loopback"),
    port: z.int().min(1).max(65_535),
  }),
  token: z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u),
});
export type HostControlDiscovery = z.infer<typeof hostControlDiscoverySchema>;

/**
 * Host-declared service capabilities (V5 plan 1.2): what THIS host actually
 * composes, published on every describe so clients derive availability from
 * negotiated data instead of inferring it from the host mode. Every consumer
 * must treat `false` (or an unreadable/older host) as "not offered" and fail
 * closed; no capability carries a degradation promise.
 */
/**
 * Every flag is optional-with-default-false on the wire (V6 round-2 fix): a
 * host may omit any subset and the describe/control payloads still parse —
 * native decoders and the TS `describeHost` lenient path both converge on
 * fail-closed `false`. Emitting the flags explicitly remains the canonical
 * form hosts use today.
 */
export const hostServiceCapabilitiesSchema = z.strictObject({
  /** SSH environment management (connect, tunnels, runtime staging). */
  ssh: z.boolean().default(false),
  /** Embedded browser panel backed by WebContentsView (Electron shell only). */
  browserPanel: z.boolean().default(false),
  /** External-Chrome bridge plus its `chrome` MCP ingress. */
  chromeBridge: z.boolean().default(false),
  /** Computer-use MCP ingress with a usable driver for this platform. */
  computerUse: z.boolean().default(false),
  /** OS-backed secret sealing (safeStorage); file-based custody is `false`. */
  nativeSecrets: z.boolean().default(false),
  /** Raw TCP port-forward gateway exposed beside the remote server. */
  portForward: z.boolean().default(false),
  /**
   * Host-driven auto-update (Electron updater / install-update). Defaulted so
   * a version-2 control describe without the field still parses (V6 C.3).
   */
  autoUpdate: z.boolean().default(false),
  /** OS notification surface on this host. Defaulted like `autoUpdate`. */
  osNotifications: z.boolean().default(false),
});
export type HostServiceCapabilities = z.infer<typeof hostServiceCapabilitiesSchema>;

/** Fail-closed set: nothing is offered. */
export const UNKNOWN_HOST_SERVICE_CAPABILITIES: HostServiceCapabilities = {
  ssh: false,
  browserPanel: false,
  chromeBridge: false,
  computerUse: false,
  nativeSecrets: false,
  portForward: false,
  autoUpdate: false,
  osNotifications: false,
};

export function hostServiceCapabilities(
  overrides: Partial<HostServiceCapabilities> = {},
): HostServiceCapabilities {
  return { ...UNKNOWN_HOST_SERVICE_CAPABILITIES, ...overrides };
}

/** Authenticated GET /api/host/describe body (V6 C.2). */
export const remoteHostDescribeSchema = z.strictObject({
  capabilities: hostServiceCapabilitiesSchema,
});
export type RemoteHostDescribe = z.infer<typeof remoteHostDescribeSchema>;

export const hostDescriptionSchema = z.strictObject({
  profileNamespace: rootSchema,
  dataRoot: rootSchema,
  mode: z.enum(["headless", "desktop"]),
  state: z.enum(["starting", "ready", "stopping"]),
  /** Management operations this control surface serves (closed list). */
  operations: z.array(z.enum(["describe", "issue-pairing"])).max(2),
  /** Host-declared service availability; see {@link hostServiceCapabilitiesSchema}. */
  capabilities: hostServiceCapabilitiesSchema,
  remoteProtocolVersion: z.int().positive(),
  endpoint: endpointSchema.nullable(),
});
export type HostDescription = z.infer<typeof hostDescriptionSchema>;

const requestBase = {
  version: z.literal(HOST_CONTROL_PROTOCOL_VERSION),
  requestId: z.uuid(),
  ownerGeneration: z.uuid(),
};
export const hostControlRequestSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    ...requestBase,
    operation: z.literal("describe"),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...requestBase,
    operation: z.literal("issue-pairing"),
    payload: z.strictObject({
      preset: z.enum(["operator", "viewer"]).optional(),
    }),
  }),
]);
export type HostControlRequest = z.infer<typeof hostControlRequestSchema>;

export const hostControlPairingResultSchema = z.strictObject({
  pairingUrl: z.url().max(8_192),
});
export const hostControlErrorCodeSchema = z.enum([
  "invalid-request",
  "generation-mismatch",
  "not-ready",
  "stopping",
  "capacity",
  "unavailable",
]);
const replyBase = {
  version: z.literal(HOST_CONTROL_PROTOCOL_VERSION),
  requestId: z.uuid(),
  ownerGeneration: z.uuid(),
};
export const hostControlReplySchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ...replyBase,
    ok: z.literal(true),
    result: z.union([hostDescriptionSchema, hostControlPairingResultSchema]),
  }),
  z.strictObject({
    ...replyBase,
    ok: z.literal(false),
    error: z.strictObject({ code: hostControlErrorCodeSchema }),
  }),
]);
export type HostControlReply = z.infer<typeof hostControlReplySchema>;
