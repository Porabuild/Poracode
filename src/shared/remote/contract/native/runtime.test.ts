import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildRemoteV3IrDocument } from "../generate";
import { readProtocolManifest } from "../hashes";
import { emitKotlinBindings } from "./emitKotlin";
import { emitSwiftBindings } from "./emitSwift";
import { rootAdapters } from "./emitterCommon";
import { buildNativeBindingOutput } from "./generate";
import { buildNativeSchemaGraph, collectNativeSchemaRoots } from "./schemaGraph";
import type { JsonSchema, NativeBindingIr, NativeSchemaGraph, NativeSchemaRoot } from "./types";
import { parseNativeBindingIr } from "./validate";
import { defaultSharedSettings } from "../../../settings";
import { pickRemoteSettings } from "../../protocol";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(here, "../../../../..");
const fixtureDirectory = join(repositoryRoot, "protocol/remote/v3/fixtures");
const gradleWrapper = join(repositoryRoot, "android/gradlew");

const wsFixtureNames = [
  "ws-ready.json",
  "ws-event.json",
  "ws-resync-required.json",
  "ws-pong.json",
  "ws-server-terminal-watch-result-live.json",
  "ws-server-terminal-watch-result-persisted.json",
  "ws-server-terminal-watch-result-error.json",
] as const;

const routeFixture = JSON.stringify({ kind: "reload", tabId: "tab-fixture-001" });
const procedureFixture = JSON.stringify({
  status: "redirect",
  flowId: "flow-fixture-001",
  authorizationUrl: "https://example.test/oauth",
});
const remoteSettingsFixture = pickRemoteSettings(defaultSharedSettings);
const sensitiveAgentSettings = {
  cursor: { structuredRuntime: "acp", sdkApiKey: "plaintext-secret" },
};
const sanitizedAgentSettings = { cursor: { structuredRuntime: "acp" } };
const settingsWriteRequestFixture = JSON.stringify({ agentSettings: sensitiveAgentSettings });
const settingsWriteRequestExpected = JSON.stringify({ agentSettings: sanitizedAgentSettings });
const settingsResponseFixture = JSON.stringify({
  settings: { ...remoteSettingsFixture, agentSettings: sensitiveAgentSettings },
});
const settingsResponseExpected = JSON.stringify({
  settings: { ...remoteSettingsFixture, agentSettings: sanitizedAgentSettings },
});
const gitDiffRequestFixture = JSON.stringify({
  projectLocation: { kind: "posix", path: "/tmp/project" },
});
const gitDiffRequestExpected = JSON.stringify({
  projectLocation: { kind: "posix", path: "/tmp/project" },
  staged: false,
});
const discoveryResultFixture = JSON.stringify({
  groups: [
    {
      providerId: "fixture",
      providerLabel: "Fixture",
      sourcePath: "/tmp/config",
      servers: [
        {
          id: "server",
          name: "server",
          enabled: true,
          timeoutMs: 1000,
          transport: { type: "stdio", command: "server" },
        },
      ],
    },
  ],
});
const discoveryResultExpected = JSON.stringify({
  groups: [
    {
      providerId: "fixture",
      providerLabel: "Fixture",
      sourcePath: "/tmp/config",
      servers: [
        {
          id: "server",
          name: "server",
          enabled: true,
          timeoutMs: 1000,
          transport: { type: "stdio", command: "server", args: [], env: {} },
        },
      ],
    },
  ],
});
const nullableFixtures = [
  JSON.stringify({
    path: "/tmp",
    parentPath: null,
    homePath: "/home/test",
    entries: [],
    truncated: false,
  }),
  JSON.stringify({
    path: "/tmp/project",
    parentPath: "/tmp",
    homePath: "/home/test",
    entries: [],
    truncated: false,
  }),
] as const;

const agentCapabilities = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: false,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
} as const;
const authMethodFixtures = [
  { id: "env", name: "Environment", type: "env_var", vars: [{ name: "TOKEN" }] },
  { id: "terminal", name: "Terminal", type: "terminal", args: ["login"], env: { A: "B" } },
  { id: "agent", name: "Agent", type: "agent" },
].map((method) =>
  JSON.stringify({
    windows: [
      {
        kind: "fixture",
        label: "Fixture",
        installed: true,
        authState: "authenticated",
        capabilities: agentCapabilities,
        authMethods: [method],
      },
    ],
    wsl: [],
    updatedAt: "2026-08-12T00:00:00Z",
  }),
);

interface HarnessTypes {
  readonly webSocket: string;
  readonly route: string;
  readonly procedure: string;
  readonly primitive: string;
  readonly numericLiteral: string;
  readonly constrainedString: string;
  readonly utf16Length: string;
  readonly anyOf: string;
  readonly agentStatuses: string;
  readonly nullable: string;
  readonly ambiguous: string;
  readonly unknownPassthrough: string;
}

interface HarnessCodecCase {
  readonly id: string;
  readonly positives: readonly { readonly raw: string; readonly encoded?: string }[];
  readonly negatives: readonly string[];
}

function authoritativeInput(): {
  readonly ir: NativeBindingIr;
  readonly graph: NativeSchemaGraph;
  readonly files: Readonly<Record<string, string>>;
} {
  const rawIr = buildRemoteV3IrDocument();
  const manifest = readProtocolManifest();
  const ir = parseNativeBindingIr(rawIr, manifest);
  return {
    ir,
    graph: buildNativeSchemaGraph(collectNativeSchemaRoots(ir)),
    files: buildNativeBindingOutput(rawIr, manifest).files,
  };
}

