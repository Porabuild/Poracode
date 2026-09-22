/**
 * Test-only host seams for the B1 CAPABLE-HOST Android device journey.
 *
 * Everything here drives the REAL headless production host through its public
 * remote surface: the environment descriptor, pairing-token exchange, declared
 * transcript reads, the required-declaration gap read, and the existing-thread
 * start/close routes. No direct DB writes against a running host, no fake WS
 * frames, no production emit/fault endpoint.
 *
 * The artifact gate is deliberately fail-closed: the journey must be pointed
 * at an explicit, hash-pinned current entrypoint and must never fall back to
 * the repo-root pre-B1 `dist/main/server.cjs`.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { DEFAULT_TERMINAL_SIZE } from "@/shared/contracts";
import type { ProjectLocation } from "@/shared/contracts";
import {
  REMOTE_COMMAND_ID_HEADER,
  remoteEnvironmentDescriptorSchema,
  remoteRuntimeGapReadResultSchema,
  remoteRuntimeHistoryNoticeSchema,
  type RemoteEnvironmentDescriptor,
  type RemoteRuntimeGapReadResult,
  type RemoteRuntimeHistoryNotice,
} from "@/shared/remote";
import { pairingTokenFromPairingUrl } from "../harness/realHostProcess.ts";
import { capableHistoryItemText } from "./androidCapableHistorySeed.ts";

export const CAPABLE_HISTORY_JOURNEY_ERROR_PREFIX = "capable-history-journey";

export function capableHistoryJourneyError(code: string, detail: string): Error {
  return new Error(`${CAPABLE_HISTORY_JOURNEY_ERROR_PREFIX}:${code}: ${detail}`);
}

// ── Explicit artifact gate ──────────────────────────────────────────────────

export interface CapableHistoryArtifact {
  readonly entrypoint: string;
  readonly entrypointSha256: string;
  readonly supervisorPath: string;
  readonly supervisorSha256: string;
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Requires an explicit, hash-pinned server artifact. Refuses the repo-root
 * build output by path (the pre-B1 fallback the parent decision forbids) and
 * requires the supervisor bundle the server resolves beside itself.
 */
export function assertCapableHistoryArtifact(input: {
  readonly entrypoint: string;
  readonly expectedEntrypointSha256: string;
  readonly repoRoot: string;
}): CapableHistoryArtifact {
  const entrypoint = input.entrypoint.trim();
  if (entrypoint.length === 0) {
    throw capableHistoryJourneyError(
      "entrypoint-required",
      "set ANDROID_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT to the frozen server bundle",
    );
  }
  if (!isAbsolute(entrypoint)) {
    throw capableHistoryJourneyError("entrypoint-not-absolute", entrypoint);
  }
  if (!existsSync(entrypoint) || !statSync(entrypoint).isFile()) {
    throw capableHistoryJourneyError("entrypoint-missing", entrypoint);
  }
  const rootDist = resolve(input.repoRoot, "dist/main/server.cjs");
  if (resolve(entrypoint) === rootDist) {
    throw capableHistoryJourneyError(
      "entrypoint-root-dist-refused",
      `refusing the repo-root build output ${rootDist}; provide the current candidate artifact`,
    );
  }
  const expected = input.expectedEntrypointSha256.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    throw capableHistoryJourneyError(
      "entrypoint-sha256-required",
      "set ANDROID_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA256 to the artifact's sha256",
    );
  }
  const entrypointSha256 = sha256File(entrypoint);
  if (entrypointSha256 !== expected) {
    throw capableHistoryJourneyError(
      "entrypoint-hash-mismatch",
      `entrypoint sha256 ${entrypointSha256} != expected ${expected}`,
    );
  }
  const supervisorPath = join(entrypoint, "..", "supervisor.cjs");
  if (!existsSync(supervisorPath) || !statSync(supervisorPath).isFile()) {
    throw capableHistoryJourneyError(
      "supervisor-missing",
      `the server resolves supervisor.cjs beside itself; ${supervisorPath} is absent`,
    );
  }
  return {
    entrypoint: resolve(entrypoint),
    entrypointSha256,
    supervisorPath: resolve(supervisorPath),
    supervisorSha256: sha256File(supervisorPath),
  };
}

