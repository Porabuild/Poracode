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
  DEFAULT_MAX_CONCURRENT_INGRESS_WORK_PER_SOURCE,
  DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY,
  DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY_PER_SOURCE,
  firstHostHeaderValue,
  ingressControlRouteSuffix,
  resolveControlReserve,
  type IngressWorkClass,
  type RemoteAccessServerHost,
  type RemoteAccessServerOptions,
} from "./remoteAccessServerTypes";

export function resolveIngressAdmissionLimits(options: RemoteAccessServerOptions): {
  readonly maxConcurrentIngressWork: number;
  readonly maxConcurrentIngressWorkPerSource: number;
  readonly reservedIngressControlCapacity: number;
  readonly reservedIngressControlCapacityPerSource: number;
} {
  const maxConcurrentIngressWork =
    options.maxConcurrentIngressWork ?? DEFAULT_MAX_CONCURRENT_INGRESS_WORK;
  const maxConcurrentIngressWorkPerSource =
    options.maxConcurrentIngressWorkPerSource ?? DEFAULT_MAX_CONCURRENT_INGRESS_WORK_PER_SOURCE;
  if (!Number.isSafeInteger(maxConcurrentIngressWork) || maxConcurrentIngressWork <= 0) {
    throw new Error("maxConcurrentIngressWork must be a positive safe integer.");
  }
  if (
    !Number.isSafeInteger(maxConcurrentIngressWorkPerSource) ||
    maxConcurrentIngressWorkPerSource <= 0
  ) {
    throw new Error("maxConcurrentIngressWorkPerSource must be a positive safe integer.");
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
): Promise<T> {
  if (host.stopping) {
    return Promise.reject(new RemoteHttpError("host_stopping", "The host is stopping.", 503));
  }
  // Reserved control capacity, not reordering: bulk fills only the
  // non-reserved portion of the same semaphore, so under bulk saturation a
  // Stop/approval request still finds free slots, while already-admitted
  // work keeps its continuation order and every absolute maximum still
  // bounds both classes (a control flood hits the same global ceiling).
  const globalCeiling =
    workClass === "control" ? host.maxConcurrentIngressWork : bulkIngressCeiling(host);
  if (host.ingressWorkCount >= globalCeiling) {
    return Promise.reject(
      new RemoteHttpError("host_busy", "The host is busy with other requests; retry shortly.", 503),
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
      ),
    );
  }
  host.ingressWorkCount += 1;
  if (source !== undefined) host.ingressWorkBySource.set(source, sourceCount + 1);
  return host.work.run(operation).finally(() => {
    host.ingressWorkCount -= 1;
    if (source !== undefined) {
      const next = (host.ingressWorkBySource.get(source) ?? 1) - 1;
      if (next > 0) host.ingressWorkBySource.set(source, next);
      else host.ingressWorkBySource.delete(source);
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
): IngressWorkClass {
  if (req.method !== "POST") return "bulk";
  const hostHeader = firstHostHeaderValue(req.headers.host);
  if (hostHeader && isForwardChildAuthority(host, hostHeader)) return "bulk";
  if (
    req.headers[FORWARD_DISPATCH_ID_HEADER] !== undefined ||
    req.headers[FORWARD_DISPATCH_ORIGIN_HEADER] !== undefined
  ) {
    return "bulk";
  }
  try {
    const { pathname } = new URL(req.url ?? "/", "http://poracode.invalid");
    return ingressControlRouteSuffix(pathname) === null ? "bulk" : "control";
  } catch {
    return "bulk";
  }
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
