import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  environmentPublicProjectionSchema,
  type EnvironmentPublicProjection,
} from "@/shared/environments";
import type { RemoteAccessScope, RemoteWebSocketTicketResult } from "@/shared/remote";
import type {
  EnvironmentServiceAcceptTrustInput,
  EnvironmentServiceCreateInput,
  EnvironmentServiceUpgradeInput,
} from "@/host/environments/environmentRuntimeService";
import type { EnvironmentUpdateInput } from "@/host/environments/EnvironmentStore";
import { EnvironmentRuntimeError } from "@/host/environments/environmentRuntimeErrors";
import { EnvironmentStoreBusyError } from "@/host/environments/environmentStoreErrors";
import { RemoteHttpError } from "../auth";
import { ENVIRONMENT_MANAGEMENT_ROUTE_HANDLERS } from "../server/httpRouteHandlers.environments";
import { writeError } from "../server/httpResponses";
import {
  ENVIRONMENT_MANAGEMENT_RUNTIME_CONFORMANCE,
  ENVIRONMENT_MANAGEMENT_TICKET_MINTER_CONFORMANCE,
  createEnvironmentManagementHandlers,
  type EnvironmentManagementAdoptLegacyInput,
  type EnvironmentManagementCall,
  type EnvironmentManagementHandlers,
  type EnvironmentManagementRuntime,
  type EnvironmentManagementTrustProbeResult,
  type EnvironmentManagementTicketMinter,
} from "./environmentManagement";
import {
  ENVIRONMENT_MANAGEMENT_ROUTE_IDS,
  type EnvironmentManagementRouteId,
} from "@/shared/remote/contract/routes/environments";

const ENVIRONMENT_ID = "8f14e45f-ea0e-4f55-9b6a-7c1f0f2a5d31";
const REVISION = 7;
const CHILD_DESKTOP_ID = "child-desktop-1";
const FINGERPRINT = `SHA256:${"A".repeat(43)}`;

function projection(
  overrides: Partial<EnvironmentPublicProjection> = {},
): EnvironmentPublicProjection {
  return environmentPublicProjectionSchema.parse({
    environmentId: ENVIRONMENT_ID,
    revision: REVISION,
    label: "Build box",
    target: "deploy@example.test",
    port: 2222,
    trust: { state: "observed", observedFingerprint: FINGERPRINT },
    runtime: { hash: "a".repeat(64) },
    credential: "none",
    legacyConnectionIds: [],
    desired: "enabled",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    state: "disconnected",
    ...overrides,
  });
}

interface ErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string };
}

class FakeResponse {
  statusCode = 200;
  readonly headers = new Map<string, string>();
  private readonly chunks: string[] = [];

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  appendHeader(name: string, value: string): void {
    this.setHeader(name, value);
  }

  end(body?: string | Buffer): void {
    if (body !== undefined) this.chunks.push(body.toString());
  }

  get text(): string {
    return this.chunks.join("");
  }

  get json(): Record<string, unknown> & ErrorBody {
    return JSON.parse(this.text) as Record<string, unknown> & ErrorBody;
  }
}

