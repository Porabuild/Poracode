import type { IncomingMessage, ServerResponse } from "node:http";
import { writeValidatedRoute } from "./contractResponse.ts";
import { generatedRoute } from "./generatedContract.ts";
import { LabHttpError } from "./labAuth.ts";
import type { LabRuntime } from "./labRuntime.ts";
import { validateRouteRequest, type ValidatedRouteRequest } from "./requestValidation.ts";
import { schemaExample } from "./schemaExamples.ts";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const SPECIAL_ROUTES = new Set(["forward-enter", "local-image", "runtime-image"]);
const MUTATION_FOLLOW_UPS: Readonly<Record<string, string>> = {
  "browser-command": "browser-state",
  "host-update-check": "host-update",
  "host-update-install": "host-update",
  "port-enter": "forward-enter",
  "port-forward": "ports-read",
  "port-unforward": "ports-read",
  "pr-watch-check": "pr-watch-read",
  "pr-watch-delete": "pr-watch-read",
  "pr-watch-upsert": "pr-watch-read",
  "profile-identity": "profile-core-stats",
  "push-register": "push-config",
  "push-unregister": "push-config",
  "request-resolve": "thread-history",
  "schedules-command": "schedules-read",
  "settings-write": "settings-read",
  "terminal-close": "thread-history",
  "terminal-resize": "thread-history",
  "terminal-start": "thread-history",
  "terminal-write": "thread-history",
};

export class LabRouteWorkspace {
  private settings: Record<string, unknown> | undefined;
  private browserState = {
    tabs: [] as Record<string, unknown>[],
    activeTabId: null as string | null,
  };
  private readonly forwards = new Map<string, Record<string, unknown>>();
  private readonly enterTokens = new Map<string, string>();
  private watch: Record<string, unknown> | null = null;
  private pushRegistered = false;
  private readonly pendingFollowUps = new Set<string>();

  reset(): void {
    this.settings = undefined;
    this.browserState = { tabs: [], activeTabId: null };
    this.forwards.clear();
    this.enterTokens.clear();
    this.watch = null;
    this.pushRegistered = false;
    this.pendingFollowUps.clear();
  }

  response(routeId: string, input: ValidatedRouteRequest): unknown {
    const body = input.body as Record<string, unknown>;
    switch (routeId) {
      case "settings-read":
        return this.settings ?? generatedJsonResponse(routeId);
      case "settings-write": {
        const baseline = this.settings ?? (generatedJsonResponse("settings-read") as object);
        const previous = (baseline as { settings: Record<string, unknown> }).settings;
        this.settings = { settings: { ...previous, ...structuredClone(body) } };
        return this.settings;
      }
      case "browser-state":
        return { state: structuredClone(this.browserState) };
      case "browser-command":
        return this.browserCommand(body);
      case "ports-read":
        return {
          detected: [{ port: 3000, protocol: "http", label: "fixture" }],
          forwards: [...this.forwards.values()],
        };
      case "port-forward":
        return this.forward(Number(body.targetPort));
      case "port-enter":
        return { enterPath: this.enterPath(String(body.id)) };
      case "port-unforward":
        this.forwards.delete(String(body.id));
        this.enterTokens.delete(String(body.id));
        return { ok: true };
      case "pr-watch-read":
        return { watch: structuredClone(this.watch) };
      case "pr-watch-upsert":
        this.watch = completeWatch(body);
        return { watch: structuredClone(this.watch) };
      case "pr-watch-delete":
        this.watch = null;
        return { ok: true };
      case "push-register":
        this.pushRegistered = true;
        return { ok: true, routing: body.routing };
      case "push-unregister":
        this.pushRegistered = false;
        return { ok: true };
      case "push-config":
        return {
          publicKey: this.pushRegistered ? "fixture-public-key-registered" : "fixture-public-key",
        };
      default:
        return generatedJsonResponse(routeId);
    }
  }

  consumeEnter(forwardId: string, token: string): boolean {
    return this.enterTokens.get(forwardId) === token;
  }

  markMutation(routeId: string): void {
    if (MUTATION_FOLLOW_UPS[routeId]) this.pendingFollowUps.add(routeId);
  }

