/**
 * SDK-backed one-shot text generation (commit / PR / title gen).
 *
 * Reuses the app-lifetime runtime `opencode serve` pool from `sdkClient.ts`,
 * so consecutive calls (commit-msg then PR title, etc.) share the same warm
 * server with interactive project sessions.
 *
 * Each call creates a throwaway session with a deny-all permission ruleset
 * (the prompt is informational; we never want one-shot generation to touch
 * the filesystem or run a shell) and synchronously runs `session.prompt` to
 * collect the assistant's text reply.
 */

import type { ProjectLocation } from "@/shared/contracts";
import type { RunOneShotInput } from "../base";
import { classifyOpenCodeError } from "./opencodeErrors";
import { acquireOpenCodeServer, type AcquiredOpenCodeServer } from "./sdkClient";

const DENY_ALL_PERMISSIONS = [{ permission: "*", pattern: "*", action: "deny" }] as const;
const READ_ONLY_WORKSPACE_PERMISSIONS = [
  ...DENY_ALL_PERMISSIONS,
  { permission: "read", pattern: "*", action: "allow" },
  { permission: "list", pattern: "*", action: "allow" },
  { permission: "glob", pattern: "*", action: "allow" },
  { permission: "grep", pattern: "*", action: "allow" },
] as const;

interface AcquireInput {
  location: ProjectLocation;
}

async function acquireOneShotServer(input: AcquireInput): Promise<AcquiredOpenCodeServer> {
  return acquireOpenCodeServer({
    projectLocation: input.location,
  });
}

function parseModelSlug(
  slug: string | undefined,
): { providerID: string; modelID: string } | undefined {
  if (!slug) return undefined;
  const slash = slug.indexOf("/");
  if (slash <= 0 || slash === slug.length - 1) return undefined;
  return { providerID: slug.slice(0, slash), modelID: slug.slice(slash + 1) };
}

function extractAssistantText(parts: ReadonlyArray<unknown> | undefined): string {
  if (!parts) return "";
  let out = "";
  for (const candidate of parts) {
    if (!candidate || typeof candidate !== "object") continue;
    const obj = candidate as { type?: unknown; text?: unknown };
    if (obj.type !== "text") continue;
    if (typeof obj.text !== "string") continue;
    out += obj.text;
  }
  return out.trim();
}

function extractInfoErrorMessage(info: unknown): string | undefined {
  if (!info || typeof info !== "object") return undefined;
  const err = (info as { error?: unknown }).error;
  if (!err || typeof err !== "object") return undefined;
  const data = (err as { data?: unknown }).data;
  if (data && typeof data === "object") {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) return message.trim();
  }
  const name = (err as { name?: unknown }).name;
  if (typeof name === "string" && name.trim().length > 0) return name.trim();
  return undefined;
}

/**
 * Run a one-shot prompt through OpenCode's SDK. Honours the input
 * `AbortSignal` by cancelling via `acquired.client.session.abort` on abort —
 * the in-flight `session.prompt` then resolves with whatever was accumulated
 * (typically nothing), and we surface a classified `AbortError`.
 */
export async function runOpenCodeOneShot(input: RunOneShotInput): Promise<string> {
  const parsedModel = parseModelSlug(input.model);
  if (!parsedModel) {
    throw new Error(
      `OpenCode model must be in 'provider/model' format (got '${input.model ?? ""}').`,
    );
  }

  // Bail out before spawning if the caller is already aborted.
  if (input.signal?.aborted) {
    throw new Error("OpenCode one-shot was aborted before it started.");
  }

  const acquired = await acquireOneShotServer({ location: input.location });

  // Wire up abort: cancelling the SDK promise alone leaves the server-side
  // turn running, so we also call `session.abort` to free upstream tokens.
  let abortRegistered = false;
  let createdSessionID: string | undefined;
  const onAbort = () => {
    if (createdSessionID) {
      acquired.client.session.abort({ sessionID: createdSessionID }).catch(() => {
        /* best-effort */
      });
    }
  };
  if (input.signal) {
    input.signal.addEventListener("abort", onAbort, { once: true });
    abortRegistered = true;
  }

  try {
    let session: Awaited<ReturnType<typeof acquired.client.session.create>>;
    try {
      session = await acquired.client.session.create({
        title: `poracode one-shot ${parsedModel.modelID}`,
        // Generation is deny-all by default. Experiment judging opts into
        // read/search/list access inside its isolated anonymous diff workspace.
        permission: input.readOnlyWorkspace
          ? [...READ_ONLY_WORKSPACE_PERMISSIONS]
          : [...DENY_ALL_PERMISSIONS],
      });
    } catch (cause) {
      throw new Error(classifyOpenCodeError({ cause, operation: "session.create" }), { cause });
    }
    const sessionData = session.data;
    if (!sessionData) {
      throw new Error("OpenCode session.create returned no session payload.");
    }
    createdSessionID = sessionData.id;

    let result: Awaited<ReturnType<typeof acquired.client.session.prompt>>;
    try {
      result = await acquired.client.session.prompt({
        sessionID: sessionData.id,
        model: parsedModel,
        ...(input.effort && input.effort.length > 0 ? { variant: input.effort } : {}),
        parts: [{ type: "text", text: input.prompt }],
      });
    } catch (cause) {
      // If the abort fired mid-prompt, surface that explicitly so callers can
      // distinguish a user-cancel from a real failure.
      if (input.signal?.aborted) {
        throw new Error("OpenCode one-shot was aborted.", { cause });
      }
      throw new Error(classifyOpenCodeError({ cause, operation: "session.prompt" }), { cause });
    }

    const promptInfo = result.data?.info;
    const errorMessage = extractInfoErrorMessage(promptInfo);
    if (errorMessage) {
      throw new Error(
        classifyOpenCodeError({ cause: new Error(errorMessage), operation: "session.prompt" }),
      );
    }
    const text = extractAssistantText(result.data?.parts);
    if (text.length === 0) {
      throw new Error("OpenCode returned empty output for one-shot prompt.");
    }
    return text;
  } finally {
    if (abortRegistered && input.signal) {
      input.signal.removeEventListener("abort", onAbort);
    }
    await acquired.dispose().catch(() => {
      /* acquisition release is best-effort; supervisor shutdown owns the sidecar */
    });
  }
}