interface InvokeOptions {
  readonly params?: Readonly<Record<string, string>>;
  readonly scopes?: readonly RemoteAccessScope[] | null;
  readonly bearerToken?: string | null;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

interface Invoked {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly headers: Map<string, string>;
}

function errorCode(result: Invoked): string | undefined {
  const error = result.body.error;
  if (error === null || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

async function invoke(
  handlers: EnvironmentManagementHandlers,
  routeId: EnvironmentManagementRouteId,
  options: InvokeOptions = {},
): Promise<Invoked> {
  const payload = options.body === undefined ? [] : [JSON.stringify(options.body)];
  const req = Readable.from(payload) as unknown as IncomingMessage;
  const res = new FakeResponse();
  const call: EnvironmentManagementCall = {
    req,
    res: res as unknown as ServerResponse,
    url: new URL(`http://localhost/api/environments`),
    params: options.params ?? { environmentId: ENVIRONMENT_ID },
    session: options.scopes === null ? null : { scopes: options.scopes ?? ["session:read"] },
    bearerToken: options.bearerToken === undefined ? "parent-token" : options.bearerToken,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
  try {
    await handlers[routeId](call);
  } catch (error) {
    writeError(res as unknown as ServerResponse, error);
  }
  return { status: res.statusCode, body: res.json, headers: res.headers };
}

interface RecordedCall {
  readonly method: string;
  readonly input?: unknown;
}

interface EnvironmentManagementSignals {
  connect?: AbortSignal | undefined;
  pairing?: AbortSignal | undefined;
  probeTrust?: AbortSignal | undefined;
  acceptTrust?: AbortSignal | undefined;
  upgrade?: AbortSignal | undefined;
}

class FakeRuntime implements EnvironmentManagementRuntime {
  readonly calls: RecordedCall[] = [];
  readonly signals: EnvironmentManagementSignals = {};
  list: EnvironmentPublicProjection[] = [projection()];
  readonly probe: EnvironmentManagementTrustProbeResult = {
    fingerprint: FINGERPRINT,
    keyType: "ssh-ed25519",
    host: "private-host.internal",
    port: 2222,
    lookupName: "private-lookup-name",
  };
  private readonly failures = new Map<string, Error>();

  failOn(method: string, error: Error): void {
    this.failures.set(method, error);
  }

  called(method: string): RecordedCall | undefined {
    return this.calls.find((call) => call.method === method);
  }

  private record(method: string, input?: unknown): void {
    const failure = this.failures.get(method);
    if (failure !== undefined) throw failure;
    this.calls.push(input === undefined ? { method } : { method, input });
  }

  listPublic(): readonly EnvironmentPublicProjection[] {
    this.record("listPublic");
    return this.list;
  }

  getPublic(environmentId: string): EnvironmentPublicProjection | undefined {
    this.record("getPublic", environmentId);
    return this.list.find((item) => item.environmentId === environmentId);
  }

  async create(input: EnvironmentServiceCreateInput): Promise<EnvironmentPublicProjection> {
    this.record("create", input);
    return projection();
  }

  async update(input: EnvironmentUpdateInput): Promise<EnvironmentPublicProjection> {
    this.record("update", input);
    return projection();
  }

  async delete(input: {
    readonly environmentId: string;
    readonly expectedRevision: number;
  }): Promise<void> {
    this.record("delete", input);
  }

  async adoptLegacy(
    input: EnvironmentManagementAdoptLegacyInput,
  ): Promise<EnvironmentPublicProjection> {
    this.record("adoptLegacy", input);
    return projection();
  }

  async probeTrust(
    environmentId: string,
    signal?: AbortSignal,
  ): Promise<EnvironmentManagementTrustProbeResult> {
    this.record("probeTrust", environmentId);
    this.signals.probeTrust = signal;
    return this.probe;
  }

  async acceptTrust(
    input: EnvironmentServiceAcceptTrustInput,
    signal?: AbortSignal,
  ): Promise<EnvironmentPublicProjection> {
    this.record("acceptTrust", input);
    this.signals.acceptTrust = signal;
    return projection();
  }

  async connect(
    environmentId: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<EnvironmentPublicProjection> {
    this.record("connect", environmentId);
    this.signals.connect = options?.signal;
    return projection({ state: "connected" });
  }

  async pairing(
    environmentId: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<{
    readonly environmentId: string;
    readonly endpoint: string;
    readonly pairingCredential: string;
    readonly childDesktopId: string;
  }> {
    this.record("pairing", environmentId);
    this.signals.pairing = options?.signal;
    return {
      environmentId: ENVIRONMENT_ID,
      endpoint: `/api/environments/${ENVIRONMENT_ID}/proxy/`,
      pairingCredential: "one-time-child-credential",
      childDesktopId: CHILD_DESKTOP_ID,
    };
  }

  async disconnect(environmentId: string): Promise<EnvironmentPublicProjection> {
    this.record("disconnect", environmentId);
    return projection();
  }

  async upgrade(input: EnvironmentServiceUpgradeInput): Promise<EnvironmentPublicProjection> {
    this.record("upgrade", input);
    this.signals.upgrade = input.signal;
    return projection({ revision: REVISION + 1 });
  }
}

class FakeTicketMinter implements EnvironmentManagementTicketMinter {
  readonly calls: Array<{ parentAccessToken: string; environmentId: string }> = [];

  mintWebSocketTicket(input: {
    readonly parentAccessToken: string;
    readonly environmentId: string;
  }): RemoteWebSocketTicketResult {
    this.calls.push({ ...input });
    return { ticket: "parent-ticket", expiresAt: "2026-09-20T10:00:00.000Z" };
  }
}

function harness(): {
  readonly runtime: FakeRuntime;
  readonly tickets: FakeTicketMinter;
  readonly handlers: EnvironmentManagementHandlers;
} {
  const runtime = new FakeRuntime();
  const tickets = new FakeTicketMinter();
  return { runtime, tickets, handlers: createEnvironmentManagementHandlers({ runtime, tickets }) };
}

const VIEWER: readonly RemoteAccessScope[] = ["session:read", "terminal:read"];
const OPERATOR: readonly RemoteAccessScope[] = ["session:read", "session:operate", "ports:forward"];
const MANAGER: readonly RemoteAccessScope[] = [
  "session:read",
  "session:operate",
  "ports:forward",
  "projects:manage",
];

const READ_ROUTES: readonly EnvironmentManagementRouteId[] = [
  "environment-list",
  "environment-get",
];
const USE_ROUTES: readonly EnvironmentManagementRouteId[] = [
  "environment-connect",
  "environment-disconnect",
  "environment-pairing",
  "environment-websocket-ticket",
];
const MANAGE_ROUTES: readonly EnvironmentManagementRouteId[] = [
  "environment-create",
  "environment-update",
  "environment-delete",
  "environment-upgrade",
  "environment-trust-probe",
  "environment-trust-accept",
  "environment-adopt-legacy",
];

describe("environment management conformance", () => {
  it("keeps the real runtime service and proxy gateway structurally compatible", () => {
    expect(ENVIRONMENT_MANAGEMENT_RUNTIME_CONFORMANCE).toBe(true);
    expect(ENVIRONMENT_MANAGEMENT_TICKET_MINTER_CONFORMANCE).toBe(true);
  });

  it("binds every registry route id to a dispatcher handler key", () => {
    expect(Object.keys(ENVIRONMENT_MANAGEMENT_ROUTE_HANDLERS).sort()).toEqual(
      [...ENVIRONMENT_MANAGEMENT_ROUTE_IDS].sort(),
    );
  });

  it("fails every uncomposed route closed with a bounded 503", async () => {
    for (const routeId of ENVIRONMENT_MANAGEMENT_ROUTE_IDS) {
      let thrown: unknown;
      try {
        await ENVIRONMENT_MANAGEMENT_ROUTE_HANDLERS[routeId]({ ctx: { options: {} } } as never);
      } catch (error) {
        thrown = error;
      }
      expect(`${routeId} ${thrown instanceof Error ? thrown.name : "not-error"}`).toBe(
        `${routeId} RemoteHttpError`,
      );
      const httpError = thrown as RemoteHttpError;
      expect(`${routeId} ${String(httpError.code)}`).toBe(
        `${routeId} environment_management_unavailable`,
      );
      expect(`${routeId} ${String(httpError.status)}`).toBe(`${routeId} 503`);
    }
  });
});

describe("environment management authorization", () => {
  it("denies a viewer token on every use and manage route before any runtime call", async () => {
    for (const routeId of [...USE_ROUTES, ...MANAGE_ROUTES]) {
      const { runtime, tickets, handlers } = harness();
      const result = await invoke(handlers, routeId, { scopes: VIEWER, body: {} });
      expect(`${routeId} ${result.status} ${String(errorCode(result))}`).toBe(
        `${routeId} 403 missing_scope`,
      );
      expect(runtime.calls).toEqual([]);
      expect(tickets.calls).toEqual([]);
    }
  });

  it("denies an operator token on manage routes and a manager token on nothing", async () => {
    for (const routeId of MANAGE_ROUTES) {
      const { runtime, handlers } = harness();
      const denied = await invoke(handlers, routeId, { scopes: OPERATOR, body: {} });
      expect(`${routeId} ${denied.status}`).toBe(`${routeId} 403`);
      expect(runtime.calls).toEqual([]);
    }
    const { runtime, handlers } = harness();
    const allowed = await invoke(handlers, "environment-trust-probe", { scopes: MANAGER });
    expect(allowed.status).toBe(200);
    expect(runtime.called("probeTrust")).toBeDefined();
  });

  it("denies an unauthenticated (null session) caller on every route", async () => {
    for (const routeId of [...READ_ROUTES, ...USE_ROUTES, ...MANAGE_ROUTES]) {
      const { runtime, handlers } = harness();
      const result = await invoke(handlers, routeId, { scopes: null, body: {} });
      expect(`${routeId} ${result.status}`).toBe(`${routeId} 403`);
      expect(runtime.calls).toEqual([]);
    }
  });
});

describe("environment management reads", () => {
  it("lists redacted projections for a viewer", async () => {
    const { handlers } = harness();
    const result = await invoke(handlers, "environment-list", { scopes: VIEWER });
    expect(result.status).toBe(200);
    const environments = result.body.environments as Array<Record<string, unknown>>;
    expect(environments).toHaveLength(1);
    expect(environments[0]?.environmentId).toBe(ENVIRONMENT_ID);
    expect(environments[0]).not.toHaveProperty("credentialRef");
    expect(JSON.stringify(environments[0])).not.toContain("private");
  });

  it("returns one projection and a bounded 404 for unknown or malformed ids", async () => {
    const { runtime, handlers } = harness();
    const found = await invoke(handlers, "environment-get", { scopes: VIEWER });
    expect(found.status).toBe(200);
    expect((found.body.environment as Record<string, unknown>).environmentId).toBe(ENVIRONMENT_ID);

    runtime.list = [];
    const missing = await invoke(handlers, "environment-get", { scopes: VIEWER });
    expect(`${missing.status} ${String(errorCode(missing))}`).toBe("404 environment_not_found");

    const lookups = runtime.calls.filter((call) => call.method === "getPublic").length;
    const malformed = await invoke(handlers, "environment-get", {
      scopes: VIEWER,
      params: { environmentId: "../../etc/passwd" },
    });
    expect(malformed.status).toBe(404);
    expect(runtime.calls.filter((call) => call.method === "getPublic")).toHaveLength(lookups);
  });
});

describe("environment management CAS mutations", () => {
  it("passes expectedRevision through on config, trust, migration, and upgrade routes", async () => {
    const cases: Array<{
      readonly routeId: EnvironmentManagementRouteId;
      readonly method: string;
      readonly body: unknown;
    }> = [
      {
        routeId: "environment-update",
        method: "update",
        body: { expectedRevision: REVISION, patch: { label: "Renamed" } },
      },
      { routeId: "environment-delete", method: "delete", body: { expectedRevision: REVISION } },
      {
        routeId: "environment-trust-accept",
        method: "acceptTrust",
        body: { expectedRevision: REVISION, fingerprint: FINGERPRINT },
      },
      {
        routeId: "environment-adopt-legacy",
        method: "adoptLegacy",
        body: { expectedRevision: REVISION, legacyConnectionId: randomUUID() },
      },
      { routeId: "environment-upgrade", method: "upgrade", body: { expectedRevision: REVISION } },
    ];
    for (const testCase of cases) {
      const { runtime, handlers } = harness();
      const result = await invoke(handlers, testCase.routeId, {
        scopes: MANAGER,
        body: testCase.body,
      });
      expect(`${testCase.routeId} ${result.status}`).toBe(`${testCase.routeId} 200`);
      const recorded = runtime.called(testCase.method);
      if (recorded === undefined) throw new Error(`${testCase.method} was not called`);
      expect((recorded.input as { expectedRevision?: number }).expectedRevision).toBe(REVISION);
    }
  });

  it("rejects bodies without expectedRevision before any runtime call", async () => {
    for (const routeId of [
      "environment-update",
      "environment-delete",
      "environment-upgrade",
      "environment-trust-accept",
      "environment-adopt-legacy",
    ] as const) {
      const { runtime, handlers } = harness();
      const result = await invoke(handlers, routeId, { scopes: MANAGER, body: {} });
      expect(`${routeId} ${result.status} ${String(errorCode(result))}`).toBe(
        `${routeId} 400 invalid_request`,
      );
      expect(runtime.calls).toEqual([]);
    }
  });

  it("rejects unknown body fields (no silent credential or trust widening)", async () => {
    const { runtime, handlers } = harness();
    const result = await invoke(handlers, "environment-create", {
      scopes: MANAGER,
      body: {
        label: "Box",
        target: "host.test",
        identityFile: "/home/user/.ssh/id_ed25519",
      },
    });
    expect(`${result.status} ${String(errorCode(result))}`).toBe("400 invalid_request");
    expect(runtime.calls).toEqual([]);
  });

  it("accepts a create body with only portable reference-shaped fields", async () => {
    const { runtime, handlers } = harness();
    const result = await invoke(handlers, "environment-create", {
      scopes: MANAGER,
      body: { label: "Box", target: "deploy@example.test", credentialRef: "team-key" },
    });
    expect(result.status).toBe(200);
    expect(runtime.called("create")?.input).toEqual({
      label: "Box",
      target: "deploy@example.test",
      credentialRef: "team-key",
    });
  });
});

describe("environment management use routes", () => {
  it("connects, disconnects, and pairs through the runtime", async () => {
    const { runtime, handlers } = harness();
    const connected = await invoke(handlers, "environment-connect", { scopes: OPERATOR });
    expect(connected.status).toBe(200);
    expect((connected.body.environment as Record<string, unknown>).state).toBe("connected");

    const disconnected = await invoke(handlers, "environment-disconnect", { scopes: OPERATOR });
    expect(disconnected.status).toBe(200);
    expect(runtime.called("disconnect")).toBeDefined();

    const paired = await invoke(handlers, "environment-pairing", { scopes: OPERATOR });
    expect(paired.status).toBe(200);
    expect(paired.body.pairing).toEqual({
      environmentId: ENVIRONMENT_ID,
      endpoint: `/api/environments/${ENVIRONMENT_ID}/proxy/`,
      pairingCredential: "one-time-child-credential",
      childDesktopId: CHILD_DESKTOP_ID,
    });
    // The pairing result is passed through verbatim: no parent scope or grant
    // is added to the child credential (child scopes come from the child).
    expect(runtime.called("pairing")?.input).toBe(ENVIRONMENT_ID);
  });

  it("mints the parent WS ticket with the authenticated bearer token", async () => {
    const { tickets, handlers } = harness();
    const result = await invoke(handlers, "environment-websocket-ticket", {
      scopes: OPERATOR,
      bearerToken: "parent-access-token",
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      ticket: "parent-ticket",
      expiresAt: "2026-09-20T10:00:00.000Z",
    });
    expect(tickets.calls).toEqual([
      { parentAccessToken: "parent-access-token", environmentId: ENVIRONMENT_ID },
    ]);
  });

  it("fails the ticket route closed when no bearer token reached the handler", async () => {
    const { tickets, handlers } = harness();
    const result = await invoke(handlers, "environment-websocket-ticket", {
      scopes: OPERATOR,
      bearerToken: null,
    });
    expect(`${result.status} ${String(errorCode(result))}`).toBe("401 missing_access_token");
    expect(tickets.calls).toEqual([]);
  });
});

describe("environment management trust probe", () => {
  it("returns only the fingerprint and key type, never the resolved host or lookup name", async () => {
    const { handlers } = harness();
    const result = await invoke(handlers, "environment-trust-probe", { scopes: MANAGER });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ fingerprint: FINGERPRINT, keyType: "ssh-ed25519" });
    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain("private-host.internal");
    expect(serialized).not.toContain("private-lookup-name");
  });
});

describe("environment management cancellation", () => {
  it("forwards an optional caller signal to the cancellable operations", async () => {
    const controller = new AbortController();
    const cases: ReadonlyArray<{
      readonly routeId: EnvironmentManagementRouteId;
      readonly body?: unknown;
    }> = [
      { routeId: "environment-connect" },
      { routeId: "environment-pairing" },
      { routeId: "environment-trust-probe" },
      {
        routeId: "environment-trust-accept",
        body: { expectedRevision: REVISION, fingerprint: FINGERPRINT },
      },
      { routeId: "environment-upgrade", body: { expectedRevision: REVISION } },
    ];
    for (const testCase of cases) {
      const runtime = new FakeRuntime();
      const handlers = createEnvironmentManagementHandlers({
        runtime,
        tickets: new FakeTicketMinter(),
      });
      const result = await invoke(handlers, testCase.routeId, {
        scopes: MANAGER,
        signal: controller.signal,
        ...(testCase.body === undefined ? {} : { body: testCase.body }),
      });
      expect(`${testCase.routeId} ${result.status}`).toBe(`${testCase.routeId} 200`);
      const observed = Object.values(runtime.signals);
      expect({ route: testCase.routeId, observed }).toEqual({
        route: testCase.routeId,
        observed: [controller.signal],
      });
    }
  });

  it("maps an aborted caller operation to the bounded cancelled conflict", async () => {
    const { runtime, handlers } = harness();
    const abort = new Error("The environment operation was cancelled.");
    abort.name = "AbortError";
    runtime.failOn("connect", abort);
    const result = await invoke(handlers, "environment-connect", { scopes: OPERATOR });
    expect(`${result.status} ${String(errorCode(result))}`).toBe("409 environment_cancelled");
  });
});

describe("environment management error sanitation", () => {
  it("maps revision conflicts and store pressure to bounded retryable errors", async () => {
    const conflict = harness();
    conflict.runtime.failOn("update", new EnvironmentRuntimeError("environment/revision-conflict"));
    const conflicted = await invoke(conflict.handlers, "environment-update", {
      scopes: MANAGER,
      body: { expectedRevision: REVISION, patch: { label: "x" } },
    });
    expect(conflicted.status).toBe(409);
    expect(conflicted.body).toEqual({
      error: {
        code: "environment_revision_conflict",
        message: "The environment changed; reload it and retry.",
      },
    });

    const busy = harness();
    busy.runtime.failOn("delete", new EnvironmentStoreBusyError(64));
    const busyResult = await invoke(busy.handlers, "environment-delete", {
      scopes: MANAGER,
      body: { expectedRevision: REVISION },
    });
    expect(busyResult.status).toBe(503);
    expect(busyResult.headers.get("retry-after")).toBe("1");
    expect(errorCode(busyResult)).toBe("environment_store_busy");
    const busyMessage = (busyResult.body.error as { message?: string }).message ?? "";
    expect(busyMessage).not.toContain("64");
  });

  it("never forwards raw unknown failures as host detail", async () => {
    const { runtime, handlers } = harness();
    runtime.failOn("connect", new Error("/home/secret/.ssh/id_ed25519: denied"));
    const result = await invoke(handlers, "environment-connect", { scopes: OPERATOR });
    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: { code: "internal_error", message: "Internal server error." },
    });
    expect(JSON.stringify(result.body)).not.toContain("secret");
  });
});
