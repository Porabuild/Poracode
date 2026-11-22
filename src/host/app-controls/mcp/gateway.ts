import { z } from "zod";
import type { StreamableHttpMcpToolSpec } from "../../mcp/StreamableHttpMcpIngress";
import { defineAppControlTool } from "./defineTools";
import type { AppControlsToolContext, ToolDomain } from "./tools/types";
import { summarizeToolDescription } from "./wireSchemas";

export const APP_CONTROL_DOMAINS = [
  "threads",
  "terminals",
  "projects",
  "workspaces",
  "git",
  "reviews",
  "schedules",
  "devices",
  "files",
  "mcp",
  "plugins",
  "skills",
  "providers",
  "settings",
  "memory",
  "experiments",
] as const;

export type AppControlDomainId = (typeof APP_CONTROL_DOMAINS)[number];

export interface RegisteredOperation {
  readonly spec: StreamableHttpMcpToolSpec;
  readonly domain: AppControlDomainId;
  readonly directTool: boolean;
}

const GATEWAY_OPERATION_TAG = Symbol("poracode.gatewayOperationResult");

interface TaggedGatewayResult {
  readonly [GATEWAY_OPERATION_TAG]: string;
  readonly result: unknown;
}

export function unwrapGatewayResult(
  toolName: string,
  value: unknown,
): { effectiveToolName: string; result: unknown } {
  if (value && typeof value === "object" && GATEWAY_OPERATION_TAG in value) {
    const tagged = value as TaggedGatewayResult;
    return { effectiveToolName: tagged[GATEWAY_OPERATION_TAG], result: tagged.result };
  }
  return { effectiveToolName: toolName, result: value };
}

function disabledSet(ctx: AppControlsToolContext): Set<string> {
  return new Set(ctx.identity.disabledTools ?? []);
}

function isReadOnly(spec: StreamableHttpMcpToolSpec): boolean {
  return spec.annotations?.readOnlyHint === true;
}

const MAX_INLINE_ERROR_SCHEMA_CHARS = 1_500;

function formatValidationError(error: unknown, spec: StreamableHttpMcpToolSpec): Error | undefined {
  if (!(error instanceof z.ZodError)) return undefined;
  const issues = error.issues
    .map((issue) => `${issue.path.join(".") || "params"}: ${issue.message}`)
    .join("; ");
  const serialized = JSON.stringify(spec.inputSchema);
  if (serialized.length <= MAX_INLINE_ERROR_SCHEMA_CHARS) {
    return new Error(
      `Invalid params for ${spec.name}: ${issues}. Expected inputSchema: ${serialized}`,
    );
  }
  const properties =
    spec.inputSchema.properties && typeof spec.inputSchema.properties === "object"
      ? Object.keys(spec.inputSchema.properties as Record<string, unknown>)
      : [];
  return new Error(
    `Invalid params for ${spec.name}: ${issues}. Accepted params: ${properties.join(", ")}. Call poracode_discover({ operations: ["${spec.name}"] }) for the full schema.`,
  );
}

