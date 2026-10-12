import type { IncomingMessage } from "node:http";
import { environmentProxyPrefix } from "@/shared/environments";
import {
  copyLoopbackResponseHeaders,
  type LoopbackProxyReplacement,
} from "../server/loopbackProxy";
import type { EnvironmentProxyLegs } from "./environmentProxyLegs";
import {
  ENVIRONMENT_REDIRECT_STATUSES,
  boundedJsonFailure,
  canonicalDescriptorPath,
  isRecord,
  keepChildHttpResponseHeader,
  readBoundedIncomingBody,
} from "./environmentProxyPolicy";
import type { EnvironmentProxyBaseUrls, EnvironmentProxyTarget } from "./types";

/**
 * C1.2 parent proxy descriptor transform (E2 Cut F). Owns the child identity
 * fail-closed state and the ONLY buffered child response: only the canonical
 * descriptor path (plus one tolerated trailing-slash alias) is read, under
 * the policy module's hard byte cap + deadline, its `desktopId` must still
 * match the verified target's child identity, and its loopback `endpoints.*`
 * are rewritten to the parent proxy prefix. Any failure —
 * oversized/slow/invalid/identity mismatch — returns a bounded JSON error and
 * NEVER the unrewritten descriptor, so no loopback URL or port can leak.
 *
 * Identity mismatch is sticky per target generation: it records the
 * generation, aborts every OTHER leg for that environment, and keeps failing
 * that and subsequent requests until the runtime publishes a new generation
 * (reconnect re-verifies identity before publishing).
 */

export interface EnvironmentDescriptorTransformInput {
  readonly environmentId: string;
  readonly rawChildPath: string;
  readonly target: EnvironmentProxyTarget;
  readonly upstreamRes: IncomingMessage;
  readonly signal: AbortSignal;
  readonly currentController: AbortController;
}

export class EnvironmentDescriptorTransform {
  private readonly legs: EnvironmentProxyLegs;
  private readonly baseUrls: () => EnvironmentProxyBaseUrls;
  private readonly descriptorMaxBytes: number;
  private readonly descriptorTimeoutMs: number;
  /**
   * Environments whose live descriptor reported a child identity different
   * from the verified target, per target generation. Requests keep failing
   * closed until the runtime publishes a new generation (reconnect re-verifies
   * identity before publishing).
   */
  private readonly identityFailures = new Map<string, number>();

  constructor(options: {
    readonly legs: EnvironmentProxyLegs;
    readonly baseUrls: () => EnvironmentProxyBaseUrls;
    readonly descriptorMaxBytes: number;
    readonly descriptorTimeoutMs: number;
  }) {
    this.legs = options.legs;
    this.baseUrls = options.baseUrls;
    this.descriptorMaxBytes = options.descriptorMaxBytes;
    this.descriptorTimeoutMs = options.descriptorTimeoutMs;
  }

  /** Whether this target generation already failed the child identity check
   * (the pre-dial fence the gateway applies in `resolveTarget`). */
  hasIdentityFailure(environmentId: string, generation: number): boolean {
    return this.identityFailures.get(environmentId) === generation;
  }

  /**
   * Upstream response policy, applied before the descriptor transform: a
   * child redirect is refused with a bounded 502 (the Location header is
   * never relayed), everything else falls through to the descriptor rewrite.
   */
  async transform(
    input: EnvironmentDescriptorTransformInput,
  ): Promise<LoopbackProxyReplacement | null> {
    const { environmentId, rawChildPath, target, upstreamRes, signal, currentController } = input;
    if (ENVIRONMENT_REDIRECT_STATUSES.has(upstreamRes.statusCode ?? 0)) {
      // The rejection is written immediately; the child body is discarded
      // (never buffered) so the upstream connection can still settle.
      upstreamRes.resume();
      return boundedJsonFailure(
        "environment_redirect_unsupported",
        "The environment child requested a redirect, which the proxy does not relay.",
      );
    }
    if (canonicalDescriptorPath(rawChildPath) === null || (upstreamRes.statusCode ?? 0) !== 200) {
      return null;
    }
    const failure = (code: string, message: string): LoopbackProxyReplacement =>
      boundedJsonFailure(code, message);
    let parsed: unknown;
    try {
      const body = await readBoundedIncomingBody(
        upstreamRes,
        this.descriptorMaxBytes,
        this.descriptorTimeoutMs,
        signal,
      );
      parsed = JSON.parse(body.toString("utf8")) as unknown;
    } catch {
      return failure(
        "environment_descriptor_invalid",
        "The environment descriptor could not be read.",
      );
    }
    if (!isRecord(parsed) || !isRecord(parsed.endpoints)) {
      return failure("environment_descriptor_invalid", "The environment descriptor is invalid.");
    }
    const endpoints = parsed.endpoints;
    if (
      typeof parsed.desktopId !== "string" ||
      typeof endpoints.httpBaseUrl !== "string" ||
      typeof endpoints.wsBaseUrl !== "string"
    ) {
      return failure("environment_descriptor_invalid", "The environment descriptor is invalid.");
    }
    if (parsed.desktopId !== target.childDesktopId) {
      // The live child identity no longer matches the verified target: this
      // response fails closed, every OTHER leg for the environment is torn
      // down, and further requests fail until a new verified generation
      // appears (reconnect re-verifies identity before publishing).
      this.identityFailures.set(environmentId, target.generation);
      this.legs.abortEnvironment(environmentId, currentController);
      return failure(
        "environment_identity_changed",
        "The environment child identity changed; the tunnel was closed.",
      );
    }
    try {
      target.assertCurrent();
    } catch {
      return failure("environment_not_connected", "This environment is not connected.");
    }
    let bases: EnvironmentProxyBaseUrls;
    try {
      bases = this.baseUrls();
    } catch {
      return failure("environment_proxy_unavailable", "The environment proxy is not available.");
    }
    const prefix = environmentProxyPrefix(environmentId);
    const rewritten = {
      ...parsed,
      endpoints: {
        ...endpoints,
        httpBaseUrl: new URL(prefix, bases.httpBaseUrl).toString(),
        wsBaseUrl: new URL(prefix, bases.wsBaseUrl).toString(),
      },
    };
    const bytes = Buffer.from(JSON.stringify(rewritten), "utf8");
    const headers = copyLoopbackResponseHeaders(upstreamRes, {
      keepResponseHeader: keepChildHttpResponseHeader,
      setCookie: () => null,
    });
    headers["content-type"] = "application/json; charset=utf-8";
    headers["content-length"] = String(bytes.byteLength);
    return { status: 200, headers, body: bytes };
  }

  dispose(): void {
    this.identityFailures.clear();
  }
}
