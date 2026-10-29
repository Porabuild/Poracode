import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { ThreadConfig } from "@/shared/contracts";
import type { AcpSelectBooleanConfigBinding } from "../acp/modelConfigOptions";
import type { AcpPromptSteering } from "../acp/promptSteering";
import type { AcpConfigOptionsNormalizer } from "../base/types";
import type { AcpSessionUpdateTransform } from "../base";
import { fxPermissionModeFor } from "./argv";

/**
 * Resolve the ACP session mode for this thread's approval policy. fx 0.0.13
 * named its unrestricted mode "code"; 0.0.15 calls it "full-access".
 */
export function resolveFxAcpMode(
  config: ThreadConfig,
  availableModeIds: string[],
): string | undefined {
  const wanted = fxPermissionModeFor(config.approvalPolicy);
  if (availableModeIds.includes(wanted)) return wanted;
  if (wanted === "full-access" && availableModeIds.includes("code")) return "code";
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * fx advertises `agentCapabilities._meta.fx.steering` and joins a
 * `session/prompt` marked `_meta.fx.steer` to the running turn (fx 0.0.15
 * `handleSteeringPrompt`).
 */
export const FX_ACP_PROMPT_STEERING: AcpPromptSteering = {
  isSupported: (initialize) =>
    asRecord(asRecord(initialize.agentCapabilities?._meta)?.["fx"])?.["steering"] === true,
  requestMeta: { fx: { steer: true } },
};

/** Binds Poracode's Fast toggle to fx's exact `fast` select ("false"/"true") so it can never claim the higher-priced `ultrafast` select. */
export const FX_ACP_FAST_CONFIG_BINDING: AcpSelectBooleanConfigBinding = {
  configId: "fast",
  disabled: "false",
  enabled: "true",
};

/** Drop the duplicated `name` when it only repeats the value. */
function stripDuplicateOptionName(entry: unknown): unknown {
  const record = asRecord(entry);
  if (!record || typeof record.value !== "string" || record.name !== record.value) return entry;
  const copy = { ...record };
  delete copy["name"];
  return copy;
}

function groupOptionsByModelPrefix(values: readonly unknown[]): readonly unknown[] {
  const groups = new Map<string, unknown[]>();
  for (const value of values) {
    const id = asRecord(value)?.["value"];
    if (typeof id !== "string") return values;
    const slash = id.indexOf("/");
    if (slash < 0) return values;
    const prefix = id.slice(0, slash);
    const bucket = groups.get(prefix);
    if (bucket) bucket.push(value);
    else groups.set(prefix, [value]);
  }
  return [...groups].map(([prefix, options]) => ({ group: prefix, name: prefix, options }));
}

/**
 * fx advertises a `provider` select with the `model` category, and the shared
 * reduction picks the first model-category select as the model control. Drop
 * `provider` (switching stays in `fx provider`) and tidy the model select:
 * repeated labels removed, flat `vendor/model` values grouped per vendor.
 */
export const normalizeFxAcpConfigOptions: AcpConfigOptionsNormalizer = (configOptions) => {
  if (!Array.isArray(configOptions)) return configOptions;
  return configOptions
    .filter((entry) => asRecord(entry)?.["id"] !== "provider")
    .map((entry) => {
      const record = asRecord(entry);
      if (!record || record["id"] !== "model" || record["type"] !== "select") return entry;
      if (!Array.isArray(record["options"])) return entry;
      const values = record["options"].map(stripDuplicateOptionName);
      const flat =
        values.length > 0 &&
        values.every((value) => typeof asRecord(value)?.["value"] === "string");
      if (!flat) return { ...record, options: values };
      return {
        ...record,
        options: groupOptionsByModelPrefix(values),
      };
    });
};

function firstLineOf(text: string): string {
  return text.split("\n", 1)[0]?.trim() ?? "";
}

/**
 * fx reports subagent work as a `subagent` tool call whose rawInput carries
 * `{ action: "run", task }` or `{ action: "message", agent, message }`. The
 * shared runtime recognizes the canonical `{ subagent_type, prompt,
 * description }` shape, so map only the `run` action; messages pass through.
 */
export function createFxAcpSessionUpdateTransform(): AcpSessionUpdateTransform {
  const subagentToolCallIds = new Set<string>();

  return (notification) => {
    const update = asRecord(notification.update);
    if (!update) return notification;
    const sessionUpdate = update["sessionUpdate"];
    if (sessionUpdate !== "tool_call" && sessionUpdate !== "tool_call_update") {
      return notification;
    }
    const toolCallId = update["toolCallId"];
    if (typeof toolCallId !== "string" || toolCallId.length === 0) return notification;
    if (update["name"] === "subagent") subagentToolCallIds.add(toolCallId);
    if (!subagentToolCallIds.has(toolCallId)) return notification;
    const rawInput = asRecord(update["rawInput"]);
    if (!rawInput || rawInput["action"] !== "run") return notification;
    const task = rawInput["task"];
    if (typeof task !== "string") return notification;

    const title = typeof update["title"] === "string" ? update["title"].trim() : "";
    const description = title.length > 0 ? title : firstLineOf(task).slice(0, 80);
    return {
      ...notification,
      update: {
        ...update,
        rawInput: {
          ...rawInput,
          subagent_type: "agent",
          prompt: task,
          description,
        },
      },
    } as SessionNotification;
  };
}