function requiredRoot(graph: NativeSchemaGraph, id: string): string {
  const name = graph.roots.get(id)?.name;
  if (!name) throw new Error(`Missing native schema root ${id}`);
  return name;
}

function primitiveUnionName(graph: NativeSchemaGraph): string {
  const node = graph.nodes.find((candidate) => {
    const options = candidate.schema.anyOf;
    return (
      Array.isArray(options) &&
      options.map((option) => (option as JsonSchema).type).join(",") === "string,number,boolean"
    );
  });
  if (!node) throw new Error("Missing authoritative string/number/boolean union");
  return node.name;
}

function numericLiteralUnionName(graph: NativeSchemaGraph): string {
  const node = graph.nodes.find((candidate) => {
    const options = candidate.schema.anyOf;
    return (
      Array.isArray(options) &&
      options.length === 5 &&
      options.every(
        (option, index) =>
          (option as JsonSchema).type === "number" && (option as JsonSchema).const === index,
      )
    );
  });
  if (!node) throw new Error("Missing authoritative numeric literal union");
  return node.name;
}

function constrainedStringUnionName(graph: NativeSchemaGraph): string {
  const node = graph.nodes.find((candidate) => {
    const options = candidate.schema.anyOf;
    return (
      Array.isArray(options) &&
      options.length === 5 &&
      options.every((option) => (option as JsonSchema).type === "string") &&
      options.some((option) => typeof (option as JsonSchema).pattern === "string")
    );
  });
  if (!node) throw new Error("Missing authoritative constrained string union");
  return node.name;
}

function syntheticRoots(): NativeSchemaRoot[] {
  const root = (id: string, schema: JsonSchema): NativeSchemaRoot => ({
    id: `synthetic.${id}`,
    preferredName: `Synthetic-${id}`,
    schema,
    transport: "test",
  });
  const semantic = (id: string, schema: JsonSchema): NativeSchemaRoot =>
    root(`semantic.${id}`, { ...schema, "x-poracode-semanticValidators": [id] });
  return [
    {
      id: "synthetic.ambiguous",
      preferredName: "SyntheticAmbiguousUnion",
      schema: { oneOf: [{ type: "string" }, { type: "string", minLength: 0 }] },
      transport: "test",
    },
    {
      id: "synthetic.utf16Length",
      preferredName: "SyntheticUtf16LengthUnion",
      schema: {
        oneOf: [
          { type: "string", pattern: "^😀$", minLength: 2, maxLength: 2 },
          { type: "string", pattern: "^x$", minLength: 1, maxLength: 1 },
        ],
      },
      transport: "test",
    },
    {
      id: "synthetic.anyOf",
      preferredName: "SyntheticAnyOfUnion",
      schema: { anyOf: [{ type: "string" }, { type: "string", minLength: 0 }] },
      transport: "test",
    },
    root("required", {
      type: "object",
      properties: {
        value: { anyOf: [{ type: "string" }, { type: "null" }] },
        optional: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
      required: ["value"],
      additionalProperties: true,
      "x-poracode-unknownFields": "strip",
    }),
    root("unknown-strip", {
      type: "object",
      properties: { known: { type: "string" } },
      required: ["known"],
      additionalProperties: true,
      "x-poracode-unknownFields": "strip",
    }),
    root("unknown-reject", {
      type: "object",
      properties: { known: { type: "string" } },
      required: ["known"],
      additionalProperties: true,
      "x-poracode-unknownFields": "reject",
    }),
    root("unknown-passthrough", {
      type: "object",
      properties: { known: { type: "string" } },
      required: ["known"],
      additionalProperties: true,
      "x-poracode-unknownFields": "passthrough",
    }),
    root("defaults", {
      type: "object",
      properties: {
        primitive: { type: "string", minLength: 1, default: "" },
        array: { type: "array", items: { type: "string" }, default: ["item"] },
        object: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          default: { value: "nested" },
        },
        nullableDefault: {
          anyOf: [{ type: "string" }, { type: "null" }],
          default: "fallback",
        },
      },
      required: ["primitive", "array", "object", "nullableDefault"],
      additionalProperties: false,
    }),
    root("additional-false", { type: "object", additionalProperties: false }),
    root("utf16", { type: "string", minLength: 2, maxLength: 2 }),
    root("pattern", { type: "string", pattern: "^[a-z]+$" }),
    root("format-date-time", { type: "string", format: "date-time" }),
    root("format-uri", { type: "string", format: "uri" }),
    root("format-uuid", { type: "string", format: "uuid" }),
    root("integer", {
      type: "integer",
      minimum: -9_007_199_254_740_991,
      maximum: 9_007_199_254_740_991,
    }),
    root("inclusive-bounds", { type: "number", minimum: 0, maximum: 10 }),
    root("exclusive-bounds", { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 10 }),
    root("array", { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } }),
    root("map", {
      type: "object",
      propertyNames: { type: "string", pattern: "^[a-z]+$" },
      additionalProperties: { type: "integer", minimum: 0 },
    }),
    root("nested", {
      type: "object",
      properties: {
        child: {
          type: "object",
          properties: { values: { type: "array", items: { type: "string", minLength: 1 } } },
          required: ["values"],
          additionalProperties: false,
        },
      },
      required: ["child"],
      additionalProperties: false,
    }),
    root("nullable", { anyOf: [{ type: "string" }, { type: "null" }] }),
    root("literal-enum", { type: "string", enum: ["alpha", "beta"] }),
    semantic("git.add-worktree.frozen-source", {
      type: "object",
      properties: {
        ownerToken: { type: "string" },
        sourceBranch: { type: "string" },
        createBranch: { type: "boolean" },
        branch: { type: "string" },
        startPoint: { type: "string" },
      },
      additionalProperties: true,
    }),
    semantic("git.delete-branch.remote-cannot-have-owner", {
      type: "object",
      properties: { remote: { type: "string" }, expectedOwnerToken: { type: "string" } },
      additionalProperties: true,
    }),
    semantic("git.remove-worktree.owner-requires-branch", {
      type: "object",
      properties: {
        expectedOwnerToken: { type: "string" },
        expectedBranch: { type: "string" },
      },
      additionalProperties: true,
    }),
    semantic("mcp.reserved-name", {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: true,
    }),
    semantic("mcp.valid-url", { type: "string" }),
    semantic("pr-watch.agent-required-when-enabled", {
      type: "object",
      properties: {
        watchEnabled: { type: "boolean" },
        agentKind: { type: "string" },
        config: { type: "object", additionalProperties: true },
      },
      required: ["watchEnabled"],
      additionalProperties: true,
    }),
    semantic("push.registration.platform-fields", {
      type: "object",
      properties: {
        platform: { type: "string" },
        deviceToken: { type: "string" },
        pushToStartToken: { type: "string" },
        activityTokens: { type: "object", additionalProperties: true },
        webPushSubscription: { type: "object", additionalProperties: true },
        webAppBasePath: { type: "string" },
        routing: { type: "object", additionalProperties: true },
      },
      required: ["platform"],
      additionalProperties: true,
    }),
    semantic("push.routing.identifier-no-controls", { type: "string" }),
    semantic("push.web.endpoint-https", { type: "string" }),
    root("semantic.string.trim", {
      type: "string",
      minLength: 1,
      "x-poracode-semanticValidators": ["string.trim"],
      "x-poracode-transforms": ["string.trim"],
    }),
    semantic("terminal.cursor.output-data-utf16", {
      type: "object",
      properties: {
        data: { type: "string" },
        cursorSync: {
          type: "object",
          properties: { fromCursor: { type: "integer" }, toCursor: { type: "integer" } },
          required: ["fromCursor", "toCursor"],
          additionalProperties: false,
        },
      },
      required: ["data", "cursorSync"],
      additionalProperties: false,
    }),
    semantic("terminal.cursor.output-range", {
      type: "object",
      properties: { fromCursor: { type: "integer" }, toCursor: { type: "integer" } },
      required: ["fromCursor", "toCursor"],
      additionalProperties: false,
    }),
    semantic("terminal.cursor.ready-range-utf16", {
      type: "object",
      properties: {
        fromCursor: { type: "integer" },
        toCursor: { type: "integer" },
        data: { type: "string" },
      },
      required: ["fromCursor", "toCursor", "data"],
      additionalProperties: false,
    }),
    semantic("thread.goal.objective.trim", {
      type: "object",
      properties: { action: { type: "string" }, objective: { type: "string" } },
      required: ["action"],
      additionalProperties: false,
    }),
    semantic("void-envelope.omit-result", {
      type: "object",
      additionalProperties: true,
      "x-poracode-unknownFields": "passthrough",
    }),
    semantic("void-result.omit-field", {
      type: "object",
      additionalProperties: true,
      "x-poracode-unknownFields": "passthrough",
    }),
  ];
}