// ── Descriptor capability gate (fail-closed, no false==false) ──────────────

export interface RuntimeHistoryNoticeCapability {
  readonly versions: readonly number[];
}

export function parseEnvironmentDescriptor(body: unknown): RemoteEnvironmentDescriptor {
  return remoteEnvironmentDescriptorSchema.parse(body);
}

/**
 * The journey is only meaningful against a host that advertises
 * `runtimeHistoryNotices` v1. Absence (including a pre-B1 host that would make
 * `capable == declared == false` look green) is a hard failure.
 */
export function requireRuntimeHistoryNoticesV1(
  descriptor: RemoteEnvironmentDescriptor,
): RuntimeHistoryNoticeCapability {
  const capability = descriptor.capabilities?.runtimeHistoryNotices;
  if (!capability || !capability.versions.includes(1)) {
    throw capableHistoryJourneyError(
      "capability-absent",
      `the host descriptor does not advertise runtimeHistoryNotices v1: ${JSON.stringify(
        capability ?? null,
      )}`,
    );
  }
  return { versions: [...capability.versions] };
}

// ── Pairing credentials (production one-time tokens) ───────────────────────

export async function exchangePairingCredential(input: {
  readonly httpBaseUrl: string;
  readonly pairingUrl: string;
  readonly scopes: readonly string[];
  readonly label: string;
}): Promise<string> {
  const credential = pairingTokenFromPairingUrl(input.pairingUrl);
  if (!credential) throw capableHistoryJourneyError("pairing-url-token-missing", "pair --json");
  const response = await fetch(new URL("/oauth/token", input.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: [...input.scopes],
      client: { label: input.label, deviceType: "desktop" },
    }),
  });
  if (!response.ok) {
    throw capableHistoryJourneyError(
      "pairing-exchange-failed",
      `HTTP ${String(response.status)} for scopes ${input.scopes.join(",")}`,
    );
  }
  const parsed = (await response.json()) as { accessToken?: unknown };
  if (typeof parsed.accessToken !== "string" || parsed.accessToken.length === 0) {
    throw capableHistoryJourneyError("pairing-exchange-no-token", input.label);
  }
  return parsed.accessToken;
}

// ── Declared remote reads ───────────────────────────────────────────────────

export interface RemoteReadResult<T> {
  readonly status: number;
  readonly body: T | null;
  readonly errorCode: string | null;
}

async function getJson(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly path: string;
}): Promise<RemoteReadResult<Record<string, unknown>>> {
  const response = await fetch(new URL(input.path, input.httpBaseUrl), {
    headers: { authorization: `Bearer ${input.accessToken}` },
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  const error = body?.["error"] as { code?: unknown } | undefined;
  return {
    status: response.status,
    body,
    errorCode: typeof error?.code === "string" ? error.code : null,
  };
}

export interface DeclaredHistoryItemsRead {
  readonly status: number;
  readonly errorCode: string | null;
  readonly notice: RemoteRuntimeHistoryNotice | null;
  readonly items: readonly Record<string, unknown>[];
}

/**
 * The declared transcript read the device itself performs
 * (`notices=v1` + `reads=bounded-v1`). On the seeded pre-ack thread this is
 * the fenced refusal; after the device's acknowledgement it is the retained
 * prefix plus the durable notice.
 */
export async function readDeclaredHistoryItems(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly threadId: string;
  readonly limit?: number;
}): Promise<DeclaredHistoryItemsRead> {
  const limit = input.limit ?? 50;
  const result = await getJson({
    httpBaseUrl: input.httpBaseUrl,
    accessToken: input.accessToken,
    path:
      `/api/threads/${encodeURIComponent(input.threadId)}/history/items` +
      `?reads=bounded-v1&notices=v1&limit=${String(limit)}`,
  });
  const body = result.body ?? {};
  const rawNotice = body["runtimeNotice"];
  const notice =
    rawNotice === undefined || rawNotice === null
      ? null
      : remoteRuntimeHistoryNoticeSchema.parse(rawNotice);
  const items = Array.isArray(body["items"]) ? (body["items"] as Record<string, unknown>[]) : [];
  return { status: result.status, errorCode: result.errorCode, notice, items };
}

export async function readRuntimeGap(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly threadId: string;
}): Promise<{ status: number; errorCode: string | null; body: RemoteRuntimeGapReadResult | null }> {
  const result = await getJson({
    httpBaseUrl: input.httpBaseUrl,
    accessToken: input.accessToken,
    path: `/api/threads/${encodeURIComponent(input.threadId)}/runtime/gap?notices=v1`,
  });
  return {
    status: result.status,
    errorCode: result.errorCode,
    body: result.body ? remoteRuntimeGapReadResultSchema.parse(result.body) : null,
  };
}

