import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runtimeEventSchema } from "../../../src/shared/contracts/runtimeEvent";
import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_COMMAND_ID_HEADER,
  REMOTE_STANDARD_SCOPES,
  filterKnownRemoteAccessScopes,
  remoteAccessTokenResultSchema,
  remoteEnvironmentDescriptorSchema,
  remoteShellSnapshotSchema,
  remoteThreadSnapshotSchema,
  remoteTokenExchangePayloadSchema,
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
  TERMINAL_CURSOR_SYNC_VERSION,
} from "../../../src/shared/remote/protocol";
import { readRemoteImageRef, remoteImageRefPath } from "../../../src/shared/remote/imageRef";
import { isRemoteOmittedField } from "../../../src/shared/remote/omittedPayload";
import { REMOTE_PROCEDURE_SPECS } from "../../../src/shared/remote/procedures";

const contractDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(contractDirectory, "../../..");

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(contractDirectory, name), "utf8")) as unknown;
}

function readSource(relativePath: string): string {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

const routeSchema = z
  .object({
    id: z.string().min(1),
    method: z.enum(["GET", "POST", "DELETE"]),
    path: z.string().startsWith("/"),
    auth: z.enum(["public", "pairing-token", "bearer", "bearer-or-query", "forward-enter-token"]),
    scopes: z.array(z.string().min(1)),
    scopeResolution: z.literal("procedure-defined").optional(),
    queryParameters: z.array(z.string().min(1)).optional(),
    legacy: z.boolean().optional(),
    idempotency: z.enum(["command-id-header", "command-id-header-for-start-kind"]).optional(),
  })
  .strict();

const procedureSchema = z
  .object({
    name: z.string().min(1),
    scope: z.string().min(1),
    owner: z.enum([
      "none",
      "projectLocation",
      "worktreeLocation",
      "location",
      "runtime",
      "optionalProjectLocation",
      "skillLocations",
      "thread",
      "project",
      "terminal",
    ]),
    timeout: z.literal("long").optional(),
  })
  .strict();

const manifestSchema = z
  .object({
    formatVersion: z.literal(1),
    contract: z.literal("poracode.remote"),
    protocolVersion: z.number().int().positive(),
    wireFormat: z
      .object({
        http: z.literal("application/json"),
        webSocket: z.literal("json-text-frames"),
        webSocketPath: z.literal("/ws"),
        webSocketQueryParameters: z.array(z.string().min(1)),
        commandIdHeader: z.string().min(1),
      })
      .strict(),
    compatibility: z
      .object({
        versionPolicy: z.literal("exact"),
        minimumAcceptedProtocolVersion: z.number().int().positive(),
        maximumAcceptedProtocolVersion: z.number().int().positive(),
        unknownObjectFields: z.literal("ignore"),
        unknownAdvertisedScopes: z.literal("filter"),
        unknownClientRequestedScopes: z.literal("reject"),
        unknownWebSocketEventPayloads: z.literal("accept-envelope-and-ignore-unknown-event"),
        endpointPathPolicy: z.literal("append-to-preserved-base-path"),
        discoveryFallback: z.array(z.string().startsWith("/")),
        sequencePolicy: z
          .object({
            snapshotSeqIsLastAppliedEvent: z.literal(true),
            sendZeroLastSeenSeq: z.literal(true),
            missingReplayWindow: z.literal("resync-required"),
            serverSequenceRegression: z.literal("resync-required"),
          })
          .strict(),
        terminalOutput: z
          .object({
            replayable: z.literal(false),
            reconnectRecovery: z.literal("fetch-thread-scrollback-then-watch"),
            cursorSync: z
              .object({
                capability: z.literal("terminalCursorSync"),
                versions: z.array(z.number().int().positive()).min(1),
                optIn: z.literal(true),
                reliableCongestion: z.literal("disconnect"),
                legacyCongestion: z.literal("lossy-skip"),
              })
              .strict()
              .optional(),
          })
          .strict(),
        pairingCredential: z
          .object({
            singleUse: z.literal(true),
            transport: z.literal("url-fragment-or-request-body"),
          })
          .strict(),
      })
      .strict(),
    scopes: z.array(z.string().min(1)),
    httpRoutes: z.array(routeSchema),
    procedures: z.array(procedureSchema),
    webSocket: z
      .object({
        clientMessages: z.array(z.string().min(1)),
        serverMessages: z.array(z.string().min(1)),
        replayableEventTypes: z.array(z.string().min(1)),
        runtimeEventTypes: z.array(z.string().min(1)),
        outOfBandMessages: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();

const manifest = manifestSchema.parse(readJson("manifest.json"));

const EXPECTED_PROCEDURE_NAMES = [
  "rollbackThreadConversation",
  "createFileCheckpoint",
  "finalizeFileCheckpoint",
  "listFileCheckpoints",
  "restoreFileCheckpoint",
  "subagentSubscribe",
  "subagentUnsubscribe",
  "stageThreadInput",
  "workflowGetRun",
  "workflowAgentChat",
  "scanSkills",
  "listSkillMarketplace",
  "setSkillEnabled",
  "deleteSkill",
  "importSkills",
  "installMarketplaceSkill",
  "discoverExternalMcpServers",
  "probeMcpServer",
  "getMcpOauthStatus",
  "beginMcpServerOauth",
  "waitMcpServerOauth",
  "clearMcpServerOauth",
  "searchProjectFiles",
  "listProjectTree",
  "browseHostDirectory",
  "searchProjectTree",
  "readProjectFile",
  "readAbsoluteFile",
  "readExternalFile",
  "writeProjectFile",
  "writeExternalFile",
  "createProjectEntry",
  "renameProjectEntry",
  "moveProjectEntry",
  "deleteProjectEntry",
  "detectSetupScript",
  "getGitStatus",
  "getGitDiff",
  "getGitDiffBatch",
  "getGitFileContent",
  "gitListBranches",
  "gitListWorktrees",
  "gitProjectSnapshot",
  "gitWorktreeStatusBatch",
  "gitGetWorktreeSourceBranch",
  "gitGetWorktreeOwner",
  "ghCheckAvailable",
  "ghGetPrForBranch",
  "ghListPrs",
  "ghListPullRequests",
  "ghGetPrChecks",
  "ghGetPrFiles",
  "ghGetPrDiff",
  "ghGetPrDetails",
  "ghGetPrReviewComments",
  "ghListAccounts",
  "ghListRepos",
  "ghListWorkflows",
  "ghListWorkflowRuns",
  "ghGetWorkflowRun",
  "ghGetWorkflowDefinition",
  "gitStage",
  "gitUnstage",
  "gitRevert",
  "gitStageAll",
  "gitUnstageAll",
  "gitRevertAll",
  "gitCommit",
  "gitInit",
  "gitAddRemote",
  "generateCommitMessage",
  "generateTitle",
  "generatePrSummary",
  "gitFetch",
  "gitPull",
  "gitPullRebase",
  "gitPush",
  "gitSync",
  "gitSyncRebase",
  "gitSwitchBranch",
  "gitDeleteBranch",
  "gitAddWorktree",
  "gitRemoveWorktree",
  "gitPruneWorktrees",
  "gitMergeToSource",
  "gitPullFromSource",
  "gitAbortMerge",
  "gitFinishMerge",
  "ghCreatePr",
  "ghMergePr",
  "ghClosePr",
  "ghReopenPr",
  "ghMarkPrReady",
  "ghSubmitPrReview",
  "ghUpdatePrBranch",
  "ghPostPrComment",
  "ghDispatchWorkflow",
  "ghRerunWorkflowRun",
  "ghCancelWorkflowRun",
  "ghDeleteWorkflowRun",
] as const;

function routeKey(route: { readonly method: string; readonly path: string }): string {
  return `${route.method} ${route.path}`;
}

function literalTypesInSchema(source: string, declarationName: string): string[] {
  const start = source.indexOf(`export const ${declarationName}`);
  if (start < 0) throw new Error(`Missing schema declaration ${declarationName}.`);
  const end = source.indexOf("]);", start);
  if (end < 0) throw new Error(`Unterminated schema declaration ${declarationName}.`);
  return [...source.slice(start, end).matchAll(/type:\s*z\.literal\("([^"]+)"\)/g)].map(
    (match) => match[1]!,
  );
}

describe("language-neutral remote protocol v3 contract", () => {
  it("keeps manifest version, scopes, envelopes, and events aligned with authoritative source", () => {
    expect(manifest.protocolVersion).toBe(PORACODE_REMOTE_PROTOCOL_VERSION);
    expect(manifest.compatibility.minimumAcceptedProtocolVersion).toBe(
      PORACODE_REMOTE_PROTOCOL_VERSION,
    );
    expect(manifest.compatibility.maximumAcceptedProtocolVersion).toBe(
      PORACODE_REMOTE_PROTOCOL_VERSION,
    );
    expect(manifest.wireFormat.commandIdHeader).toBe(REMOTE_COMMAND_ID_HEADER);
    expect(sorted(manifest.scopes)).toEqual(sorted(REMOTE_STANDARD_SCOPES));

    const protocolSource = readSource("src/shared/remote/protocol.ts");
    expect(sorted(manifest.webSocket.clientMessages)).toEqual(
      sorted(literalTypesInSchema(protocolSource, "remoteWebSocketClientMessageSchema")),
    );
    expect(sorted(manifest.webSocket.serverMessages)).toEqual(
      sorted(literalTypesInSchema(protocolSource, "remoteWebSocketServerMessageSchema")),
    );

    const runtimeEventSource = readSource("src/shared/contracts/runtimeEvent.ts");
    expect(sorted(manifest.webSocket.runtimeEventTypes)).toEqual(
      sorted(literalTypesInSchema(runtimeEventSource, "runtimeEventSchema")),
    );

    const serverSource = readSource("src/main/remote/RemoteAccessServer.ts");
    const replayableStart = serverSource.indexOf(
      "new Set([",
      serverSource.indexOf("const REMOTELY_CONSUMED_EVENT_TYPES"),
    );
    const replayableEnd = serverSource.indexOf("]);", replayableStart);
    expect(replayableStart).toBeGreaterThanOrEqual(0);
    expect(replayableEnd).toBeGreaterThan(replayableStart);
    const replayableTypes = [
      ...serverSource.slice(replayableStart, replayableEnd).matchAll(/^\s*"([^"]+)",?$/gm),
    ].map((match) => match[1]!);
    expect(sorted(manifest.webSocket.replayableEventTypes)).toEqual(sorted(replayableTypes));

    expect(
      manifest.webSocket.outOfBandMessages.every((type) =>
        manifest.webSocket.serverMessages.includes(type),
      ),
    ).toBe(true);
  });

  it("keeps the complete generic procedure inventory and metadata aligned", () => {
    const manifestNames = manifest.procedures.map((procedure) => procedure.name);
    const authoritativeNames = Object.keys(REMOTE_PROCEDURE_SPECS);
    expect(EXPECTED_PROCEDURE_NAMES).toHaveLength(100);
    expect(new Set(EXPECTED_PROCEDURE_NAMES).size).toBe(EXPECTED_PROCEDURE_NAMES.length);
    expect(new Set(manifestNames).size).toBe(manifestNames.length);
    expect(manifestNames).toEqual([...EXPECTED_PROCEDURE_NAMES]);
    expect(authoritativeNames).toEqual([...EXPECTED_PROCEDURE_NAMES]);

    const authoritativeProcedures = Object.entries(REMOTE_PROCEDURE_SPECS).map(
      ([name, specification]) => ({ name, ...specification }),
    );
    expect(manifest.procedures).toEqual(authoritativeProcedures);
    expect(
      manifest.procedures.every((procedure) => manifest.scopes.includes(procedure.scope)),
    ).toBe(true);
    expect(manifest.httpRoutes.find((route) => route.id === "procedure-call")).toMatchObject({
      scopeResolution: "procedure-defined",
    });
  });

  it("keeps the complete HTTP route inventory aligned with the authoritative router", () => {
    const routeIds = manifest.httpRoutes.map((route) => route.id);
    const routeKeys = manifest.httpRoutes.map(routeKey);
    expect(new Set(routeIds).size).toBe(routeIds.length);
    expect(new Set(routeKeys).size).toBe(routeKeys.length);

    for (const route of manifest.httpRoutes) {
      expect(route.scopes.every((scope) => manifest.scopes.includes(scope))).toBe(true);
      const isBearerAuth = route.auth === "bearer" || route.auth === "bearer-or-query";
      // Unauthenticated routes must declare no scopes.
      expect(isBearerAuth || route.scopes.length === 0).toBe(true);
      // Bearer routes either defer scope selection to the procedure or declare ≥1.
      expect(
        !isBearerAuth || route.scopeResolution === "procedure-defined" || route.scopes.length > 0,
      ).toBe(true);
    }

    const routerSource = readSource("src/main/remote/server/httpRouter.ts");
    const staticRouteKeys = [
      ...routerSource.matchAll(
        /req\.method === "(GET|POST|DELETE)"\s*&&\s*\(?\s*url\.pathname === "([^"]+)"/g,
      ),
    ]
      .map((match) => `${match[1]} ${match[2]}`)
      .filter((key) => / \/(?:\.well-known\/|oauth\/|api\/)/.test(key));
    if (routerSource.includes('url.pathname === "/.well-known/lightcode/environment"')) {
      staticRouteKeys.push("GET /.well-known/lightcode/environment");
    }

    const manifestStaticRouteKeys = routeKeys.filter((key) => !key.includes("{"));
    expect(sorted(manifestStaticRouteKeys)).toEqual(sorted(staticRouteKeys));

    const dynamicRouteSourceChecks = new Map<string, readonly RegExp[]>([
      ["GET /forward/{forwardId}/enter", [/\^\\\/forward\\\/\(\[\^\/\]\+\)\\\/enter\$/]],
      [
        "GET /api/projects/{projectId}/notes",
        [/projectIdFromPath\(url\.pathname, "notes"\)/, /notesProjectId && req\.method === "GET"/],
      ],
      [
        "POST /api/projects/{projectId}/notes",
        [/projectIdFromPath\(url\.pathname, "notes"\)/, /notesProjectId && req\.method === "POST"/],
      ],
      [
        "GET /api/threads/{threadId}/items/{itemId}/image",
        [/refImageMatch = \/\^\\\/api\\\/threads\\\//, /req\.method === "GET" && refImageMatch/],
      ],
      [
        "GET /api/projects/{projectId}/settings",
        [
          /projectIdFromPath\(url\.pathname, "settings"\)/,
          /req\.method === "GET" && projectSettingsId/,
        ],
      ],
      [
        "GET /api/threads/{threadId}/history/items",
        [
          /threadIdFromPath\(url\.pathname, "\/history\/items"\)/,
          /req\.method === "GET" && historyItemsThreadId/,
        ],
      ],
      [
        "GET /api/threads/{threadId}/history",
        [
          /threadIdFromPath\(url\.pathname, "\/history"\)/,
          /req\.method === "GET" && historyThreadId/,
        ],
      ],
      [
        "POST /api/threads/{threadId}/runtime/truncate",
        [
          /threadIdFromPath\(url\.pathname, "\/runtime\/truncate"\)/,
          /req\.method === "POST" && truncateThreadId/,
        ],
      ],
      [
        "POST /api/threads/{threadId}/command",
        [
          /threadIdFromPath\(url\.pathname, "\/command"\)/,
          /req\.method === "POST" && commandThreadId/,
        ],
      ],
    ]);

    const threadPostBlockStart = routerSource.indexOf("const THREAD_POST_ROUTES");
    const threadPostBlockEnd = routerSource.indexOf("\n];", threadPostBlockStart);
    expect(threadPostBlockStart).toBeGreaterThanOrEqual(0);
    expect(threadPostBlockEnd).toBeGreaterThan(threadPostBlockStart);
    const threadPostBlock = routerSource.slice(threadPostBlockStart, threadPostBlockEnd);
    const threadPostRoutes = [...threadPostBlock.matchAll(/suffix:\s*"([^"]+)"/g)].map(
      (match) => `POST /api/threads/{threadId}${match[1]}`,
    );

    const dynamicManifestRouteKeys = routeKeys.filter((key) => key.includes("{"));
    expect(sorted(dynamicManifestRouteKeys)).toEqual(
      sorted([...dynamicRouteSourceChecks.keys(), ...threadPostRoutes]),
    );
    for (const patterns of dynamicRouteSourceChecks.values()) {
      for (const pattern of patterns) expect(routerSource).toMatch(pattern);
    }

    const tableScopeBySuffix = new Map(
      [...threadPostBlock.matchAll(/suffix:\s*"([^"]+)"[\s\S]*?scope:\s*"([^"]+)"/g)].map(
        (match) => [match[1]!, match[2]!] as const,
      ),
    );
    // THREAD_POST_ROUTES table entries must appear in the manifest with the
    // matching single-scope declaration. Routes outside that table (e.g.
    // /runtime/truncate, /command) are covered by the dynamic inventory above.
    // Assertions are unconditional: iterate the table, never branch on expect.
    const prefix = "/api/threads/{threadId}";
    for (const [suffix, expectedScope] of tableScopeBySuffix) {
      const route = manifest.httpRoutes.find(
        (candidate) => candidate.method === "POST" && candidate.path === `${prefix}${suffix}`,
      );
      expect(route?.scopes).toEqual([expectedScope]);
    }
  });

  it("parses every core golden response, request, runtime event, and socket envelope", () => {
    remoteEnvironmentDescriptorSchema.parse(readJson("fixtures/environment.json"));
    remoteTokenExchangePayloadSchema.parse(readJson("fixtures/pairing-token-request.json"));
    remoteAccessTokenResultSchema.parse(readJson("fixtures/pairing-token-response.json"));
    remoteShellSnapshotSchema.parse(readJson("fixtures/shell-snapshot.json"));
    remoteThreadSnapshotSchema.parse(readJson("fixtures/thread-history.json"));

    const runtimeEvents = z
      .array(runtimeEventSchema)
      .parse(readJson("fixtures/runtime-events.json"));
    // Goldens may include multiple variants of the same discriminator type
    // (e.g. turn.completed completed+failed). Coverage is the unique type set:
    // every manifest type has ≥1 golden. Duplicate golden variants of an allowed
    // type are fine; extra unique discriminator types beyond the manifest are not.
    const goldenTypes = new Set(runtimeEvents.map((event) => event.type));
    const manifestTypes = new Set(manifest.webSocket.runtimeEventTypes);
    expect(sorted([...goldenTypes])).toEqual(sorted([...manifestTypes]));
    for (const type of manifest.webSocket.runtimeEventTypes) {
      expect(goldenTypes.has(type)).toBe(true);
    }
    // Explicitly retain both turn.completed variants (completed + failed).
    expect(
      runtimeEvents
        .filter((event) => event.type === "turn.completed")
        .map((event) => {
          if (event.type !== "turn.completed") return null;
          return event.state;
        }),
    ).toEqual(["completed", "failed"]);

    for (const fixtureName of [
      "ws-ready.json",
      "ws-event.json",
      "ws-resync-required.json",
      "ws-pong.json",
    ]) {
      remoteWebSocketServerMessageSchema.parse(readJson(`fixtures/${fixtureName}`));
    }
    const eventEnvelope = readJson("fixtures/ws-event.json") as {
      readonly event: { readonly event: unknown };
    };
    runtimeEventSchema.parse(eventEnvelope.event.event);
  });

  it("parses terminal cursor-sync goldens and keeps legacy frames free of metadata", () => {
    const withCapability = remoteEnvironmentDescriptorSchema.parse(
      readJson("fixtures/environment-terminal-cursor-sync.json"),
    );
    expect(withCapability.capabilities?.terminalCursorSync?.versions).toContain(
      TERMINAL_CURSOR_SYNC_VERSION,
    );

    const legacyWatch = remoteWebSocketClientMessageSchema.parse(
      readJson("fixtures/ws-client-terminal-watch-legacy.json"),
    );
    expect(legacyWatch).toEqual({ type: "terminal-watch", id: "terminal-fixture-001" });

    const syncWatch = remoteWebSocketClientMessageSchema.parse(
      readJson("fixtures/ws-client-terminal-watch-cursor-sync-v1.json"),
    );
    expect(syncWatch).toMatchObject({
      type: "terminal-watch",
      cursorSync: { version: 1, watchId: "watch-fixture-001" },
    });

    // Request parsing accepts any positive version (server rejects unsupported).
    const futureWatch = remoteWebSocketClientMessageSchema.parse({
      type: "terminal-watch",
      id: "terminal-fixture-001",
      cursorSync: { version: 99, watchId: "watch-future" },
    });
    expect(futureWatch).toMatchObject({
      type: "terminal-watch",
      cursorSync: { version: 99, watchId: "watch-future" },
    });
    expect(
      remoteWebSocketClientMessageSchema.safeParse({
        type: "terminal-watch",
        id: "t",
        cursorSync: { version: 0, watchId: "w" },
      }).success,
    ).toBe(false);
    expect(
      remoteWebSocketClientMessageSchema.safeParse({
        type: "terminal-watch",
        id: "t",
        cursorSync: { version: -1, watchId: "w" },
      }).success,
    ).toBe(false);

    for (const fixtureName of [
      "ws-server-terminal-watch-result-live.json",
      "ws-server-terminal-watch-result-persisted.json",
      "ws-server-terminal-watch-result-error.json",
      "ws-server-terminal-output-legacy.json",
      "ws-server-terminal-output-cursor-sync-v1.json",
    ]) {
      remoteWebSocketServerMessageSchema.parse(readJson(`fixtures/${fixtureName}`));
    }

    // Snapshot/ready fixtures: toCursor - fromCursor === JS code-unit length(data).
    for (const fixtureName of [
      "ws-server-terminal-watch-result-live.json",
      "ws-server-terminal-watch-result-persisted.json",
    ]) {
      const message = remoteWebSocketServerMessageSchema.parse(
        readJson(`fixtures/${fixtureName}`),
      ) as {
        type: "terminal-watch-result";
        cursorSync: {
          result: {
            status: "ready";
            fromCursor: number;
            toCursor: number;
            data: string;
          };
        };
      };
      const { fromCursor, toCursor, data } = message.cursorSync.result;
      expect(fromCursor).toBeGreaterThanOrEqual(0);
      expect(toCursor).toBeGreaterThanOrEqual(fromCursor);
      expect(toCursor - fromCursor).toBe(data.length);
    }

    // Unicode code-unit semantics: astral + combining mark are opaque JS units.
    const unicodeData = "a\u{1F600}e\u0301";
    expect(unicodeData.length).toBe(5); // a + surrogate pair + e + combining
    const unicodeOutput = remoteWebSocketServerMessageSchema.parse({
      type: "terminal-output",
      id: "t",
      data: unicodeData,
      cursorSync: {
        version: TERMINAL_CURSOR_SYNC_VERSION,
        watchId: "w",
        generation: "g",
        fromCursor: 10,
        toCursor: 10 + unicodeData.length,
      },
    }) as {
      cursorSync: { fromCursor: number; toCursor: number };
      data: string;
    };
    expect(unicodeOutput.cursorSync.toCursor - unicodeOutput.cursorSync.fromCursor).toBe(
      unicodeOutput.data.length,
    );

    const legacyOutput = remoteWebSocketServerMessageSchema.parse(
      readJson("fixtures/ws-server-terminal-output-legacy.json"),
    );
    expect(legacyOutput).toEqual({
      type: "terminal-output",
      id: "terminal-fixture-001",
      data: "legacy frame",
    });
    expect(legacyOutput).not.toHaveProperty("cursorSync");

    expect(manifest.compatibility.terminalOutput.cursorSync).toMatchObject({
      capability: "terminalCursorSync",
      versions: [TERMINAL_CURSOR_SYNC_VERSION],
      optIn: true,
    });
  });

  it("locks terminal cursor-sync capability versions across manifest, constants, and server", () => {
    expect(TERMINAL_CURSOR_SYNC_VERSION).toBe(1);
    expect(manifest.protocolVersion).toBe(PORACODE_REMOTE_PROTOCOL_VERSION);
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.compatibility.terminalOutput.cursorSync?.versions).toEqual([
      TERMINAL_CURSOR_SYNC_VERSION,
    ]);

    const withCapability = remoteEnvironmentDescriptorSchema.parse(
      readJson("fixtures/environment-terminal-cursor-sync.json"),
    );
    expect(withCapability.capabilities?.terminalCursorSync?.versions).toEqual([
      TERMINAL_CURSOR_SYNC_VERSION,
    ]);

    const cursorSyncSource = readSource("src/main/remote/server/terminalCursorSync.ts");
    expect(cursorSyncSource).toMatch(
      /export const TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS = \[TERMINAL_CURSOR_SYNC_VERSION\]/,
    );
    expect(cursorSyncSource).toContain("isSupportedTerminalCursorSyncVersion");
    expect(cursorSyncSource).toContain("generation: null");
    // Null generations are never append-compatible.
    expect(cursorSyncSource).toContain("previous.generation === null || next.generation === null");

    const protocolSource = readSource("src/shared/remote/protocol.ts");
    expect(protocolSource).toContain(
      `export const TERMINAL_CURSOR_SYNC_VERSION = ${TERMINAL_CURSOR_SYNC_VERSION} as const`,
    );
    // Request schema accepts positive versions (not only literal 1).
    expect(protocolSource).toContain("remoteTerminalCursorSyncRequestSchema");
    expect(protocolSource).toMatch(
      /remoteTerminalCursorSyncRequestSchema = z\.object\(\{[\s\S]*?version:\s*z\.number\(\)\.int\(\)\.positive\(\)/,
    );

    const snapshotsSource = readSource("src/main/remote/server/snapshots.ts");
    expect(snapshotsSource).toContain("TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS");
    expect(snapshotsSource).toContain("terminalCursorSync");

    // Live/output cursor-sync frames still advertise the supported server version.
    const liveOutput = remoteWebSocketServerMessageSchema.parse(
      readJson("fixtures/ws-server-terminal-output-cursor-sync-v1.json"),
    ) as { cursorSync: { version: number; fromCursor: number; toCursor: number }; data: string };
    expect(liveOutput.cursorSync.version).toBe(TERMINAL_CURSOR_SYNC_VERSION);
    expect(liveOutput.cursorSync.toCursor - liveOutput.cursorSync.fromCursor).toBe(
      liveOutput.data.length,
    );
  });

  it("locks forward-additive, prefixed-endpoint, image-ref, and omitted-field behavior", () => {
    const futureEnvironment = readJson("fixtures/environment-forward-compatible.json");
    const parsedFutureEnvironment = remoteEnvironmentDescriptorSchema.parse(futureEnvironment);
    expect(parsedFutureEnvironment.auth.scopes).toEqual(["session:read", "future:observe"]);
    expect(filterKnownRemoteAccessScopes(parsedFutureEnvironment.auth.scopes)).toEqual([
      "session:read",
    ]);
    expect(parsedFutureEnvironment).not.toHaveProperty("futureCapability");
    expect(parsedFutureEnvironment.auth).not.toHaveProperty("futureAuthMetadata");

    const prefixedEndpoint = z
      .object({
        endpoint: z.string().url(),
        httpPath: z.string().startsWith("/"),
        expectedHttpUrl: z.string().url(),
        webSocketPath: z.string().startsWith("/"),
        ticket: z.string().min(1),
        lastSeenSeq: z.number().int().nonnegative(),
        expectedWebSocketUrl: z.string().url(),
      })
      .parse(readJson("fixtures/prefixed-endpoint.json"));
    const base = new URL(prefixedEndpoint.endpoint);
    if (!base.pathname.endsWith("/")) base.pathname = `${base.pathname}/`;
    const resolvedHttp = new URL(prefixedEndpoint.httpPath.replace(/^\/+/, ""), base);
    expect(resolvedHttp.toString()).toBe(prefixedEndpoint.expectedHttpUrl);
    const resolvedSocket = new URL(prefixedEndpoint.webSocketPath.replace(/^\/+/, ""), base);
    resolvedSocket.protocol = "wss:";
    resolvedSocket.searchParams.set("ticket", prefixedEndpoint.ticket);
    resolvedSocket.searchParams.set("lastSeenSeq", String(prefixedEndpoint.lastSeenSeq));
    expect(resolvedSocket.toString()).toBe(prefixedEndpoint.expectedWebSocketUrl);

    const clientSource = readSource("src/shared/remote/client.ts");
    expect(clientSource).toContain('if (!base.pathname.endsWith("/"))');
    expect(clientSource).toContain('path.replace(/^\\/+/, "")');

    const imageRef = readRemoteImageRef(readJson("fixtures/image-ref.json"));
    expect(imageRef).not.toBeNull();
    expect(remoteImageRefPath(imageRef!)).toContain(
      "/api/threads/thread-fixture-001/items/item-fixture-image/image?",
    );
    expect(isRemoteOmittedField(readJson("fixtures/omitted-field.json"))).toBe(true);
  });
});