function mutationCases(wsFixtures: readonly string[]): HarnessCodecCase[] {
  const json = (value: unknown) => JSON.stringify(value);
  const cases: HarnessCodecCase[] = [
    {
      id: "synthetic.required",
      positives: [
        { raw: json({ value: null }) },
        { raw: json({ value: "set" }) },
        { raw: json({ value: "set", optional: null }) },
      ],
      negatives: [json({})],
    },
    {
      id: "synthetic.unknown-strip",
      positives: [{ raw: json({ known: "ok", extra: 1 }), encoded: json({ known: "ok" }) }],
      negatives: [json({ known: null })],
    },
    {
      id: "synthetic.unknown-reject",
      positives: [{ raw: json({ known: "ok" }) }],
      negatives: [json({ known: "ok", extra: true })],
    },
    {
      id: "synthetic.unknown-passthrough",
      positives: [{ raw: json({ known: "ok", extra: { nested: true } }) }],
      negatives: [],
    },
    {
      id: "synthetic.defaults",
      positives: [
        {
          raw: json({}),
          encoded: json({
            primitive: "",
            array: ["item"],
            object: { value: "nested" },
            nullableDefault: "fallback",
          }),
        },
        {
          raw: json({ nullableDefault: null }),
          encoded: json({
            primitive: "",
            array: ["item"],
            object: { value: "nested" },
            nullableDefault: null,
          }),
        },
      ],
      negatives: [json({ primitive: null })],
    },
    {
      id: "synthetic.additional-false",
      positives: [{ raw: json({}) }],
      negatives: [json({ extra: true })],
    },
    {
      id: "synthetic.utf16",
      positives: [{ raw: json("😀") }],
      negatives: [json("x"), json("😀x")],
    },
    {
      id: "synthetic.pattern",
      positives: [{ raw: json("abc") }],
      negatives: [json("ABC")],
    },
    {
      id: "synthetic.format-date-time",
      positives: [
        { raw: json("2026-08-12T00:00Z") },
        { raw: json("2026-08-12T00:00:00.123456789Z") },
      ],
      negatives: [json("2026-08-12")],
    },
    {
      id: "synthetic.format-uri",
      positives: [
        { raw: json("https://example.test/a") },
        { raw: json("https://例え.テスト/a") },
        { raw: json("https://under_score.test/a b/%zz") },
      ],
      negatives: [json("not a uri"), json("https://")],
    },
    {
      id: "synthetic.format-uuid",
      positives: [
        { raw: json("123e4567-e89b-12d3-a456-426614174000") },
        { raw: json("123e4567-e89b-82d3-b456-426614174000") },
        { raw: json("00000000-0000-0000-0000-000000000000") },
        { raw: json("ffffffff-ffff-ffff-ffff-ffffffffffff") },
      ],
      negatives: [
        json("123e4567"),
        json("123e4567-e89b-02d3-a456-426614174000"),
        json("123e4567-e89b-92d3-a456-426614174000"),
        json("123e4567-e89b-12d3-7456-426614174000"),
      ],
    },
    {
      id: "synthetic.integer",
      positives: [{ raw: "0" }, { raw: "9007199254740991" }],
      negatives: ["1.5", "9007199254740992"],
    },
    {
      id: "synthetic.inclusive-bounds",
      positives: [{ raw: "0" }, { raw: "10" }],
      negatives: ["-0.1", "10.1"],
    },
    {
      id: "synthetic.exclusive-bounds",
      positives: [{ raw: "0.1" }, { raw: "9.9" }],
      negatives: ["0", "10"],
    },
    {
      id: "synthetic.array",
      positives: [{ raw: json(["a"]) }, { raw: json(["a", "b"]) }],
      negatives: [json([]), json(["a", "b", "c"]), json(["a", 1])],
    },
    {
      id: "synthetic.map",
      positives: [{ raw: json({ alpha: 1 }) }],
      negatives: [json({ Alpha: 1 }), json({ alpha: -1 }), json({ alpha: 1.5 })],
    },
    {
      id: "synthetic.nested",
      positives: [{ raw: json({ child: { values: ["ok"] } }) }],
      negatives: [
        json({ child: {} }),
        json({ child: { values: [""] } }),
        json({ child: { values: ["ok"], extra: true } }),
      ],
    },
    {
      id: "synthetic.anyOf",
      positives: [{ raw: json("first-success") }],
      negatives: ["42"],
    },
    {
      id: "synthetic.ambiguous",
      positives: [],
      negatives: [json("ambiguous"), "42"],
    },
    {
      id: "synthetic.nullable",
      positives: [{ raw: "null" }, { raw: json("value") }],
      negatives: ["false"],
    },
    {
      id: "synthetic.literal-enum",
      positives: [{ raw: json("alpha") }, { raw: json("beta") }],
      negatives: [json("gamma")],
    },
    {
      id: "synthetic.semantic.git.add-worktree.frozen-source",
      positives: [
        {
          raw: json({
            sourceBranch: "main",
            createBranch: true,
            branch: "new",
            startPoint: "a".repeat(40),
          }),
        },
        {
          raw: json({
            sourceBranch: "main",
            createBranch: true,
            branch: "new",
            startPoint: "b".repeat(64),
          }),
        },
      ],
      negatives: [json({ ownerToken: "owner" })],
    },
    {
      id: "synthetic.semantic.git.delete-branch.remote-cannot-have-owner",
      positives: [{ raw: json({ remote: "origin" }) }],
      negatives: [json({ remote: "origin", expectedOwnerToken: "owner" })],
    },
    {
      id: "synthetic.semantic.git.remove-worktree.owner-requires-branch",
      positives: [{ raw: json({ expectedOwnerToken: "owner", expectedBranch: "main" }) }],
      negatives: [json({ expectedOwnerToken: "owner" })],
    },
    {
      id: "synthetic.semantic.mcp.reserved-name",
      positives: [{ raw: json({ name: "custom" }) }],
      negatives: [json({ name: " Poracode " })],
    },
    {
      id: "synthetic.semantic.mcp.valid-url",
      positives: [{ raw: json("https://example.test/mcp") }],
      negatives: [json("file:///tmp/mcp")],
    },
    {
      id: "synthetic.semantic.pr-watch.agent-required-when-enabled",
      positives: [
        { raw: json({ watchEnabled: false }) },
        { raw: json({ watchEnabled: true, agentKind: "codex", config: {} }) },
      ],
      negatives: [json({ watchEnabled: true })],
    },
    {
      id: "synthetic.semantic.push.registration.platform-fields",
      positives: [
        { raw: json({ platform: "android", deviceToken: "token" }) },
        {
          raw: json({
            platform: "web",
            webPushSubscription: {},
            webAppBasePath: "/app",
          }),
        },
      ],
      negatives: [json({ platform: "android", pushToStartToken: "ios-only" })],
    },
    {
      id: "synthetic.semantic.push.routing.identifier-no-controls",
      positives: [{ raw: json("desktop-1") }],
      negatives: [json("desktop\n1")],
    },
    {
      id: "synthetic.semantic.push.web.endpoint-https",
      positives: [{ raw: json("https://push.example.test/sub") }],
      negatives: [json("http://push.example.test/sub"), json("HTTPS://push.example.test/sub")],
    },
    {
      id: "synthetic.semantic.string.trim",
      positives: [
        { raw: json("  trimmed  "), encoded: json("trimmed") },
        { raw: json("\uFEFFtrimmed\uFEFF"), encoded: json("trimmed") },
      ],
      negatives: [json("   "), json("\uFEFF")],
    },
    {
      id: "synthetic.semantic.terminal.cursor.output-data-utf16",
      positives: [{ raw: json({ data: "😀", cursorSync: { fromCursor: 0, toCursor: 2 } }) }],
      negatives: [json({ data: "😀", cursorSync: { fromCursor: 0, toCursor: 1 } })],
    },
    {
      id: "synthetic.semantic.terminal.cursor.output-range",
      positives: [{ raw: json({ fromCursor: 1, toCursor: 1 }) }],
      negatives: [json({ fromCursor: 2, toCursor: 1 })],
    },
    {
      id: "synthetic.semantic.terminal.cursor.ready-range-utf16",
      positives: [{ raw: json({ fromCursor: 4, toCursor: 6, data: "😀" }) }],
      negatives: [json({ fromCursor: 4, toCursor: 5, data: "😀" })],
    },
    {
      id: "synthetic.semantic.thread.goal.objective.trim",
      positives: [{ raw: json({ action: "edit", objective: "goal" }) }],
      negatives: [json({ action: "edit", objective: "" })],
    },
    {
      id: "synthetic.semantic.void-envelope.omit-result",
      positives: [{ raw: json({}) }],
      negatives: [json({ result: null })],
    },
    {
      id: "synthetic.semantic.void-result.omit-field",
      positives: [{ raw: json({}) }],
      negatives: [json({ result: null })],
    },
  ];
  cases.push(
    {
      id: "procedure.getGitDiff.request",
      positives: [{ raw: gitDiffRequestFixture, encoded: gitDiffRequestExpected }],
      negatives: [],
    },
    {
      id: "procedure.discoverExternalMcpServers.result",
      positives: [{ raw: discoveryResultFixture, encoded: discoveryResultExpected }],
      negatives: [],
    },
    {
      id: "route.settings-write.request",
      positives: [{ raw: settingsWriteRequestFixture, encoded: settingsWriteRequestExpected }],
      negatives: [],
    },
    {
      id: "route.settings-read.response",
      positives: [{ raw: settingsResponseFixture, encoded: settingsResponseExpected }],
      negatives: [],
    },
    {
      id: "route.settings-write.response",
      positives: [{ raw: settingsResponseFixture, encoded: settingsResponseExpected }],
      negatives: [],
    },
    {
      id: "route.push-register.request",
      positives: [
        {
          raw: json({
            deviceId: "device-001",
            platform: "ios",
            routing: {
              version: 1,
              clientConnectionId: "123E4567-E89B-12D3-A456-426614174000",
              desktopId: "desktop",
            },
          }),
          encoded: json({
            deviceId: "device-001",
            platform: "ios",
            routing: {
              version: 1,
              clientConnectionId: "123e4567-e89b-12d3-a456-426614174000",
              desktopId: "desktop",
            },
          }),
        },
      ],
      negatives: [],
    },
    {
      id: "route.push-unregister.request",
      positives: [
        {
          raw: json({
            deviceId: "device-001",
            routing: {
              version: 1,
              clientConnectionId: "123E4567-E89B-12D3-A456-426614174000",
              desktopId: "desktop",
            },
          }),
          encoded: json({
            deviceId: "device-001",
            routing: {
              version: 1,
              clientConnectionId: "123e4567-e89b-12d3-a456-426614174000",
              desktopId: "desktop",
            },
          }),
        },
      ],
      negatives: [],
    },
    {
      id: "route.browser-command.request",
      positives: [{ raw: routeFixture }],
      negatives: [],
    },
    {
      id: "procedure.beginMcpServerOauth.result",
      positives: [{ raw: procedureFixture }],
      negatives: [],
    },
    {
      id: "route.agent-statuses.response",
      positives: authMethodFixtures.map((raw) => ({ raw })),
      negatives: [],
    },
    {
      id: "procedure.browseHostDirectory.result",
      positives: nullableFixtures.map((raw) => ({ raw })),
      negatives: [],
    },
    {
      id: "websocket.server",
      positives: wsFixtures.map((raw) => ({ raw })),
      negatives: [json({ type: "unknown", seq: 0 })],
    },
  );
  return cases;
}

