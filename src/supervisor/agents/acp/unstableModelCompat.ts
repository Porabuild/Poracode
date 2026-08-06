/**
 * Compatibility shim for the pre-1.0 ACP "unstable session models" surface.
 *
 * `@agentclientprotocol/sdk` 1.x removed the `@experimental` model API that
 * the 0.x SDK exposed: the `models: { currentModelId, availableModels }`
 * field on `session/new` / `session/load` responses, the `ModelInfo` /
 * `SessionModelState` schema types, and the `session/set_model` request
 * (`unstable_setSessionModel`).
 *
 * Some agent CLIs still speak that wire shape. cursor-agent advertises its
 * model list through `session/new.models`, while Grok 0.2.x advertises the
 * same shape through `initialize._meta.modelState`; neither exposes a
 * `"model"`-category config option. The Copilot per-model effort probe also
 * drives model switches through `session/set_model`. The wire protocol itself
 * is unchanged — the SDK just no longer types it and the
 * `ClientSideConnection` passes responses through without stripping unknown
 * fields — so this module re-declares the removed shapes locally (with safe
 * `unknown` narrowing, mirroring the existing `configOptions` pattern) and
 * sends the removed request through the SDK's raw `request()` escape hatch.
 *
 * The generic `configOptions` `"model"` category remains the primary path
 * wherever an agent provides it; callers use this shim only as the fallback,
 * exactly as with the 0.x SDK.
 *
 * TODO: remove once cursor-agent, Grok, and other holdouts expose a `"model"`
 * config option in `configOptions`.
 */

import type { ClientSideConnection } from "@agentclientprotocol/sdk";

/** Mirror of the removed pre-1.0 `ModelInfo` schema type. */
export type UnstableModelInfo = {
  modelId: string;
  name: string;
  description?: string | null;
  _meta?: Record<string, unknown> | null;
};

/** Mirror of the removed pre-1.0 `SessionModelState` schema type. */
export type UnstableSessionModelState = {
  currentModelId?: string;
  availableModels: UnstableModelInfo[];
};

/** Wire name of the removed pre-1.0 `unstable_setSessionModel` request. */
const UNSTABLE_SET_SESSION_MODEL_METHOD = "session/set_model";

function isUnstableModelInfo(value: unknown): value is UnstableModelInfo {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { modelId?: unknown; name?: unknown };
  return typeof candidate.modelId === "string" && typeof candidate.name === "string";
}

/** Safely narrow the removed ACP model-state wire shape from any container. */
export function readUnstableModelState(value: unknown): UnstableSessionModelState | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { currentModelId, availableModels } = value as {
    currentModelId?: unknown;
    availableModels?: unknown;
  };
  if (!Array.isArray(availableModels)) {
    return undefined;
  }
  return {
    ...(typeof currentModelId === "string" ? { currentModelId } : {}),
    availableModels: availableModels.filter(isUnstableModelInfo),
  };
}

/**
 * Read the unstable `models` field from a `session/new` / `session/load`
 * response. The 1.x SDK no longer types the field, but agents that still
 * emit it reach us untouched (`ClientSideConnection` does not strip unknown
 * response fields), so narrow it safely from `unknown`.
 */
export function readUnstableSessionModels(
  response: unknown,
): UnstableSessionModelState | undefined {
  if (typeof response !== "object" || response === null) {
    return undefined;
  }
  const models = (response as { models?: unknown }).models;
  return readUnstableModelState(models);
}

/**
 * Grok 0.2.x advertises the same removed model-state shape in
 * `initialize._meta.modelState` instead of `session/new.models`.
 */
export function readUnstableInitializeModels(meta: unknown): UnstableSessionModelState | undefined {
  if (typeof meta !== "object" || meta === null) {
    return undefined;
  }
  return readUnstableModelState((meta as { modelState?: unknown }).modelState);
}

/**
 * Send the removed `session/set_model` request through the SDK's raw
 * `request()` escape hatch. Same semantics as the 0.x SDK's
 * `connection.unstable_setSessionModel(...)`: resolves on ack, rejects with
 * a `RequestError` (method-not-found on agents that dropped the method).
 */
export async function setUnstableSessionModel(
  connection: ClientSideConnection,
  params: { sessionId: string; modelId: string },
): Promise<void> {
  await connection.request(UNSTABLE_SET_SESSION_MODEL_METHOD, params);
}
