import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { EnvironmentPublicProjection } from "../../../src/shared/environments.ts";
import { writeValidatedRoute } from "./contractResponse.ts";
import { generatedRoute } from "./generatedContract.ts";
import { LabHttpError } from "./labAuth.ts";
import type { LabRuntime } from "./labRuntime.ts";
import { validateRouteRequest, type ValidatedRouteRequest } from "./requestValidation.ts";
import { schemaExample } from "./schemaExamples.ts";
import { CREW_FIXTURE } from "./crewFixtures.ts";
import { TRANSCRIPT_PREVIEW_IMAGE } from "../fixtures/tool-taxonomy/media-assets.ts";
import type { AgentDiscoveryFixture } from "./agentDiscoveryFixture.ts";
import type { NewsFixture } from "./newsFixture.ts";
import {
  FIXTURE_ATTACHMENT_BYTES,
  LabTranscriptMediaFixtures,
  type FixtureFileMedia,
} from "./routeMediaFixtures.ts";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const SPECIAL_ROUTES = new Set(["forward-enter", "local-image", "runtime-image", "file-media"]);
export { FIXTURE_ATTACHMENT_BYTES };
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
  constructor(
    private readonly agentDiscovery?: AgentDiscoveryFixture,
    private readonly news?: NewsFixture,
  ) {}
  private settings: Record<string, unknown> | undefined;
  private readonly agentStatusesByIdentity = new Map<string, Record<string, unknown>>();
  private browserState = {
    tabs: [] as Record<string, unknown>[],
    activeTabId: null as string | null,
  };
  private readonly forwards = new Map<string, Record<string, unknown>>();
  private readonly runtimeImages = new Map<
    string,
    { bytes: Buffer; contentType: string; attachmentName?: string }
  >();
  private readonly enterTokens = new Map<string, string>();
  private watch: Record<string, unknown> | null = null;
  private pushRegistered = false;
  private readonly pendingFollowUps = new Set<string>();
  private environments: EnvironmentPublicProjection[] | undefined;
  private readonly media = new LabTranscriptMediaFixtures();

  fileMediaForTicket(ticket: unknown): FixtureFileMedia | undefined {
    return this.media.fileMediaForTicket(ticket);
  }

  prepareTranscriptVideo(): void {
    this.media.prepareTranscriptVideo();
  }

  prepareTranscriptPdf(): void {
    this.media.prepareTranscriptPdf();
  }

  prepareTranscriptTextDownload(path: string, content: string): void {
    this.media.prepareTranscriptTextDownload(path, content);
  }

  holdAttachment(): void {
    this.media.holdAttachment();
  }

  releaseAttachment(): void {
    this.media.releaseAttachment();
  }

  async waitForAttachment(): Promise<void> {
    await this.media.waitForAttachment();
  }

  get environmentManagementEnabled(): boolean {
    return this.environments !== undefined;
  }

  prepareEnvironmentManagement(): void {
    this.environments = [];
  }

  noteAgentStatus(status: Record<string, unknown>): void {
    if (typeof status.kind === "string")
      this.agentStatusesByIdentity.set(
        JSON.stringify([status.kind, status.envKind ?? "", status.envDistro ?? ""]),
        structuredClone(status),
      );
  }

  prepareComposerTools(): void {
    const baseline = generatedJsonResponse("settings-read") as {
      settings: Record<string, unknown>;
    };
    this.settings = {
      settings: { ...baseline.settings, enabledMcpServers: { browser: false, chrome: true } },
    };
  }

  prepareCrews(): void {
    const baseline = generatedJsonResponse("settings-read") as {
      settings: Record<string, unknown>;
    };
    this.settings = {
      settings: {
        ...baseline.settings,
        providerOrder: ["codex", "fixture-reviewer"],
        crews: [structuredClone(CREW_FIXTURE)],
      },
    };
  }

  setWorktreeSettingsFixture(desktopEdited: boolean): void {
    const baseline = (this.settings ?? generatedJsonResponse("settings-read")) as {
      settings: Record<string, unknown>;
    };
    this.settings = {
      settings: {
        ...baseline.settings,
        worktreeStorageMode: desktopEdited ? "project-relative" : "global",
        worktreeBasePath: desktopEdited ? "/worktrees/host-a-desktop" : "/worktrees/host-a",
        wslWorktreeBasePath: desktopEdited ? "/worktrees/wsl-desktop" : "/worktrees/wsl-before",
      },
    };
  }

  reset(): void {
    this.media.reset();
    this.news?.reset();
    this.settings = undefined;
    this.agentStatusesByIdentity.clear();
    this.browserState = { tabs: [], activeTabId: null };
    this.forwards.clear();
    this.enterTokens.clear();
    this.watch = null;
    this.pushRegistered = false;
    this.pendingFollowUps.clear();
    this.environments = undefined;
  }

  response(routeId: string, input: ValidatedRouteRequest): unknown {
    const news = this.news?.response(routeId);
    if (news !== undefined) return news;
    const body = input.body as Record<string, unknown>;
    switch (routeId) {
      case "environment-list":
        return this.environments
          ? { environments: this.environments }
          : generatedJsonResponse(routeId);
      case "environment-create": {
        if (!this.environments) return generatedJsonResponse(routeId);
        const environment: EnvironmentPublicProjection = {
          environmentId: randomUUID(),
          revision: 1,
          label: String(body.label),
          target: String(body.target),
          ...(typeof body.port === "number" ? { port: body.port } : {}),
          credential: body.credentialRef ? "configured" : "none",
          trust: { state: "unknown" },
          runtime: { hash: "a".repeat(64) },
          legacyConnectionIds: [],
          desired: body.desired === "disabled" ? "disabled" : "enabled",
          createdAt: 1,
          updatedAt: 1,
          state: "disconnected",
        };
        this.environments.push(environment);
        return { environment };
      }
      case "environment-trust-probe": {
        if (!this.environments) return generatedJsonResponse(routeId);
        return {
          keyType: "ssh-ed25519",
          fingerprint: "SHA256:NativeE2ETrustFixtureFingerprint0123456789A",
        };
      }
      case "environment-trust-accept": {
        if (!this.environments) return generatedJsonResponse(routeId);
        const env = this.environments.find((e) => e.environmentId === input.params.environmentId);
        if (env) {
          env.revision += 1;
          env.trust = {
            state: "pinned",
            hostKeyFingerprint: "SHA256:NativeE2ETrustFixtureFingerprint0123456789A",
          };
          return { environment: env };
        }
        return generatedJsonResponse(routeId);
      }
      case "environment-upgrade": {
        if (!this.environments) return generatedJsonResponse(routeId);
        const env = this.environments.find((e) => e.environmentId === input.params.environmentId);
        if (env) {
          env.revision += 1;
          return { environment: env };
        }
        return generatedJsonResponse(routeId);
      }
      case "file-media-ticket":
        return this.media.issueTicket(body, PNG_1X1);
      case "file-media-release":
        this.media.releaseTicket(body.ticket);
        return { ok: true };
      case "settings-read":
        return this.settings ?? generatedJsonResponse(routeId);
      case "agent-statuses": {
        if (this.agentDiscovery?.enabled) return this.agentDiscovery.cachedStatuses();
        // Cached native (POSIX) record rides in the legacy `windows` array.
        // The foundation scenario emits no agent-status socket events, so a
        // native client can only hydrate its catalog through this HTTP base.
        // Capabilities match the fixture thread (gui-capable, gpt-5 model).
        const foundation = [
          {
            kind: "codex",
            label: "Codex",
            installed: true,
            authState: "authenticated",
            envKind: "posix",
            capabilities: {
              presentationModes: ["gui", "terminal"],
              models: [{ id: "gpt-5", label: "Fixture model" }],
            },
          },
        ];
        const recorded = [...this.agentStatusesByIdentity.values()];
        const native = recorded.filter((status) => status.envKind !== "wsl");
        const nativeKinds = new Set(native.map((status) => status.kind));
        return {
          updatedAt: "2026-08-12T10:03:00.000Z",
          // A reconnect must hydrate the same catalog that socket clients
          // observed, including the composer's model/effort capabilities.
          windows: [...foundation.filter((status) => !nativeKinds.has(status.kind)), ...native],
          wsl: recorded.filter((status) => status.envKind === "wsl"),
        };
      }
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
      const tabId = `tab-fixture-${String(this.browserState.tabs.length + 1).padStart(3, "0")}`;
      this.browserState.tabs.push({
        tabId,
        url: body.url ?? "https://example.test/fixture",
        title: "Fixture tab",
        loading: false,
        canGoBack: false,
        canGoForward: false,
      });
      this.browserState.activeTabId = tabId;
    } else if (body.kind === "navigate" && typeof body.url === "string") {
      const tab = this.browserState.tabs.find((entry) => entry.tabId === body.tabId);
      if (tab) {
        tab.url = body.url;
        tab.canGoBack = true;
        tab.canGoForward = false;
      }
    }
    return { state: structuredClone(this.browserState) };
  }

  browserStateForWatch(seed: { tabs: readonly Record<string, unknown>[]; activeTabId: string }) {
    if (this.browserState.activeTabId === null) {
      this.browserState = {
        tabs: seed.tabs.map((tab) => ({ ...tab })),
        activeTabId: seed.activeTabId,
      };
    }
    return structuredClone(this.browserState);
  }

  prepareRuntimeImage(itemId: string): void {
    this.runtimeImages.set(itemId, {
      bytes: Buffer.from(TRANSCRIPT_PREVIEW_IMAGE.base64, "base64"),
      contentType: TRANSCRIPT_PREVIEW_IMAGE.mime,
    });
  }

  runtimeImage(
    itemId: string,
  ): { bytes: Buffer; contentType: string; attachmentName?: string } | undefined {
    return this.runtimeImages.get(itemId);
  }

  private forward(targetPort: number): Record<string, unknown> {
    const id = "forward-fixture-001";
    const forward = { id, targetPort, listenPort: 49160, createdAt: 1_786_534_980_000 };
    this.forwards.set(id, forward);
    // Gate 6: raw-TCP listeners require the first-line connect ticket, so the
    // authoritative forward response always carries one (min length 1).
    return { forward, enterPath: this.enterPath(id), connectTicket: `fct-${id}` };
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
  if (routeId === "device-preview-ios-video") {
    // A finite AVCC access-unit delimiter proves binary wire I/O, not video decoding.
    const chunk = Buffer.from([0, 0, 0, 2, 0x09, 0xf0]);
    runtime.ledger.observeHttpRoute(routeId, { statusCode: 200, source: "mock" });
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": chunk.length,
    });
    res.end(chunk);
    return true;
  }
  if (SPECIAL_ROUTES.has(routeId)) {
    const media =
      routeId === "file-media"
        ? runtime.routes.fileMediaForTicket(input.query.ticket)
        : routeId === "runtime-image"
          ? runtime.routes.runtimeImage(String(input.params.itemId ?? ""))
          : undefined;
    if (media) {
      await runtime.routes.waitForAttachment();
      if (res.destroyed) return true;
      runtime.ledger.observeHttpRoute(routeId, { statusCode: 200, source: "mock" });
      res.writeHead(200, {
        "content-type": media.contentType,
        ...(media.attachmentName
          ? { "content-disposition": `attachment; filename="${media.attachmentName}"` }
          : {}),
        "content-length": media.bytes.length,
      });
      res.end(media.bytes);
      return true;
    }
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