function codecMembers(
  graph: NativeSchemaGraph,
  language: "swift" | "kotlin",
): ReadonlyMap<string, string> {
  return new Map(rootAdapters(graph, language).map((root) => [root.id, root.memberName]));
}

function writeLanguageSources(
  directory: string,
  language: "kotlin" | "swift",
  files: Readonly<Record<string, string>>,
): void {
  for (const [path, contents] of Object.entries(files)) {
    if (!path.startsWith(`${language}/`)) continue;
    writeFileSync(join(directory, path.slice(language.length + 1)), contents, "utf8");
  }
}

function kotlinHarness(
  types: HarnessTypes,
  wsFixtures: readonly string[],
  cases: readonly HarnessCodecCase[],
  members: ReadonlyMap<string, string>,
): string {
  const quoted = (value: string) => JSON.stringify(value);
  const member = (id: string): string => {
    const value = members.get(id);
    if (!value) throw new Error(`Missing Kotlin root codec ${id}`);
    return value;
  };
  const rootChecks = cases.flatMap((test) => [
    ...test.positives.map(
      ({ raw, encoded }) =>
        `    rootRoundTrip(RemoteRootCodecs.${member(test.id)}, ${quoted(raw)}, ${quoted(encoded ?? raw)})`,
    ),
    ...test.negatives.map(
      (raw) => `    expectRootFailure(RemoteRootCodecs.${member(test.id)}, ${quoted(raw)})`,
    ),
  ]);
  return `import com.poracode.remote.v3.generated.*
import kotlinx.serialization.*
import kotlinx.serialization.json.*

private val json = Json { explicitNulls = true }

private fun wireEquals(left: JsonElement, right: JsonElement): Boolean = when {
    left is JsonObject && right is JsonObject -> left.keys == right.keys && left.all { (key, value) -> wireEquals(value, right.getValue(key)) }
    left is JsonArray && right is JsonArray -> left.size == right.size && left.indices.all { wireEquals(left[it], right[it]) }
    left is JsonPrimitive && right is JsonPrimitive && !left.isString && !right.isString && left.booleanOrNull == null && right.booleanOrNull == null -> left.doubleOrNull == right.doubleOrNull
    else -> left == right
}

private inline fun <reified T> roundTrip(raw: String) {
    val decoded = json.decodeFromString<T>(raw)
    val encoded = json.encodeToString(decoded)
    check(wireEquals(json.parseToJsonElement(encoded), json.parseToJsonElement(raw))) { "Wire mismatch: $encoded" }
    check(!encoded.contains(${quoted('"value":')})) { "Union value wrapper leaked: $encoded" }
    check(!encoded.contains("Option")) { "Union class name leaked: $encoded" }
}

private fun <T> rootRoundTrip(codec: RemoteRootCodec<T>, raw: String, expected: String) {
    val decoded = codec.decode(raw)
    val encoded = codec.encodeSnapshot(decoded)
    check(wireEquals(json.parseToJsonElement(encoded), json.parseToJsonElement(expected))) { "Root wire mismatch: $encoded" }
}

private fun <T> expectRootFailure(codec: RemoteRootCodec<T>, raw: String) {
    check(runCatching { codec.decode(raw) }.isFailure) { "Expected root failure for $raw" }
}

fun main() {
${rootChecks.join("\n")}
    val passthroughCodec = RemoteRootCodecs.${member("synthetic.unknown-passthrough")}
    val passthrough = passthroughCodec.decode(${quoted(JSON.stringify({ known: "original", extra: { preserved: true } }))})
    check(wireEquals(json.parseToJsonElement(passthroughCodec.encodeSnapshot(passthrough)), json.parseToJsonElement(${quoted(JSON.stringify({ known: "original", extra: { preserved: true } }))})))
    val changed = passthrough.value.copy(known = "changed")
    check(wireEquals(json.parseToJsonElement(passthroughCodec.encode(changed)), json.parseToJsonElement(${quoted(JSON.stringify({ known: "changed" }))})))
    val normalizedPush = RemoteRootCodecs.${member("route.push-register.request")}.decode(${quoted(JSON.stringify({ deviceId: "device-001", platform: "ios", routing: { version: 1, clientConnectionId: "123E4567-E89B-12D3-A456-426614174000", desktopId: "desktop" } }))})
    val normalizedRouting = (normalizedPush.value.routing as RemoteField.Value).value
    check(normalizedRouting.clientConnectionId == "123e4567-e89b-12d3-a456-426614174000")
    check(runCatching { RemoteRootCodecs.${member("synthetic.inclusive-bounds")}.encode(Double.NaN) }.isFailure) { "Expected non-finite encode failure" }
${wsFixtures.map((fixture) => `    roundTrip<${types.webSocket}>(${quoted(fixture)})`).join("\n")}
    roundTrip<${types.route}>(${quoted(routeFixture)})
    roundTrip<${types.procedure}>(${quoted(procedureFixture)})
    roundTrip<${types.primitive}>(${quoted(JSON.stringify("fixture"))})
    roundTrip<${types.primitive}>("1.5")
    roundTrip<${types.primitive}>("true")
    roundTrip<${types.numericLiteral}>("0")
    roundTrip<${types.numericLiteral}>("4")
    roundTrip<${types.constrainedString}>(${quoted(JSON.stringify("monthly"))})
    roundTrip<${types.constrainedString}>(${quoted(JSON.stringify("gemini:fixture"))})
    roundTrip<${types.utf16Length}>(${quoted(JSON.stringify("😀"))})
    roundTrip<${types.anyOf}>(${quoted(JSON.stringify("first-success"))})
    check(json.decodeFromString<${types.anyOf}>(${quoted(JSON.stringify("first-success"))}) is ${types.anyOf}.Option1) { "anyOf did not select the first successful branch" }
${authMethodFixtures.map((fixture) => `    roundTrip<${types.agentStatuses}>(${quoted(fixture)})`).join("\n")}
${nullableFixtures.map((fixture) => `    roundTrip<${types.nullable}>(${quoted(fixture)})`).join("\n")}
}
`;
}

