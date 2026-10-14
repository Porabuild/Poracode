import type { IncomingMessage } from "node:http";
import { RemoteHttpError } from "./auth";
import { ForwardOriginPolicy, isForwardOriginAuthority } from "./portForward/forwardOrigin";
import type { ForwardOriginIdentity } from "./portForward/forwardOriginIdentity";
import {
  FORWARD_DISPATCH_ID_HEADER,
  FORWARD_DISPATCH_ORIGIN_HEADER,
} from "./server/forwardOriginDispatch";
import {
  DEFAULT_MAX_CONCURRENT_INGRESS_WORK,
  DEFAULT_MAX_CONCURRENT_INGRESS_WORK_PER_ADDRESS,
  DEFAULT_MAX_CONCURRENT_INGRESS_WORK_PER_SOURCE,
  DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY,
  DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY_PER_SOURCE,
  classifyIngressWorkClass,
  firstHostHeaderValue,
  resolveControlReserve,
  type IngressReadClass,
  type IngressRequestClassification,
  type IngressWorkClass,
  type RemoteAccessServerHost,
  type RemoteAccessServerOptions,
} from "./remoteAccessServerTypes";

export function resolveIngressAdmissionLimits(options: RemoteAccessServerOptions): {
  readonly maxConcurrentIngressWork: number;
  readonly maxConcurrentIngressWorkPerSource: number;
  readonly maxConcurrentIngressWorkPerAddress: number;
  readonly reservedIngressControlCapacity: number;
  readonly reservedIngressControlCapacityPerSource: number;
} {
  const maxConcurrentIngressWork =
    options.maxConcurrentIngressWork ?? DEFAULT_MAX_CONCURRENT_INGRESS_WORK;
  const maxConcurrentIngressWorkPerSource =
    options.maxConcurrentIngressWorkPerSource ?? DEFAULT_MAX_CONCURRENT_INGRESS_WORK_PER_SOURCE;
  const maxConcurrentIngressWorkPerAddress =
    options.maxConcurrentIngressWorkPerAddress ?? DEFAULT_MAX_CONCURRENT_INGRESS_WORK_PER_ADDRESS;
  if (!Number.isSafeInteger(maxConcurrentIngressWork) || maxConcurrentIngressWork <= 0) {
    throw new Error("maxConcurrentIngressWork must be a positive safe integer.");
  }
  if (
    !Number.isSafeInteger(maxConcurrentIngressWorkPerSource) ||
    maxConcurrentIngressWorkPerSource <= 0
  ) {
    throw new Error("maxConcurrentIngressWorkPerSource must be a positive safe integer.");
  }
  if (
    !Number.isSafeInteger(maxConcurrentIngressWorkPerAddress) ||
    maxConcurrentIngressWorkPerAddress <= 0
  ) {
    throw new Error("maxConcurrentIngressWorkPerAddress must be a positive safe integer.");
  }
  // An explicit reservation that would consume a whole budget is a
  // configuration error and fails loudly. The DEFAULTS only reserve a slice
  // of the production-sized budgets, so when a host runs with a tiny
  // explicit budget (tests), the default reservation clamps to
  // `max - 1`: bulk always keeps at least one slot, and the admission
  // behavior for those budgets is exactly the pre-reservation behavior.
  return {
    maxConcurrentIngressWork,
    maxConcurrentIngressWorkPerSource,
    maxConcurrentIngressWorkPerAddress,
    reservedIngressControlCapacity: resolveControlReserve(
      "reservedIngressControlCapacity",
      options.reservedIngressControlCapacity,
      DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY,
      maxConcurrentIngressWork,
    ),
    reservedIngressControlCapacityPerSource: resolveControlReserve(
      "reservedIngressControlCapacityPerSource",
      options.reservedIngressControlCapacityPerSource,
      DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY_PER_SOURCE,
      maxConcurrentIngressWorkPerSource,
    ),
  };
}

