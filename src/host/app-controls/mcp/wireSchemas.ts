import { isJsonRecord, publishToolInputSchema } from "../../mcp/publishToolInputSchema";

type Json = Record<string, unknown>;
const isJson = isJsonRecord;

const COMPACT_SELECTION_BINDING: Json = {
  type: "object",
  description: "Opaque binding from list_installed_agents or get_project.",
};

const COMPACT_CREW: Json = {
  type: "object",
  description: "Optional crew role config.",
};

const COMPACT_COMPOSER_CONFIG: Json = {
  type: "object",
  description: "Composer config (also accepts selectionBinding and crew from get_project).",
  properties: {
    model: { type: "string", minLength: 1 },
    effort: { type: "string" },
    contextSize: { type: "string" },
    fast: { type: "boolean" },
    thinking: { type: "boolean" },
    mode: { type: "string" },
    approvalPolicy: { type: "string" },
    sandboxMode: { type: "string" },
    browserMcp: { type: "boolean" },
    crossagentMcp: { type: "boolean" },
    computerUse: { type: "boolean" },
    chromeMcp: { type: "boolean" },
    mcpServerOverrides: { type: "object" },
    pluginOverrides: { type: "object" },
  },
};

const COMPACT_QUESTION_ANSWER: Json = {
  type: "object",
  description:
    "Form reply: {sourceItemId?, questions:[{header, question, selected:[{label}], customAnswer?}]}.",
};

const COMPACT_MODEL_SELECTION: Json = {
  type: "object",
  description:
    "Provider/model selection (agentKind, model, optional effort/fast/thinking/contextSize).",
  properties: {
    agentKind: { type: "string", minLength: 1 },
    model: { type: "string", minLength: 1 },
    effort: { type: "string" },
    fast: { type: "boolean" },
    thinking: { type: "boolean" },
    contextSize: { type: "string" },
  },
};

const COMPACT_SEGMENTS: Json = {
  type: "array",
  description:
    "Structured prompt segments: {kind:'text',text} | {kind:'attachment',path,mimeType?} | {kind:'mention',...}.",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", minLength: 1 },
      text: { type: "string" },
      path: { type: "string" },
      mimeType: { type: "string" },
    },
  },
};

const COMPACT_FORGE_ACCOUNT: Json = {
  type: "object",
  description: "Public account {forge, host, login} from review_repository.",
  required: ["forge", "host", "login"],
  properties: {
    forge: { type: "string" },
    host: { type: "string" },
    login: { type: "string", minLength: 1 },
  },
};

function looksLikeComposerConfig(node: Json): boolean {
  const props = isJson(node.properties) ? node.properties : undefined;
  return Boolean(props && "model" in props && ("selectionBinding" in props || "crew" in props));
}

function looksLikeModelSelection(node: Json): boolean {
  const props = isJson(node.properties) ? node.properties : undefined;
  return Boolean(props && "agentKind" in props && "model" in props && "selectionBinding" in props);
}

function looksLikeSegmentsArray(node: Json): boolean {
  if (node.type !== "array" || !isJson(node.items)) return false;
  const props = isJson(node.items.properties) ? node.items.properties : undefined;
  return Boolean(
    props && "kind" in props && ("path" in props || "mimeType" in props || "threadId" in props),
  );
}

function looksLikeForgeAccount(node: Json): boolean {
  const props = isJson(node.properties) ? node.properties : undefined;
  return Boolean(props && "forge" in props && "host" in props && "login" in props);
}

function preserveNullable(source: Json, target: Json): Json {
  return source.nullable === true ? { ...target, nullable: true } : { ...target };
}

function compactNode(value: unknown, propertyName?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => compactNode(item));
  if (!isJson(value)) return value;

  if (propertyName === "selectionBinding" && isJson(value.properties)) {
    return preserveNullable(value, COMPACT_SELECTION_BINDING);
  }
  if (propertyName === "crew" && isJson(value.properties)) {
    return preserveNullable(value, COMPACT_CREW);
  }
  if (propertyName === "questionAnswer" && isJson(value.properties)) {
    return preserveNullable(value, COMPACT_QUESTION_ANSWER);
  }
  if (looksLikeComposerConfig(value)) {
    return preserveNullable(value, COMPACT_COMPOSER_CONFIG);
  }
  if (looksLikeModelSelection(value)) {
    return preserveNullable(value, COMPACT_MODEL_SELECTION);
  }
  if (propertyName === "segments" && looksLikeSegmentsArray(value)) {
    return preserveNullable(value, COMPACT_SEGMENTS);
  }
  if (propertyName === "forgeAccount" && looksLikeForgeAccount(value)) {
    return preserveNullable(value, COMPACT_FORGE_ACCOUNT);
  }

  const next: Json = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "properties" && isJson(child)) {
      next.properties = Object.fromEntries(
        Object.entries(child).map(([name, prop]) => [name, compactNode(prop, name)]),
      );
      continue;
    }
    if (key === "items") {
      next.items = compactNode(child);
      continue;
    }
    next[key] = child;
  }
  return next;
}

/**
 * Project a tool schema onto provider-safe keywords and replace repeated giant
 * internal sub-schemas (composer config, selection bindings, crew, segments,
 * forge account) with compact single-source shapes. Full Zod validation still
 * runs at dispatch time.
 */
export function compactAppControlInputSchema(schema: Record<string, unknown>): Json {
  const published = publishToolInputSchema(schema);
  const compacted = compactNode(published);
  return isJson(compacted) ? compacted : published;
}

/** Extract a concise first-sentence summary for discovery index rows. */
export function summarizeToolDescription(description: string, maxLength = 140): string {
  const firstSentence = description.split(/\.\s+/u)[0]?.trim() ?? description.trim();
  const normalized = firstSentence.endsWith(".") ? firstSentence : `${firstSentence}.`;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}