function matchesQuery(entry: RegisteredOperation, tokens: readonly string[]): boolean {
  const haystack = `${entry.spec.name} ${entry.domain} ${entry.spec.description}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

const discoverInput = z.strictObject({
  domain: z.enum(APP_CONTROL_DOMAINS).optional().describe("Filter operations by domain."),
  query: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe("Keyword filter across operation names, domains, and descriptions."),
  operations: z
    .array(z.string().min(1))
    .min(1)
    .max(10)
    .optional()
    .describe("Fetch full parameter schemas for specific operation names."),
});

const invokeInput = z.strictObject({
  operation: z.string().min(1).describe("Operation name from poracode_discover."),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Arguments object matching the operation's inputSchema."),
});

const AUTO_SCHEMA_THRESHOLD = 5;

export function createGatewayDomain(options: {
  readonly operations: readonly RegisteredOperation[];
  readonly operationsByName: ReadonlyMap<string, RegisteredOperation>;
  dispatchOperation(
    name: string,
    args: Record<string, unknown>,
    ctx: AppControlsToolContext,
  ): Promise<unknown>;
}): ToolDomain {
  const { operations, operationsByName, dispatchOperation } = options;

  const discoverTool = defineAppControlTool({
    name: "poracode_discover",
    description:
      "Discover extended Poracode app-control operations and input schemas. Pass domain or query to list operations, or operations:[...] for full schemas before calling poracode_read/poracode_run.",
    input: discoverInput,
    run: (args, ctx) => {
      const disabled = disabledSet(ctx);
      const enabled = operations.filter((entry) => !disabled.has(entry.spec.name));

      if (args.operations && args.operations.length > 0) {
        const found: Array<Record<string, unknown>> = [];
        const unknown: string[] = [];
        const blocked: string[] = [];
        for (const name of args.operations) {
          const entry = operationsByName.get(name);
          if (!entry) {
            unknown.push(name);
            continue;
          }
          if (disabled.has(name)) {
            blocked.push(name);
            continue;
          }
          found.push({
            name: entry.spec.name,
            domain: entry.domain,
            access: isReadOnly(entry.spec) ? "read" : "write",
            ...(entry.directTool ? { directTool: true } : {}),
            description: entry.spec.description,
            inputSchema: entry.spec.inputSchema,
          });
        }
        return {
          operations: found,
          ...(unknown.length > 0 ? { unknown } : {}),
          ...(blocked.length > 0 ? { disabled: blocked } : {}),
        };
      }

      if (args.domain !== undefined || args.query !== undefined) {
        const tokens = args.query
          ? args.query
              .toLowerCase()
              .split(/[\s,/_-]+/u)
              .filter(Boolean)
          : [];
        const matches = enabled.filter(
          (entry) =>
            (args.domain === undefined || entry.domain === args.domain) &&
            (tokens.length === 0 || matchesQuery(entry, tokens)),
        );
        const includeSchema = matches.length <= AUTO_SCHEMA_THRESHOLD;
        return {
          count: matches.length,
          operations: matches.map((entry) => ({
            name: entry.spec.name,
            domain: entry.domain,
            access: isReadOnly(entry.spec) ? "read" : "write",
            ...(entry.directTool ? { directTool: true } : {}),
            summary: summarizeToolDescription(entry.spec.description),
            ...(includeSchema ? { inputSchema: entry.spec.inputSchema } : {}),
          })),
        };
      }

      const byDomain = new Map<AppControlDomainId, { read: string[]; write: string[] }>();
      for (const domain of APP_CONTROL_DOMAINS) {
        byDomain.set(domain, { read: [], write: [] });
      }
      for (const entry of enabled) {
        const bucket = byDomain.get(entry.domain);
        if (!bucket) continue;
        if (isReadOnly(entry.spec)) bucket.read.push(entry.spec.name);
        else bucket.write.push(entry.spec.name);
      }
      return {
        domains: APP_CONTROL_DOMAINS.map((domain) => {
          const bucket = byDomain.get(domain)!;
          return {
            domain,
            count: bucket.read.length + bucket.write.length,
            ...(bucket.read.length > 0 ? { read: bucket.read } : {}),
            ...(bucket.write.length > 0 ? { write: bucket.write } : {}),
          };
        }).filter((entry) => entry.count > 0),
      };
    },
  });

  async function invoke(
    operation: string,
    params: Record<string, unknown> | undefined,
    ctx: AppControlsToolContext,
    readOnlyRequired: boolean,
  ): Promise<unknown> {
    const entry = operationsByName.get(operation);
    if (!entry) {
      throw new Error(
        `Unknown Poracode operation: ${operation}. Call poracode_discover to list available operations.`,
      );
    }
    if (disabledSet(ctx).has(operation)) {
      throw new Error(`Tool disabled by Poracode: ${operation}`);
    }
    if (readOnlyRequired && !isReadOnly(entry.spec)) {
      throw new Error(
        `Operation "${operation}" can mutate state and cannot run via poracode_read. Call poracode_run instead.`,
      );
    }
    try {
      const result = await dispatchOperation(operation, params ?? {}, ctx);
      if (operation === "screenshot_device") {
        return { [GATEWAY_OPERATION_TAG]: operation, result } satisfies TaggedGatewayResult;
      }
      return result;
    } catch (error) {
      const enriched = formatValidationError(error, entry.spec);
      if (enriched) throw enriched;
      throw error;
    }
  }

  const readTool = defineAppControlTool({
    name: "poracode_read",
    description:
      "Execute a read-only Poracode operation discovered via poracode_discover. Pass operation and params.",
    input: invokeInput,
    run: ({ operation, params }, ctx) => invoke(operation, params, ctx, true),
  });

  const runTool = defineAppControlTool({
    name: "poracode_run",
    description:
      "Execute a mutating Poracode operation discovered via poracode_discover. Confirm consequential or destructive actions with the user first. Pass operation and params.",
    input: invokeInput,
    run: ({ operation, params }, ctx) => invoke(operation, params, ctx, false),
  });

  return {
    specs: [discoverTool.spec, readTool.spec, runTool.spec],
    handlers: {
      [discoverTool.spec.name]: discoverTool.handler,
      [readTool.spec.name]: readTool.handler,
      [runTool.spec.name]: runTool.handler,
    },
  };
}
