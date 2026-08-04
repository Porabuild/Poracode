/**
 * OpenCode's `/v2` SDK subpath is its generated compatibility client, not the
 * current `/api` session protocol. Poracode intentionally uses the legacy
 * `client.session.*` surface while OpenCode Desktop keeps its V2 sidecar gated.
 */
export type * from "@opencode-ai/sdk/v2/client";
export type LegacyOpenCodeClient = import("@opencode-ai/sdk/v2/client").OpencodeClient;