  takeFollowUps(evidenceRouteId: string): string[] {
    const matched = [...this.pendingFollowUps].filter(
      (routeId) => MUTATION_FOLLOW_UPS[routeId] === evidenceRouteId,
    );
    for (const routeId of matched) this.pendingFollowUps.delete(routeId);
    return matched;
  }

  private browserCommand(body: Record<string, unknown>): Record<string, unknown> {
    if (body.kind === "create-tab") {
      const tabId = "tab-fixture-001";
      this.browserState.tabs.push({
        tabId,
        url: body.url ?? "https://example.test/fixture",
        title: "Fixture tab",
        loading: false,
        canGoBack: false,
        canGoForward: false,
      });
      this.browserState.activeTabId = tabId;
    }
    return { state: structuredClone(this.browserState) };
  }

  private forward(targetPort: number): Record<string, unknown> {
    const id = "forward-fixture-001";
    const forward = { id, targetPort, listenPort: 49160, createdAt: 1_786_534_980_000 };
    this.forwards.set(id, forward);
    return { forward, enterPath: this.enterPath(id) };
  }

  private enterPath(id: string): string {
    const token = `fwt-${id}`;
    this.enterTokens.set(id, token);
    return `/forward/${encodeURIComponent(id)}/enter?fwt=${encodeURIComponent(token)}`;
  }
}

export async function handleDeterministicRoute(
  runtime: LabRuntime,
  req: IncomingMessage,
  res: ServerResponse,
  routeId: string,
  url: URL,
  params: Readonly<Record<string, string>>,
): Promise<boolean> {
  if (routeId === "procedure-call" || routeId === "forward-enter") return false;
  const generated = generatedRoute(routeId);
  if (generated.response.wireKind === "procedure-result") return false;
  const input = await validateRouteRequest(req, url, routeId, params);
  if (SPECIAL_ROUTES.has(routeId)) {
    runtime.ledger.observeHttpRoute(routeId, { statusCode: 200, source: "mock" });
    res.writeHead(200, { "content-type": "image/png", "content-length": PNG_1X1.length });
    res.end(PNG_1X1);
    return true;
  }
  if (MUTATION_FOLLOW_UPS[routeId]) {
    runtime.ledger.markRequiresFollowUp("route", routeId);
    runtime.routes.markMutation(routeId);
  }
  writeValidatedRoute(runtime, res, routeId, runtime.routes.response(routeId, input));
  recordWorkspaceFollowUps(runtime, routeId);
  return true;
}

export async function handleForwardEnter(
  runtime: LabRuntime,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  params: Readonly<Record<string, string>>,
): Promise<void> {
  const input = await validateRouteRequest(req, url, "forward-enter", params);
  const forwardId = String(input.params.forwardId);
  const token = String(input.query.fwt);
  if (!runtime.routes.consumeEnter(forwardId, token)) {
    runtime.ledger.observeHttpRoute("forward-enter", { statusCode: 400, source: "negative" });
    throw new LabHttpError("invalid_forward_token", "Invalid forward-enter token.", 400);
  }
  runtime.ledger.observeHttpRoute("forward-enter", { statusCode: 302, source: "mock" });
  recordWorkspaceFollowUps(runtime, "forward-enter");
  res.writeHead(302, {
    location: "/",
    "set-cookie": "poracode_forward=fixture; Path=/; HttpOnly; SameSite=Strict",
    "content-type": "text/html; charset=utf-8",
  });
  res.end("<!doctype html><title>Forwarding</title>");
}

function generatedJsonResponse(routeId: string): unknown {
  const route = generatedRoute(routeId);
  if (!route.response.jsonSchema) {
    throw new LabHttpError(
      "unconfigured_contract_case",
      `Route ${routeId} has no authoritative JSON response schema.`,
      501,
    );
  }
  return schemaExample(route.response.jsonSchema);
}

function completeWatch(input: Record<string, unknown>): Record<string, unknown> {
  return {
    ...structuredClone(input),
    lastCommentCursor: null,
    lastReviewCommentCursor: null,
    lastReviewCursor: null,
    lastCheckKey: null,
    activeThreadId: null,
    lastError: null,
  };
}

export function recordWorkspaceFollowUps(runtime: LabRuntime, evidenceRouteId: string): void {
  for (const routeId of runtime.routes.takeFollowUps(evidenceRouteId)) {
    runtime.ledger.recordFollowUp("route", routeId, { statusCode: 200, source: "mock" });
  }
}
