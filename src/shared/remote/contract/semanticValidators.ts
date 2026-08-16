import { z } from "zod";
import { omittedCallEnvelopeSchema, omittedResultSchema } from "../../ipc/resultCodec";
import {
  gitAddWorktreePayloadSchema,
  gitDeleteBranchPayloadSchema,
  gitRemoveWorktreePayloadSchema,
} from "../../contracts/git";
import {
  mcpHttpTransportSchema,
  mcpServerSchema,
  mcpSseTransportSchema,
} from "../../contracts/mcpServer";
import { prWatchInputSchema, prWatchSchema } from "../../contracts/prWatch";
import { threadGoalControlSchema } from "../../contracts/thread";
import {
  remotePushRegistrationRoutingSchema,
  remotePushRegistrationSchema,
  remoteTerminalOutputCursorSyncV1Schema,
  remoteTerminalWatchResultReadySchema,
  remoteWebPushSubscriptionSchema,
  remoteWebSocketServerMessageSchema,
} from "../protocol";
import { compareUnicodeCodePoints } from "./unicodeOrder";
import { unwrapZodSchema } from "./unknownFields";

export interface SemanticValidator {
  readonly id: string;
  readonly reason: string;
}

interface ZodCheck {
  readonly _zod?: { readonly def?: { readonly check?: string } };
}

interface ZodInternals {
  readonly _zod?: {
    readonly def?: {
      readonly type?: string;
      readonly checks?: readonly ZodCheck[];
      readonly schema?: z.ZodType;
    };
  };
}

function internals(schema: z.ZodType): ZodInternals {
  return schema as ZodInternals;
}

function checkNames(schema: z.ZodType): string[] {
  return (internals(schema)._zod?.def?.checks ?? []).flatMap((check) => {
    const name = check._zod?.def?.check;
    return name ? [name] : [];
  });
}

function hasTrimCheck(schema: z.ZodType): boolean {
  const names = checkNames(schema);
  return names.includes("overwrite") && names.some((name) => name === "min_length");
}

function hasCustomCheck(schema: z.ZodType): boolean {
  return checkNames(schema).includes("custom");
}

const REGISTERED: ReadonlyArray<{
  readonly schema: z.ZodType;
  readonly validator: SemanticValidator;
}> = [
  {
    schema: omittedResultSchema,
    validator: {
      id: "void-result.omit-field",
      reason: "void results are omitted; null is not a unit value",
    },
  },
  {
    schema: omittedCallEnvelopeSchema,
    validator: {
      id: "void-envelope.omit-result",
      reason: "success envelope is exactly {}; result:null is invalid",
    },
  },
  {
    schema: threadGoalControlSchema,
    validator: {
      id: "thread.goal.objective.trim",
      reason: "goal objective is trimmed and must stay non-empty",
    },
  },
  {
    schema: mcpServerSchema,
    validator: {
      id: "mcp.reserved-name",
      reason: "MCP server name must not collide with a built-in server",
    },
  },
  {
    schema: mcpHttpTransportSchema,
    validator: {
      id: "mcp.valid-url",
      reason: "MCP HTTP URL must be http(s)",
    },
  },
  {
    schema: mcpSseTransportSchema,
    validator: {
      id: "mcp.valid-url",
      reason: "MCP SSE URL must be http(s)",
    },
  },
  {
    schema: prWatchInputSchema,
    validator: {
      id: "pr-watch.agent-required-when-enabled",
      reason: "watching a PR requires an agent and model",
    },
  },
  {
    schema: gitAddWorktreePayloadSchema,
    validator: {
      id: "git.add-worktree.frozen-source",
      reason: "owner token / frozen source branch require createBranch, branch, and startPoint",
    },
  },
  {
    schema: gitRemoveWorktreePayloadSchema,
    validator: {
      id: "git.remove-worktree.owner-requires-branch",
      reason: "an expected worktree owner requires an expected branch",
    },
  },
  {
    schema: gitDeleteBranchPayloadSchema,
    validator: {
      id: "git.delete-branch.remote-cannot-have-owner",
      reason: "a remote branch cannot have a local worktree owner",
    },
  },
  {
    schema: remotePushRegistrationSchema,
    validator: {
      id: "push.registration.platform-fields",
      reason: "push token fields must match the selected native or web platform",
    },
  },
  {
    schema: remoteTerminalWatchResultReadySchema,
    validator: {
      id: "terminal.cursor.ready-range-utf16",
      reason: "ready cursor ranges are ordered and data length is measured in UTF-16 code units",
    },
  },
  {
    schema: remoteTerminalOutputCursorSyncV1Schema,
    validator: {
      id: "terminal.cursor.output-range",
      reason: "terminal output cursor ranges are ordered",
    },
  },
];