function swiftHarness(
  types: HarnessTypes,
  wsFixtures: readonly string[],
  cases: readonly HarnessCodecCase[],
  members: ReadonlyMap<string, string>,
): string {
  const quoted = (value: string) => JSON.stringify(value);
  const member = (id: string): string => {
    const value = members.get(id);
    if (!value) throw new Error(`Missing Swift root codec ${id}`);
    return value;
  };
  const rootChecks = cases.flatMap((test) => [
    ...test.positives.map(
      ({ raw, encoded }) =>
        `    try rootRoundTrip(RemoteRootCodecs.${member(test.id)}, ${quoted(raw)}, ${quoted(encoded ?? raw)})`,
    ),
    ...test.negatives.map(
      (raw) => `    expectRootFailure(RemoteRootCodecs.${member(test.id)}, ${quoted(raw)})`,
    ),
  ]);
  return `import Foundation

private func canonical(_ data: Data) throws -> Data {
  let value = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
  return try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .fragmentsAllowed])
}

private func roundTrip<T: Codable>(_ type: T.Type, _ raw: String) throws {
  let source = Data(raw.utf8)
  let value = try JSONDecoder().decode(type, from: source)
  let encoded = try JSONEncoder().encode(value)
  let sourceCanonical = try canonical(source)
  let encodedCanonical = try canonical(encoded)
  precondition(sourceCanonical == encodedCanonical, "Wire mismatch: \\(String(decoding: encoded, as: UTF8.self))")
  let text = String(decoding: encoded, as: UTF8.self)
  precondition(!text.contains(${quoted('"value":')}), "Union value wrapper leaked: \\(text)")
  precondition(!text.contains("Option"), "Union class name leaked: \\(text)")
}

private func rootRoundTrip<T>(_ codec: RemoteRootCodec<T>, _ raw: String, _ expected: String) throws where T: Codable & Sendable {
  let decoded = try codec.decode(Data(raw.utf8))
  let encoded = try codec.encodeSnapshot(decoded)
  let encodedCanonical = try canonical(encoded)
  let expectedCanonical = try canonical(Data(expected.utf8))
  precondition(encodedCanonical == expectedCanonical, "Root wire mismatch: \\(String(decoding: encoded, as: UTF8.self))")
}

private func expectRootFailure<T>(_ codec: RemoteRootCodec<T>, _ raw: String) where T: Codable & Sendable {
  do { _ = try codec.decode(Data(raw.utf8)); preconditionFailure("Expected root failure for \\(raw)") } catch {}
}

@main
private struct Harness {
  static func main() throws {
${rootChecks.join("\n")}
    let passthroughCodec = RemoteRootCodecs.${member("synthetic.unknown-passthrough")}
    let passthrough = try passthroughCodec.decode(Data(${quoted(JSON.stringify({ known: "original", extra: { preserved: true } }))}.utf8))
    let snapshotActual = try canonical(passthroughCodec.encodeSnapshot(passthrough))
    let snapshotExpected = try canonical(Data(${quoted(JSON.stringify({ known: "original", extra: { preserved: true } }))}.utf8))
    precondition(snapshotActual == snapshotExpected)
    var changed = passthrough.value
    changed.known = "changed"
    let changedActual = try canonical(passthroughCodec.encode(changed))
    let changedExpected = try canonical(Data(${quoted(JSON.stringify({ known: "changed" }))}.utf8))
    precondition(changedActual == changedExpected)
    let normalizedPush = try RemoteRootCodecs.${member("route.push-register.request")}.decode(Data(${quoted(JSON.stringify({ deviceId: "device-001", platform: "ios", routing: { version: 1, clientConnectionId: "123E4567-E89B-12D3-A456-426614174000", desktopId: "desktop" } }))}.utf8))
    if case .value(let normalizedRouting) = normalizedPush.value.routing { precondition(normalizedRouting.clientConnectionId == "123e4567-e89b-12d3-a456-426614174000") } else { preconditionFailure("Missing normalized routing") }
    do { _ = try RemoteRootCodecs.${member("synthetic.inclusive-bounds")}.encode(Double.nan); preconditionFailure("Expected non-finite encode failure") } catch {}
${wsFixtures.map((fixture) => `    try roundTrip(${types.webSocket}.self, ${quoted(fixture)})`).join("\n")}
    try roundTrip(${types.route}.self, ${quoted(routeFixture)})
    try roundTrip(${types.procedure}.self, ${quoted(procedureFixture)})
    try roundTrip(${types.primitive}.self, ${quoted(JSON.stringify("fixture"))})
    try roundTrip(${types.primitive}.self, "1.5")
    try roundTrip(${types.primitive}.self, "true")
    try roundTrip(${types.numericLiteral}.self, "0")
    try roundTrip(${types.numericLiteral}.self, "4")
    try roundTrip(${types.constrainedString}.self, ${quoted(JSON.stringify("monthly"))})
    try roundTrip(${types.constrainedString}.self, ${quoted(JSON.stringify("gemini:fixture"))})
    try roundTrip(${types.utf16Length}.self, ${quoted(JSON.stringify("😀"))})
    try roundTrip(${types.anyOf}.self, ${quoted(JSON.stringify("first-success"))})
    if case .option1 = try JSONDecoder().decode(${types.anyOf}.self, from: Data(${quoted(JSON.stringify("first-success"))}.utf8)) {} else { preconditionFailure("anyOf did not select the first successful branch") }
${authMethodFixtures.map((fixture) => `    try roundTrip(${types.agentStatuses}.self, ${quoted(fixture)})`).join("\n")}
${nullableFixtures.map((fixture) => `    try roundTrip(${types.nullable}.self, ${quoted(fixture)})`).join("\n")}
  }
}
`;
}