// ── Production thread launch / lifecycle routes ─────────────────────────────

export async function startExistingThread(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly threadId: string;
  readonly projectLocation: ProjectLocation;
  readonly agentKind: string;
  readonly agentInstanceId: string;
  readonly config: { readonly model: string };
  readonly prompt: string;
  readonly commandId: string;
}): Promise<{ status: number; errorCode: string | null; body: Record<string, unknown> | null }> {
  const response = await fetch(new URL("/api/threads/start", input.httpBaseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
      [REMOTE_COMMAND_ID_HEADER]: input.commandId,
    },
    body: JSON.stringify({
      threadId: input.threadId,
      projectLocation: input.projectLocation,
      agentKind: input.agentKind,
      agentInstanceId: input.agentInstanceId,
      config: input.config,
      prompt: input.prompt,
      initialSize: DEFAULT_TERMINAL_SIZE,
      presentationMode: "gui",
    }),
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  const error = body?.["error"] as { code?: unknown } | undefined;
  return {
    status: response.status,
    errorCode: typeof error?.code === "string" ? error.code : null,
    body,
  };
}

/**
 * The production existing-thread input route (`POST /api/threads/:id/send`),
 * used by the reconnect leg to drive one more controlled ACP turn through the
 * live supervisor session without replacing it (a second `/start` would
 * replace the session and reset the fixture's per-process turn counter).
 */
export async function sendThreadInput(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly threadId: string;
  readonly config: { readonly model: string };
  readonly prompt: string;
  readonly commandId: string;
}): Promise<{ status: number; errorCode: string | null; body: Record<string, unknown> | null }> {
  const response = await fetch(
    new URL(`/api/threads/${encodeURIComponent(input.threadId)}/send`, input.httpBaseUrl),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
        [REMOTE_COMMAND_ID_HEADER]: input.commandId,
      },
      body: JSON.stringify({ prompt: input.prompt, config: input.config }),
    },
  );
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  const error = body?.["error"] as { code?: unknown } | undefined;
  return {
    status: response.status,
    errorCode: typeof error?.code === "string" ? error.code : null,
    body,
  };
}

export async function postThreadRoute(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly threadId: string;
  readonly route: "close" | "interrupt";
}): Promise<{ status: number; errorCode: string | null }> {
  const response = await fetch(
    new URL(`/api/threads/${encodeURIComponent(input.threadId)}/${input.route}`, input.httpBaseUrl),
    { method: "POST", headers: { authorization: `Bearer ${input.accessToken}` } },
  );
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  const error = body?.["error"] as { code?: unknown } | undefined;
  return {
    status: response.status,
    errorCode: typeof error?.code === "string" ? error.code : null,
  };
}

// ── Post-append invariants ──────────────────────────────────────────────────

