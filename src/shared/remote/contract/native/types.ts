export type NativeLanguage = "swift" | "kotlin";

export type JsonSchema = Readonly<Record<string, unknown>>;

export interface NativeQueryCodec {
  readonly name: string;
  readonly kind: "string" | "int" | "decimal" | "0-or-1" | "JSON-string";
  readonly optional: boolean;
  readonly repeated: false;
}

export interface NativeRouteIr {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly auth: string;
  readonly scopes: readonly string[];
  readonly scopeResolution?: string;
  readonly queryParameters?: readonly string[];
  readonly queryCodecs?: readonly NativeQueryCodec[];
  readonly pathParameters?: readonly string[];
  readonly legacy?: true;
  readonly idempotency?: string;
  readonly request: {
    readonly bodyKind: "json" | "empty" | "raw-upload";
    readonly jsonSchema?: JsonSchema;
    readonly querySchema?: JsonSchema;
    readonly pathSchema?: JsonSchema;
  };
  readonly response: {
    readonly wireKind: "json" | "binary" | "empty" | "unit" | "redirect-html" | "procedure-result";
    readonly status: number;
    readonly contentType?: string;
    readonly errorStatus?: number;
    readonly errorBodyKind?: string;
    readonly jsonSchema?: JsonSchema;
  };
}

export interface NativeProcedureIr {
  readonly name: string;
  readonly scope: string;
  readonly owner: string;
  readonly timeout?: string;
  readonly request: JsonSchema;
  readonly result:
    | { readonly kind: "json"; readonly schema: JsonSchema }
    | { readonly kind: "omitted"; readonly presence: "omitted"; readonly never: "null" };
}

export interface NativeBindingIr {
  readonly contract: "poracode.remote";
  readonly protocolVersion: 8;
  readonly bindingFormatVersion: 2;
  readonly generatorVersion: 3;
  readonly manifestFormatVersion: 1;
  readonly sourceHash: string;
  readonly manifestHash: string;
  readonly unknownObjectFields: "ignore" | "reject";
  readonly inventory: {
    readonly routes: number;
    readonly procedures: number;
    readonly voidProcedureResults: number;
    readonly jsonProcedureResults: number;
    readonly webSocketClientMessages: number;
    readonly webSocketServerMessages: number;
    readonly [key: string]: unknown;
  };
  readonly semanticValidatorIds: readonly string[];
  readonly portableTransformIds: readonly string[];
  readonly routes: readonly NativeRouteIr[];
  readonly procedures: readonly NativeProcedureIr[];
  readonly webSocket: {
    readonly clientMessages: readonly string[];
    readonly serverMessages: readonly string[];
    readonly clientSchema: JsonSchema;
    readonly serverSchema: JsonSchema;
    readonly queryCodecs: readonly NativeQueryCodec[];
  };
}

export interface NativeSchemaRoot {
  readonly id: string;
  readonly preferredName: string;
  readonly schema: JsonSchema;
  readonly transport: string;
}

export interface NativeTypeNode {
  readonly hash: string;
  readonly name: string;
  readonly schema: JsonSchema;
}

export interface NativeSchemaGraph {
  readonly roots: ReadonlyMap<string, NativeTypeNode>;
  readonly nodes: readonly NativeTypeNode[];
  /** Every recursively reachable schema, including unnamed primitive nodes. */
  readonly validationNodes: readonly NativeTypeNode[];
}

export interface GeneratedNativeFile {
  readonly path: string;
  readonly contents: string;
}

export interface NativeBindingOutput {
  readonly files: Readonly<Record<string, string>>;
  readonly manifest: Readonly<Record<string, unknown>>;
}
