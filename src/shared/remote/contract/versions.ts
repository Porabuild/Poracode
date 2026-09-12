import { PORACODE_REMOTE_PROTOCOL_VERSION } from "../protocol";

/**
 * Binding-format version for the generated remote-v3 IR / JSON Schema bundle.
 * Independent of {@link PORACODE_REMOTE_PROTOCOL_VERSION}: bump this when the
 * generated artifact layout or binding semantics change, even if the wire
 * protocol stays at v3.
 *
 * v2: query-parameter codecs, per-object unknown-field policy, semantic
 * validator IDs, generator version, and a separate manifest hash. Protocol
 * remains v3 / manifest `formatVersion` 1.
 */
export const REMOTE_BINDING_FORMAT_VERSION = 2 as const;

/**
 * Implementation version of the TypeScript/native generator boundary.
 * Independent of the binding-format version: bump when generated behavior
 * changes even if the published IR shape stays.
 *
 * v3 makes native root codecs enforce the complete generated schema and all
 * portable semantic validators during decode and encode.  The binding IR
 * shape is unchanged, but consumers compiled from v2 output must regenerate.
 */
export const REMOTE_GENERATOR_VERSION = 3 as const;

export const REMOTE_CONTRACT_NAME = "poracode.remote" as const;

export const REMOTE_PROTOCOL_VERSION = PORACODE_REMOTE_PROTOCOL_VERSION;

export const REMOTE_JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";