export function runIngressWork<T>(
  host: RemoteAccessServerHost,
  operation: () => T | PromiseLike<T>,
  source: object | undefined = undefined,
  workClass: IngressWorkClass = "bulk",
  clientAddress: string | undefined = undefined,
): Promise<T> {
  if (host.stopping) {
    return Promise.reject(new RemoteHttpError("host_stopping", "The host is stopping.", 503));
  }
  const retryAfterMs = host.principalAdmission.limits.retryAfterMs;
  // Reserved control capacity, not reordering: bulk fills only the
  // non-reserved portion of the same semaphore, so under bulk saturation a
  // Stop/approval request still finds free slots, while already-admitted
  // work keeps its continuation order and every absolute maximum still
  // bounds both classes (a control flood hits the same global ceiling).
  const globalCeiling =
    workClass === "control" ? host.maxConcurrentIngressWork : bulkIngressCeiling(host);
  if (host.ingressWorkCount >= globalCeiling) {
    return Promise.reject(
      new RemoteHttpError(
        "host_busy",
        "The host is busy with other requests; retry shortly.",
        503,
        retryAfterMs,
      ),
    );
  }
  const sourceCount = source === undefined ? 0 : (host.ingressWorkBySource.get(source) ?? 0);
  const sourceCeiling =
    workClass === "control"
      ? host.maxConcurrentIngressWorkPerSource
      : bulkIngressPerSourceCeiling(host);
  if (source !== undefined && sourceCount >= sourceCeiling) {
    return Promise.reject(
      new RemoteHttpError(
        "host_busy",
        "This client has too much work in flight; retry shortly.",
        503,
        retryAfterMs,
      ),
    );
  }
  // B3 pre-auth address fairness (never identity): control-class work is
  // exempt so an address flooding its own bulk cannot block its own Stop; the
  // global control reserve still bounds control admission.
  const addressCount =
    clientAddress === undefined ? 0 : (host.ingressWorkByAddress.get(clientAddress) ?? 0);
  if (
    workClass !== "control" &&
    clientAddress !== undefined &&
    addressCount >= host.maxConcurrentIngressWorkPerAddress
  ) {
    return Promise.reject(
      new RemoteHttpError(
        "host_busy",
        "This client address has too much work in flight; retry shortly.",
        503,
        retryAfterMs,
      ),
    );
  }
  host.ingressWorkCount += 1;
  if (source !== undefined) host.ingressWorkBySource.set(source, sourceCount + 1);
  if (clientAddress !== undefined) host.ingressWorkByAddress.set(clientAddress, addressCount + 1);
  return host.work.run(operation).finally(() => {
    host.ingressWorkCount -= 1;
    if (source !== undefined) {
      const next = (host.ingressWorkBySource.get(source) ?? 1) - 1;
      if (next > 0) host.ingressWorkBySource.set(source, next);
      else host.ingressWorkBySource.delete(source);
    }
    if (clientAddress !== undefined) {
      const next = (host.ingressWorkByAddress.get(clientAddress) ?? 1) - 1;
      if (next > 0) host.ingressWorkByAddress.set(clientAddress, next);
      else host.ingressWorkByAddress.delete(clientAddress);
    }
  });
}

/** The ingress capacity bulk work may consume: everything except the
 * reserved control slice of the semaphore. */
function bulkIngressCeiling(host: RemoteAccessServerHost): number {
  return host.maxConcurrentIngressWork - host.reservedIngressControlCapacity;
}

/** The per-source capacity bulk work may consume. */
function bulkIngressPerSourceCeiling(host: RemoteAccessServerHost): number {
  return host.maxConcurrentIngressWorkPerSource - host.reservedIngressControlCapacityPerSource;
}

