/**
 * Neutral LIVE session-configuration actions for Devin's standard ACP config
 * options (`devin.config.list` / `devin.config.set`).
 *
 * Devin 3000.11.3 advertises its live session settings as STANDARD ACP
 * session config options — local sessions carry `mode`, `model` (108 values
 * in 53 nested groups), `thought_level` and `speed` (the fast/standard
 * quality selector, tmp/devin/checkpoint-l-native-pair-controls.json);
 * cloud sessions carry `org_id`, `repos`, `persona_slug`, `devin_version`
 * and `platform` (all with `category: null`). Mid-prompt writes are live-qualified for the LOCAL
 * agent (tmp/devin/probe/results/root-live-config-qualification-2.json: a
 * `model` setter accepted WHILE a prompt was pending, echoed
 * `thought_level`, and the follow-up prompt ran on the new model) — that
 * qualification is declared through the shared
 * `AcpSessionBehavior.allowConfigWritesDuringPrompt` seam by the launcher,
 * not here. Cloud stays unqualified and keeps the shared default reject.
 *
 * Both actions delegate to the shared ACP session's live config surface on
 * the internal action transport (`getConfigOptions` / `setConfigOption`) —
 * never to an extension RPC. The shared side owns validation against the
 * retained normalized options, exactly-once sends, echo confirmation, the
 * single config writer, session-owner fencing, and the reconciled config
 * listener; this module only shapes the neutral seam. The pair is declared
 * ONLY when the transport carries both members, so an older shared seam
 * (or a session without the live surface) advertises nothing.
 *
 * Config ids and select value ids are opaque exact native identifiers —
 * 36-char org UUIDs, long persona slugs, composite Fusion pairs — so this
 * seam applies NO field-length caps of its own (a cap would refuse
 * legitimate advertised ids the agent itself ships). The bounds that remain
 * are the outer 512 KiB serialized-result JSON bound below and the shared
 * seam's actual advertised-membership/type validation before any wire send.
 *
 * `org_id` is refused before ANY wire send: the organization is part of the
 * session's execution boundary (identity + account scope), so changing it
 * live would silently run the session under a different org. The profile
 * settings own that change and a NEW session picks it up.
 */

import { assertBoundedJson } from "@/shared/jsonBounds";
import { msg } from "@/shared/messages";
import type { AcpSessionActionDescriptor, AcpSessionActionTransport } from "../../base/types";
import {
  DEVIN_ACP_CLOUD_CONFIG_OPTION_IDS,
  DEVIN_ACP_CLOUD_VERSION_CONFIG_ID,
} from "./cloudSessionConfig";
import { DevinAcpActionError } from "./sessionActions";

/** Neutral ids for the live session-configuration action pair. */
export const DEVIN_ACP_CONFIG_ACTION_IDS = {
  list: "devin.config.list",
  set: "devin.config.set",
} as const;

/** Serialized action results above this are rejected, never processed. */
const MAX_CONFIG_RESULT_BYTES = 512 * 1024;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/**
 * Where the Devin session executes — the same target vocabulary the vendor
 * RPC descriptors use. The target gates the mid-prompt write allowance (the
 * launcher declares it for `"local"` only) and the provider normalizer
 * (cloud-only); the `org_id` refusal applies to every target because the
 * option belongs to the cloud surface and an execution-boundary change is
 * never a live mutation on either.
 */
export type DevinAcpConfigTarget = "local" | "cloud";

const abortError = () => {
  const error = new Error("Devin session action aborted");
  error.name = "AbortError";
  return error;
};

