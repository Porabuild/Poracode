import type { RuntimeEvent } from "./contracts/runtimeEvent";
import {
  COMMAND_HEADER_INPUTS,
  MCP_TOOL_HEADER_INPUTS,
  TOOL_BODY_INPUTS,
} from "./runtimeHeaderInputs";
import { presentRuntimeCommand, presentRuntimeMcpTool } from "./runtimeItemPresentationProjection";
import { presentRuntimeToolBody } from "./runtimeToolBodyProjection";
import { workflowRegistrationNames } from "./toolPresentationAdapters";
import { readToolValuePath } from "./toolPresentationSource";
import {
  RUNTIME_ITEM_PRESENTATION_SNAPSHOT_VERSION,
  RUNTIME_ITEM_PRESENTATION_SNAPSHOT_MAX_ITEMS,
  RUNTIME_ITEM_PRESENTATION_SNAPSHOT_MAX_BYTES,
  type RuntimeItemPresentationSnapshot,
} from "./contracts/runtimeItemPresentationSnapshot";

interface HeaderInput {
  type: string;
  state: "started" | "updated" | "completed";
  payload?: unknown;
  patches?: unknown[];
}
const keys = new Set(
  [...COMMAND_HEADER_INPUTS, ...MCP_TOOL_HEADER_INPUTS].map((source) => source.path[0]!),
);
const toolTypes = new Set(["command_execution", "tool_call", "dynamic_tool_call", "mcp_tool_call"]);

/** Headers retain only display inputs. Ordinary output, requests, timings,
 * side effects and canonical history remain owned by the ordinary reducers. */
function headerPatch(previous: unknown, patch: unknown): unknown {
  if (patch === undefined) return previous;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return undefined;
  const next: Record<string, unknown> =
    previous && typeof previous === "object" ? { ...previous } : {};
  for (const key of keys) {
    if (!Object.hasOwn(patch, key)) continue;
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue; // JSON transport omits undefined object fields.
    if (key === "args" && value && typeof value === "object" && !Array.isArray(value)) {
      const args = value as Record<string, unknown>;
      next[key] = {
        ...(Object.hasOwn(args, "command") ? { command: args.command } : {}),
        ...(Object.hasOwn(args, "cwd") ? { cwd: args.cwd } : {}),
      };
    } else next[key] = value;
  }
  return next;
}

export function runtimeItemPresentationSnapshot(
  events: readonly RuntimeEvent[],
  threadId: string,
): RuntimeItemPresentationSnapshot | undefined {
  const sources = new Map<string, HeaderInput>();
  const seen = new Set<string>();
  for (const event of events) {
    if (event.threadId !== threadId) continue;
    if (event.type === "item.started") {
      if (seen.has(event.itemId)) continue;
      seen.add(event.itemId);
      if (toolTypes.has(event.itemType)) {
        sources.set(event.itemId, {
          type: event.itemType,
          state: "started",
          payload: headerPatch(undefined, event.payload),
          ...(["tool_call", "dynamic_tool_call"].includes(event.itemType)
            ? { patches: [event.payload] }
            : {}),
        });
      }
    } else if (
      event.type === "item.updated" ||
      event.type === "item.completed" ||
      event.type === "content.delta"
    ) {
      const source = sources.get(event.itemId);
      if (!source) continue;
      if (event.type === "item.completed") source.state = "completed";
      else if (source.state !== "completed") source.state = "updated";
      if (event.type !== "content.delta") {
        source.payload = headerPatch(source.payload, event.payload);
        source.patches?.push(event.payload);
      }
    }
  }
  const items: RuntimeItemPresentationSnapshot["items"] = [];
  let bytes = 64;
  const names = new Set(workflowRegistrationNames());
  for (const [itemId, source] of sources) {
    const version = source.type === "command_execution" ? 1 : 2;
    const producers = [
      () => snapshotEntry(itemId, source, version),
      () => bodySnapshotEntry(itemId, source, names),
    ];
    for (const produce of producers) {
      let row: RuntimeItemPresentationSnapshot["items"][number] | undefined;
      try {
        row = produce();
      } catch {
        continue;
      } // Advisory failures cannot invalidate canonical events.
      if (!row) continue;
      bytes += Buffer.byteLength(JSON.stringify(row)) + 1;
      if (
        items.length >= RUNTIME_ITEM_PRESENTATION_SNAPSHOT_MAX_ITEMS ||
        bytes > RUNTIME_ITEM_PRESENTATION_SNAPSHOT_MAX_BYTES
      )
        return undefined;
      items.push(row);
    }
  }
  return items.length ? { version: RUNTIME_ITEM_PRESENTATION_SNAPSHOT_VERSION, items } : undefined;
}

function bodySnapshotEntry(
  itemId: string,
  source: HeaderInput,
  names: ReadonlySet<string>,
): RuntimeItemPresentationSnapshot["items"][number] | undefined {
  const name = readToolValuePath(source.payload, ["name"]);
  if (
    source.state !== "completed" ||
    typeof name !== "string" ||
    !names.has(name) ||
    !source.patches
  )
    return undefined;
  // Retain references while folding headers; inspect result fields only after
  // the final identity is known. Ordinary tools/commands never read their bodies.
  let payload: Record<string, unknown> | undefined;
  for (const patch of source.patches) {
    if (patch === undefined) continue;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      payload = undefined;
      continue;
    }
    payload = { ...payload };
    for (const {
      path: [key],
    } of TOOL_BODY_INPUTS) {
      if (!Object.hasOwn(patch, key!)) continue;
      const value = (patch as Record<string, unknown>)[key!];
      if (value !== undefined) payload[key!] = value;
    }
  }
  const entry = presentRuntimeToolBody(itemId, source.type, source.state, payload);
  return entry.status === "ready" ? { version: 5, entry } : undefined;
}

function snapshotEntry(
  itemId: string,
  source: HeaderInput,
  version: 1 | 2,
): RuntimeItemPresentationSnapshot["items"][number] | undefined {
  if (version === 1) {
    const entry = presentRuntimeCommand(itemId, source.type, source.state, source.payload);
    return entry.status === "ready" ? { version: 1, entry } : undefined;
  }
  const entry = presentRuntimeMcpTool(itemId, source.type, source.state, source.payload);
  return entry.status === "ready" ? { version: 2, entry } : undefined;
}