function prepareHarness(): {
  readonly input: ReturnType<typeof authoritativeInput>;
  readonly types: HarnessTypes;
  readonly wsFixtures: readonly string[];
  readonly cases: readonly HarnessCodecCase[];
  readonly kotlinMembers: ReadonlyMap<string, string>;
  readonly swiftMembers: ReadonlyMap<string, string>;
} {
  const authoritative = authoritativeInput();
  const graph = buildNativeSchemaGraph([
    ...collectNativeSchemaRoots(authoritative.ir),
    ...syntheticRoots(),
  ]);
  const swift = emitSwiftBindings(authoritative.ir, graph);
  const kotlin = emitKotlinBindings(authoritative.ir, graph);
  const files = {
    ...Object.fromEntries(
      Object.entries(swift).map(([path, contents]) => [`swift/${path}`, contents]),
    ),
    ...Object.fromEntries(
      Object.entries(kotlin).map(([path, contents]) => [`kotlin/${path}`, contents]),
    ),
  };
  const input = { ir: authoritative.ir, graph, files };
  const wsFixtures = wsFixtureNames.map((name) =>
    readFileSync(join(fixtureDirectory, name), "utf8"),
  );
  return {
    input,
    types: {
      webSocket: requiredRoot(graph, "websocket.server"),
      route: requiredRoot(graph, "route.browser-command.request"),
      procedure: requiredRoot(graph, "procedure.beginMcpServerOauth.result"),
      primitive: primitiveUnionName(graph),
      numericLiteral: numericLiteralUnionName(graph),
      constrainedString: constrainedStringUnionName(graph),
      utf16Length: requiredRoot(graph, "synthetic.utf16Length"),
      anyOf: requiredRoot(graph, "synthetic.anyOf"),
      agentStatuses: requiredRoot(graph, "route.agent-statuses.response"),
      nullable: requiredRoot(graph, "procedure.browseHostDirectory.result"),
      ambiguous: requiredRoot(graph, "synthetic.ambiguous"),
      unknownPassthrough: requiredRoot(graph, "synthetic.unknown-passthrough"),
    },
    wsFixtures,
    cases: mutationCases(wsFixtures),
    kotlinMembers: codecMembers(graph, "kotlin"),
    swiftMembers: codecMembers(graph, "swift"),
  };
}