async function raceAbort<T>(task: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return task;
  if (signal.aborted) throw abortError();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    task.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Bounded result admission shared by both actions: the shared seam's own
 * bounds still apply, and a result that cannot cross the seam as bounded
 * JSON fails the action instead of leaking unbounded agent state.
 */
function boundedConfigResult(result: Record<string, unknown>): Record<string, unknown> {
  try {
    assertBoundedJson(result, MAX_CONFIG_RESULT_BYTES);
  } catch {
    throw new DevinAcpActionError(0, "Session config action result exceeds the serialized bound");
  }
  return result;
}

export { DEVIN_ACP_SPEED_CONFIG_ID, DEVIN_ACP_FAST_CONFIG_BINDING } from "./fastConfigBinding";

/**
 * The semantic category each native select id is re-declared with at the
 * boundary. Exact-id keyed and CLOUD-only: `devin_version` (advertised with
 * `category: null`) speaks the `model` role the shared category reduction
 * already reads. Nothing else is rewritten — the local `speed` select keeps
 * its native `model_config` category and is bound through
 * {@link DEVIN_ACP_FAST_CONFIG_BINDING} instead.
 */
const semanticCategoryFor = (id: string): string | undefined =>
  id === DEVIN_ACP_CLOUD_VERSION_CONFIG_ID ? "model" : undefined;

/**
 * Provider-owned pure normalizer for one session's ingested config options.
 *
 * Cloud options carry `category: null`, so the shared standard-category
 * reduction (which folds the `model` category into the thread config) cannot
 * see the cloud `devin_version` select. This normalizer gives that option
 * the semantic `category: "model"`. The native id, current value, options,
 * labels, `_meta` and every unknown wire field are preserved verbatim — only
 * `category` is re-declared, and wire ids are never rewritten, so setter/
 * validation parity is unaffected. Every other option passes through
 * unchanged (same reference) — including the local `speed` select, whose
 * native category and values are consumed verbatim through
 * {@link DEVIN_ACP_FAST_CONFIG_BINDING}.
 *
 * Declared for the CLOUD target only: the local surface needs no category
 * declaration. Pure and total: it never throws and never invents fields,
 * matching the shared seam's normalizer contract.
 */
export function devinAcpConfigOptionsNormalizerFor(
  target?: DevinAcpConfigTarget,
): ((configOptions: readonly unknown[]) => readonly unknown[]) | undefined {
  if (target !== "cloud") return undefined;
  return (configOptions) => {
    if (!Array.isArray(configOptions)) return configOptions;
    return configOptions.map((entry) => {
      const record = asRecord(entry);
      if (!record || typeof record.id !== "string" || record.type !== "select") return entry;
      const category = semanticCategoryFor(record.id);
      return category ? { ...entry, category } : entry;
    });
  };
}

/**
 * Declare the live config action pair for one Devin ACP session. Returns an
 * EMPTY list when the injected transport lacks either member — the shared
 * seam introduced both together, so a transport without them predates the
 * live-config capability and must not advertise a dead menu entry.
 */
export function devinAcpLiveConfigActionDescriptors(
  transport: AcpSessionActionTransport,
): AcpSessionActionDescriptor[] {
  const getConfigOptions = transport.getConfigOptions;
  const setConfigOption = transport.setConfigOption;
  if (typeof getConfigOptions !== "function" || typeof setConfigOption !== "function") {
    return [];
  }
  const configIdFrom = (payload: Record<string, unknown>): string => {
    const configId = nonEmptyString(payload.configId);
    if (!configId) {
      throw new DevinAcpActionError(0, 'Session action payload requires "configId"');
    }
    return configId;
  };
  return [
    {
      id: DEVIN_ACP_CONFIG_ACTION_IDS.list,
      invoke: async () => {
        // Detached, bounded snapshot of the retained normalized options —
        // the shared control clones and bounds it; the seam re-asserts its
        // own serialized bound before the result crosses to the host.
        return boundedConfigResult({ configOptions: getConfigOptions.call(transport) });
      },
    },
    {
      id: DEVIN_ACP_CONFIG_ACTION_IDS.set,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        if (!record) throw new DevinAcpActionError(0, "Config set payload must be an object");
        const configId = configIdFrom(record);
        if (configId === "workspace-dirs") {
          // Native folder writes change filesystem scope. The generic live
          // config surface has no host-owned grant transaction, and its
          // model-write allowance also permits writes during a prompt.
          // Keep scope changes on the explicit idle/reopen path, even if
          // the native select advertises the requested JSON as a value.
          throw new DevinAcpActionError(0, msg("thread.configSelectionRejected"), {
            configId,
            reason: "workspace-scope-requires-reopen",
          });
        }
        if (configId === DEVIN_ACP_CLOUD_CONFIG_OPTION_IDS.orgId) {
          // Execution-boundary refusal BEFORE any wire send: the org is part
          // of the proven session identity. A live switch would run the
          // session under a different org than the one the thread was bound
          // to; the profile settings + a NEW session own that change.
          throw new DevinAcpActionError(
            0,
            "org_id is fixed while a session runs; change the organization in the profile settings and start a new session",
          );
        }
        const value = record.value;
        // Exact types only — a number, null, or numeric-string coercion
        // could select a value the agent never advertised.
        if (typeof value !== "string" && typeof value !== "boolean") {
          throw new DevinAcpActionError(
            0,
            'Session action payload requires "value" as an advertised select value id or a boolean',
          );
        }
        return { configId, value };
      },
      invoke: async (payload, ctx) => {
        // Delegate ONLY to the shared standard setter — it validates the
        // advertised id/value (honoring legitimate empty strings), sends the
        // standard `session/set_config_option` exactly once under the single
        // config writer, confirms the echo, and reconciles the thread
        // config. Confirmation and lifecycle errors propagate typed; a
        // failed or uncertain mutation is never retried here.
        await raceAbort(
          setConfigOption.call(
            transport,
            payload.configId as string,
            payload.value as string | boolean,
            { signal: ctx.signal },
          ),
          ctx.signal,
        );
        // Stable bounded confirmation: the shared setter resolved only after
        // the agent's own echoed state carried the written value.
        return boundedConfigResult({ configId: payload.configId, set: true });
      },
    },
  ];
}