export interface CapableHistoryAppendEvidence {
  readonly itemIds: readonly string[];
  readonly notice: RemoteRuntimeHistoryNotice | null;
  readonly prefixUserPresent: boolean;
  readonly prefixAssistantPresent: boolean;
  readonly liveMarkerPresent: boolean;
  readonly prefixPositions: Readonly<Record<string, number>>;
  readonly livePositions: readonly number[];
}

function itemText(item: Record<string, unknown>): string {
  const streams = item["streams"];
  const payload = item["payload"];
  return (
    capableHistoryItemText(
      payload !== null && typeof payload === "object" ? (payload as Record<string, unknown>) : null,
      streams !== null && typeof streams === "object" ? (streams as Record<string, unknown>) : null,
    ) ?? ""
  );
}

/**
 * The append must extend the acknowledged transcript: the retained prefix is
 * still present at its original positions, the live marker was appended after
 * it, the durable notice is still attached, and no item id is duplicated.
 * A silent reset (prefix gone) or a replayed prefix (duplicate ids) fails.
 */
export function checkCapableHistoryPostAppend(input: {
  readonly items: readonly Record<string, unknown>[];
  readonly notice: RemoteRuntimeHistoryNotice | null;
  readonly prefix: { readonly userItemId: string; readonly assistantItemId: string };
  readonly prefixMarkers: readonly string[];
  readonly liveMarker: string;
}): { readonly problems: readonly string[]; readonly evidence: CapableHistoryAppendEvidence } {
  const problems: string[] = [];
  const itemIds: string[] = [];
  const prefixPositions: Record<string, number> = {};
  const livePositions: number[] = [];
  let prefixUserPresent = false;
  let prefixAssistantPresent = false;
  let liveMarkerPresent = false;
  input.items.forEach((item, index) => {
    const id = typeof item["id"] === "string" ? item["id"] : `<missing-${String(index)}>`;
    itemIds.push(id);
    const text = itemText(item);
    if (id === input.prefix.userItemId) {
      prefixUserPresent = true;
      prefixPositions[id] = index;
      if (!input.prefixMarkers.some((marker) => text.includes(marker))) {
        problems.push(`retained user prefix ${id} lost its marker text`);
      }
    }
    if (id === input.prefix.assistantItemId) {
      prefixAssistantPresent = true;
      prefixPositions[id] = index;
      if (!input.prefixMarkers.some((marker) => text.includes(marker))) {
        problems.push(`retained assistant prefix ${id} lost its marker text`);
      }
    }
    if (text.includes(input.liveMarker)) {
      liveMarkerPresent = true;
      livePositions.push(index);
    }
  });
  const duplicates = [...new Set(itemIds.filter((id, index) => itemIds.indexOf(id) !== index))];
  if (duplicates.length > 0) {
    problems.push(`duplicate transcript item ids: ${duplicates.join(", ")}`);
  }
  if (!prefixUserPresent) problems.push(`retained prefix ${input.prefix.userItemId} is absent`);
  if (!prefixAssistantPresent) {
    problems.push(`retained prefix ${input.prefix.assistantItemId} is absent`);
  }
  if (!liveMarkerPresent) {
    problems.push(`the live append marker ${input.liveMarker} is absent`);
  }
  if (input.notice === null || input.notice.kind !== "history-incomplete") {
    problems.push("the durable history notice is absent after the append");
  }
  const assistantPosition = prefixPositions[input.prefix.assistantItemId];
  if (
    assistantPosition !== undefined &&
    livePositions.length > 0 &&
    !livePositions.some((position) => position > assistantPosition)
  ) {
    problems.push("the live append did not follow the retained prefix");
  }
  return {
    problems,
    evidence: {
      itemIds,
      notice: input.notice,
      prefixUserPresent,
      prefixAssistantPresent,
      liveMarkerPresent,
      prefixPositions,
      livePositions,
    },
  };
}