function objectProperty(schema: z.ZodType, name: string): z.ZodType {
  const shape = (schema as unknown as { readonly shape?: Record<string, z.ZodType> }).shape;
  const property = shape?.[name];
  if (!property) throw new Error(`Unable to register semantic validator for property ${name}`);
  return property;
}

function discriminatedOption(schema: z.ZodType, type: string): z.ZodType {
  const options = (schema as unknown as { readonly options?: readonly z.ZodType[] }).options ?? [];
  const option = options.find((candidate) => {
    const typeSchema = objectProperty(candidate, "type") as unknown as { readonly value?: unknown };
    return typeSchema.value === type;
  });
  if (!option) throw new Error(`Unable to register semantic validator for ${type}`);
  return option;
}

const PORTABLE_CUSTOM_VALIDATORS: ReadonlyArray<{
  readonly schema: z.ZodType;
  readonly validator: SemanticValidator;
}> = [
  ...REGISTERED,
  {
    schema: objectProperty(mcpHttpTransportSchema, "url"),
    validator: {
      id: "mcp.valid-url",
      reason: "MCP HTTP URL must be http(s)",
    },
  },
  {
    schema: objectProperty(mcpSseTransportSchema, "url"),
    validator: {
      id: "mcp.valid-url",
      reason: "MCP SSE URL must be http(s)",
    },
  },
  {
    schema: prWatchSchema,
    validator: {
      id: "pr-watch.agent-required-when-enabled",
      reason: "watching a PR requires an agent and model",
    },
  },
  {
    schema: objectProperty(remoteWebPushSubscriptionSchema, "endpoint"),
    validator: {
      id: "push.web.endpoint-https",
      reason: "web push endpoints must use HTTPS",
    },
  },
  {
    schema: objectProperty(remotePushRegistrationRoutingSchema, "desktopId"),
    validator: {
      id: "push.routing.identifier-no-controls",
      reason: "push routing identifiers cannot contain ASCII control characters",
    },
  },
  {
    schema: discriminatedOption(remoteWebSocketServerMessageSchema, "terminal-output"),
    validator: {
      id: "terminal.cursor.output-data-utf16",
      reason: "terminal output data length is measured in UTF-16 code units",
    },
  },
];

export function semanticValidatorsForSchema(schema: z.ZodType): readonly SemanticValidator[] {
  const found: SemanticValidator[] = [];
  const seen = new Set<string>();
  const unwrapped = unwrapZodSchema(schema);
  const push = (validator: SemanticValidator) => {
    if (seen.has(validator.id)) return;
    seen.add(validator.id);
    found.push(validator);
  };

  for (const entry of PORTABLE_CUSTOM_VALIDATORS) {
    if (schema === entry.schema || unwrapped === unwrapZodSchema(entry.schema)) {
      push(entry.validator);
    }
  }
  if (hasTrimCheck(unwrapped) || hasTrimCheck(schema)) {
    push({ id: "string.trim", reason: "string is trimmed before min/max checks" });
  }
  if ((hasCustomCheck(unwrapped) || hasCustomCheck(schema)) && found.length === 0) {
    push({
      id: "zod.custom-refine",
      reason: "JSON Schema cannot express this refine/superRefine",
    });
  }
  return found;
}

export function collectRegisteredSemanticValidatorIds(): string[] {
  return [
    "string.trim",
    ...new Set(PORTABLE_CUSTOM_VALIDATORS.map((entry) => entry.validator.id)),
  ].sort(compareUnicodeCodePoints);
}
