type JsonSchema = Readonly<Record<string, unknown>>;

const FIXTURE_TIME = "2026-08-12T10:03:00.000Z";
const FIXTURE_UUID = "123e4567-e89b-42d3-a456-426614174000";

const STRING_EXAMPLES: Readonly<Record<string, string>> = {
  absolutePath: "/tmp/native-e2e-fixture/README.md",
  baseBranch: "main",
  branch: "fixture-branch",
  checkpointItemId: "checkpoint-fixture",
  content: "fixture content",
  deviceToken: "device-token-fixture",
  directoryPath: "",
  filePath: "README.md",
  flowId: "flow-fixture",
  forwardId: "forward-fixture",
  fwt: "forward-token-fixture",
  headBranch: "fixture-branch",
  itemId: "item-fixture-assistant",
  manifestPath: "/tmp/native-e2e-fixture/workflow.json",
  message: "fixture message",
  name: "fixture",
  nextName: "renamed-fixture",
  parentItemId: "item-fixture-parent",
  path: "README.md",
  projectId: "project-fixture-001",
  prompt: "fixture prompt",
  query: "README",
  ref: "main",
  requestId: "request-fixture",
  runId: "9",
  threadId: "thread-fixture-001",
  transcriptDir: "/tmp/native-e2e-fixture/transcripts",
  updatedAt: FIXTURE_TIME,
  url: "https://example.test/fixture",
  worktreePath: "/tmp/native-e2e-fixture-worktree",
};

export function schemaExample(schema: unknown, propertyName?: string): unknown {
  if (!isSchema(schema)) return {};
  return buildExample(schema, schema, propertyName);
}

function buildExample(schema: JsonSchema, root: JsonSchema, propertyName?: string): unknown {
  if (typeof schema.$ref === "string") {
    return buildExample(resolveRef(root, schema.$ref), root, propertyName);
  }
  if (Object.hasOwn(schema, "const")) return schema.const;
  if (Object.hasOwn(schema, "default")) return structuredClone(schema.default);
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return structuredClone(schema.enum[0]);
  const variants = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : undefined;
  if (variants) {
    const preferred =
      variants.find((entry) => isSchema(entry) && entry.type !== "null") ?? variants[0];
    return buildExample(preferred as JsonSchema, root, propertyName);
  }
  if (Array.isArray(schema.type)) {
    const preferred = schema.type.find((type) => type !== "null") ?? schema.type[0];
    return buildExample({ ...schema, type: preferred }, root, propertyName);
  }
  switch (schema.type) {
    case "object": {
      const properties = isSchema(schema.properties) ? schema.properties : {};
      const required = Array.isArray(schema.required) ? schema.required : [];
      return Object.fromEntries(
        required.map((key) => {
          const name = String(key);
          return [name, buildExample(asSchema(properties[name]), root, name)];
        }),
      );
    }
    case "array": {
      const count = typeof schema.minItems === "number" ? schema.minItems : 0;
      return Array.from({ length: count }, () => buildExample(asSchema(schema.items), root));
    }
    case "boolean":
      return false;
    case "integer":
    case "number":
      return numericExample(schema);
    case "null":
      return null;
    case "string":
      return stringExample(schema, propertyName);
    default:
      return {};
  }
}

function numericExample(schema: JsonSchema): number {
  if (typeof schema.minimum === "number") return schema.minimum;
  if (typeof schema.exclusiveMinimum === "number") return schema.exclusiveMinimum + 1;
  if (typeof schema.maximum === "number" && schema.maximum < 0) return schema.maximum;
  return 1;
}

function stringExample(schema: JsonSchema, propertyName?: string): string {
  if (schema.format === "date-time") return FIXTURE_TIME;
  if (schema.format === "uuid") return FIXTURE_UUID;
  if (schema.format === "uri") return "https://example.test/fixture";
  const preferred = propertyName ? STRING_EXAMPLES[propertyName] : undefined;
  let value = preferred ?? "fixture";
  const minimum = typeof schema.minLength === "number" ? schema.minLength : 0;
  while (value.length < minimum) value += "x";
  if (typeof schema.maxLength === "number") value = value.slice(0, schema.maxLength);
  return value;
}

function resolveRef(root: JsonSchema, ref: string): JsonSchema {
  if (!ref.startsWith("#/")) throw new Error(`Unsupported generated schema ref: ${ref}`);
  let current: unknown = root;
  for (const raw of ref.slice(2).split("/")) {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isSchema(current) || !(key in current)) {
      throw new Error(`Generated schema ref does not resolve: ${ref}`);
    }
    current = current[key];
  }
  return asSchema(current);
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asSchema(value: unknown): JsonSchema {
  return isSchema(value) ? value : {};
}