/**
 * Classifies one inbound HTTP request for admission. Control is the narrow
 * stop/answer surface (`POST /api/threads/<id>/{interrupt,close,
 * terminal/close,requests/resolve}`); forwarded-application traffic is
 * always bulk even on a control-shaped path — on a child origin every path,
 * `/api/*` included, belongs to the forwarded application. Child
 * authorities are recognized from configured ingress identities (direct +
 * registered relay) plus previously minted labels that stayed reserved
 * after a configuration change; relayed child dispatch is recognized by the
 * reserved `x-poracode-forward-{id,origin}` headers the local adapter sets
 * (relay *API* dispatch carries neither and stays classifiable).
 * Classification is fail-closed toward bulk: anything unrecognized keeps
 * exactly the pre-reservation admission behavior.
 */
export function classifyIngressRequest(
  host: RemoteAccessServerHost,
  req: IncomingMessage,
  clientAddress: string,
): IngressRequestClassification {
  const readClass = classifyIngressReadRequest(req);
  if (req.method !== "POST") return { workClass: "bulk", readClass, clientAddress };
  const hostHeader = firstHostHeaderValue(req.headers.host);
  if (hostHeader && isForwardChildAuthority(host, hostHeader)) {
    return { workClass: "bulk", readClass, clientAddress };
  }
  if (
    req.headers[FORWARD_DISPATCH_ID_HEADER] !== undefined ||
    req.headers[FORWARD_DISPATCH_ORIGIN_HEADER] !== undefined
  ) {
    return { workClass: "bulk", readClass, clientAddress };
  }
  return {
    workClass: classifyIngressWorkClass(req.method, req.url ?? "/"),
    readClass,
    clientAddress,
  };
}

/**
 * B4 read classification: labels the unbounded legacy read variants so the
 * route handlers can admit them explicitly (2 global / 1 principal + the
 * stored-byte pre-check).
 *
 * A declared request (`reads` present, whatever its value) is NEVER
 * `legacy-bulk`: `reads=bounded-v1` selects the bounded path, and any other
 * value is a protocol error the handler rejects with 400 before any read, so
 * it must not consume a bulk slot. Bounded requests are classified normal even
 * when they omit `limit`/`threadLimit` — the declared default is the bound.
 *
 * EVERY absent-`reads` request on the two legacy routes is `legacy-bulk`, even
 * when it carries `threadLimit` or `runtimePage=1`. Those parameters only bound
 * one collection of the response (a `threadLimit` snapshot still materializes
 * every project, a `runtimePage=1` history still materializes every completed
 * turn and the terminal scrollback), so the request must keep the explicit
 * admission and the stored-byte reservation. The legacy handler itself still
 * honors the parameter — the wrapper only adds admission and the pre-check.
 */
export function classifyIngressReadRequest(req: IncomingMessage): IngressReadClass {
  if (req.method !== "GET") return "normal";
  try {
    const { pathname, searchParams } = new URL(req.url ?? "/", "http://poracode.invalid");
    if (searchParams.get("reads") !== null) return "normal";
    if (pathname === "/api/snapshot") return "legacy-bulk";
    if (pathname.startsWith("/api/threads/") && pathname.endsWith("/history")) {
      return "legacy-bulk";
    }
  } catch {
    // Unparseable URLs keep the historical bulk/normal treatment.
  }
  return "normal";
}

function isForwardChildAuthority(host: RemoteAccessServerHost, authority: string): boolean {
  // A minted child label stays reserved even once its ingress configuration
  // is gone, so it must keep classifying as forwarded traffic.
  if (isForwardOriginAuthority(authority)) return true;
  for (const identity of activeForwardOriginIdentities(host)) {
    let policy = host.ingressPolicyCache.get(identity);
    if (!policy) {
      policy = new ForwardOriginPolicy(identity.baseUrl);
      host.ingressPolicyCache.set(identity, policy);
    }
    if (policy.containsHostname(authority)) return true;
  }
  return false;
}

function activeForwardOriginIdentities(host: RemoteAccessServerHost): ForwardOriginIdentity[] {
  const direct = host.options.forwardOrigin;
  const relay = host.options.getRelayForwardOrigin?.();
  return [...(direct ? [direct] : []), ...(relay ? [relay] : [])];
}