const swiftVersion = spawnSync("swiftc", ["--version"], { encoding: "utf8" });
const hasSwift6 = swiftVersion.status === 0 && /Swift version 6\./.test(swiftVersion.stdout);

describe("generated native union runtime wire format", () => {
  it("has a positive and negative generated-root fixture for every semantic validator", () => {
    const input = authoritativeInput();
    const cases = mutationCases([]);
    const byId = new Map(cases.map((test) => [test.id, test]));
    for (const id of input.ir.semanticValidatorIds) {
      const fixture = byId.get(`synthetic.semantic.${id}`);
      expect(fixture?.positives.length).toBeGreaterThan(0);
      expect(fixture?.negatives.length).toBeGreaterThan(0);
    }
  });

  it("compiles with Kotlin 2.4.10 / serialization 1.11.0 and runs flat union fixtures", () => {
    const harness = prepareHarness();
    const directory = mkdtempSync(join(tmpdir(), "poracode-kotlin-union-"));
    try {
      const sourceDirectory = join(directory, "src/main/kotlin");
      mkdirSync(sourceDirectory, { recursive: true });
      writeLanguageSources(sourceDirectory, "kotlin", harness.input.files);
      writeFileSync(
        join(sourceDirectory, "Harness.kt"),
        kotlinHarness(harness.types, harness.wsFixtures, harness.cases, harness.kotlinMembers),
        "utf8",
      );
      writeFileSync(
        join(directory, "settings.gradle.kts"),
        'rootProject.name = "native-union-runtime"\n',
        "utf8",
      );
      writeFileSync(
        join(directory, "build.gradle.kts"),
        `plugins {
    kotlin("jvm") version "2.4.10"
    kotlin("plugin.serialization") version "2.4.10"
    application
}
repositories { mavenCentral() }
dependencies { implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0") }
application { mainClass.set("HarnessKt") }
`,
        "utf8",
      );
      expect(() =>
        execFileSync(gradleWrapper, ["--no-daemon", "--console=plain", "-p", directory, "run"], {
          cwd: repositoryRoot,
          encoding: "utf8",
          stdio: "pipe",
          timeout: 300_000,
        }),
      ).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 360_000);

  it.runIf(hasSwift6)(
    "compiles in Swift 6 mode and runs the same flat union fixtures",
    () => {
      const harness = prepareHarness();
      const directory = mkdtempSync(join(tmpdir(), "poracode-swift-union-"));
      try {
        writeLanguageSources(directory, "swift", harness.input.files);
        writeFileSync(
          join(directory, "Harness.swift"),
          swiftHarness(harness.types, harness.wsFixtures, harness.cases, harness.swiftMembers),
          "utf8",
        );
        const sources = Object.keys(harness.input.files)
          .filter((path) => path.startsWith("swift/") && path.endsWith(".swift"))
          .map((path) => join(directory, path.slice("swift/".length)))
          .sort();
        const executable = join(directory, "native-union-runtime");
        expect(() => {
          execFileSync(
            "swiftc",
            ["-swift-version", "6", ...sources, join(directory, "Harness.swift"), "-o", executable],
            {
              encoding: "utf8",
              stdio: "pipe",
              timeout: 300_000,
            },
          );
          execFileSync(executable, [], {
            encoding: "utf8",
            stdio: "pipe",
            timeout: 30_000,
          });
        }).not.toThrow();
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    360_000,
  );
});
