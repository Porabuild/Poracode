/**
 * Typed adapters for Devin's confirmed `_cognition.ai/*` host→agent RPCs.
 *
 * Contracts come from live no-prompt probes against `devin acp` 3000.11.3
 * (tmp/devin/acp-contracts.md §4): `session/rename`, `command/revise`,
 * `rules/list` and `hooks/list`. Responses are validated defensively and
 * bounded — populated `hooks` entries are kept opaque because only an empty
 * list has ever been observed — and failures surface as typed errors instead
 * of fabricating success. A malformed response is a contract violation and
 * fails the action: lists are never silently emptied, over-bound results are
 * never silently truncated, and error payloads never echo unvalidated agent
 * data (which could carry credential-like values).
 *
 * The transport is injected: the shared ACP session owns the live connection
 * (and its abort/timeout semantics), so these adapters stay pure and are
 * driven from recorded fixtures in tests.
 */

import { assertBoundedJson } from "@/shared/jsonBounds";

export const DEVIN_ACP_METHODS = {
  sessionRename: "_cognition.ai/session/rename",
  commandRevise: "_cognition.ai/command/revise",
  rulesList: "_cognition.ai/rules/list",
  hooksList: "_cognition.ai/hooks/list",
  sessionArchive: "_cognition.ai/session/archive",
} as const;

/** Response bounds keep a misbehaving agent from ballooning provider state. */
const MAX_TITLE_LENGTH = 500;
const MAX_COMMAND_LENGTH = 20_000;
/** Revise notes are advisory text, not command payloads — tighter bound. */
const MAX_NOTE_LENGTH = 2_000;
const MAX_LIST_ENTRIES = 200;
/** Serialized agent responses above this are rejected, never processed. */
const MAX_RESPONSE_BYTES = 512 * 1024;
/** Typed JSON-RPC error data kept on {@link DevinAcpActionError} is capped. */
const MAX_ERROR_DATA_BYTES = 4 * 1024;

/**
 * Validate an agent response object and reject oversized payloads before any
 * field is read. Failures never carry the offending content.
 */
function boundedResponse(response: unknown, method: string): Record<string, unknown> {
  const record = asRecord(response);
  if (!record) {
    throw new DevinAcpActionError(0, `Unexpected ${method} response shape`);
  }
  try {
    assertBoundedJson(record, MAX_RESPONSE_BYTES);
  } catch {
    throw new DevinAcpActionError(0, `${method} response exceeds the serialized bound`);
  }
  return record;
}

/**
 * Redact the data attached to transport errors: only bounded plain-JSON
 * objects survive, so provider payloads can never leak credential-like
 * values into Poracode logs through an action error.
 */
function sanitizeErrorData(data: unknown): unknown {
  if (!asRecord(data)) return undefined;
  try {
    assertBoundedJson(data, MAX_ERROR_DATA_BYTES);
  } catch {
    return undefined;
  }
  return data;
}

export class DevinAcpActionError extends Error {
  constructor(
    /** JSON-RPC error code, or 0 for a locally-detected contract violation. */
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "DevinAcpActionError";
  }
  /** True when the agent answered JSON-RPC "method not found". */
  get unsupported(): boolean {
    return this.code === -32601;
  }
}

export function toDevinAcpActionError(error: unknown): DevinAcpActionError {
  if (error instanceof DevinAcpActionError) return error;
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const message = typeof record.message === "string" ? record.message : String(error);
  const code = typeof record.code === "number" ? record.code : 0;
  return new DevinAcpActionError(code, message, sanitizeErrorData(record.data));
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export interface DevinAcpRule {
  name: string;
  path: string;
  /** Remaining provider fields are preserved verbatim. */
  [key: string]: unknown;
}

/** Cancellation options threaded from the shared session's abort signal. */
export interface DevinAcpActionOptions {
  signal?: AbortSignal;
}

/**
 * Confirmed archive outcome for a Poracode-owned cloud session. The adapter
 * only resolves when the agent answered `is_archived: true` AND echoed the
 * exact `sessionId` that was requested — a response for a foreign, missing
 * or malformed session id can never publish a confirmed archive. No account
 * payload (`_meta` org/user ids, upload URLs, …) is carried: the host sees
 * the bounded status fields below, nothing else.
 */
export interface DevinAcpArchiveResult {
  /** The agent confirmed archival (`is_archived: true` on the wire). */
  isArchived: true;
  /** The validated echoed id — identical to the requested owned session id. */
  sessionId: string;
  /** Provider session status at archive time (e.g. "running"), if sent. */
  status: string | undefined;
  /** Agent-reported archive timestamp, if sent. */
  archivedAt: string | undefined;
}

export interface DevinAcpSessionActions {
  /** Rename a Poracode-owned session. Resolves when the agent accepts `{}`. */
  renameSession(sessionId: string, title: string, options?: DevinAcpActionOptions): Promise<void>;
  /**
   * Ask the agent to revise a command. The returned text must be reviewed
   * before execution — RPC success is not permission to run anything.
   */
  reviseCommand(
    sessionId: string,
    command: string,
    note?: string,
    options?: DevinAcpActionOptions,
  ): Promise<string>;
  /** Rules the session loaded (name/path validated, extra fields preserved). */
  listRules(sessionId: string, options?: DevinAcpActionOptions): Promise<DevinAcpRule[]>;
  /** Hooks attached to the session; entries stay opaque (schema unconfirmed). */
  listHooks(sessionId: string, options?: DevinAcpActionOptions): Promise<unknown[]>;
  /**
   * Archive a cloud session (cleanup/close). Cloud-only: the local build does
   * not register the method (-32601) and the cloud relay answers -32002
   * "Access denied" for a never-activated (`pendingSession`) session — the
   * error surfaces typed, it is not retried or swallowed. Resolves only for
   * a response that confirms `is_archived: true` and echoes the exact
   * requested session id. This is an explicit user action only: nothing in
   * this adapter may be wired to normal dispose/Stop/pane-close — ordinary
   * user sessions persist across those.
   */
  archiveSession(
    sessionId: string,
    options?: DevinAcpActionOptions,
  ): Promise<DevinAcpArchiveResult>;
}

export interface DevinAcpSessionActionTransport {
  request(
    method: string,
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
}

export function createDevinAcpSessionActions(
  transport: DevinAcpSessionActionTransport,
): DevinAcpSessionActions {
  const request = async (
    method: string,
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ) => {
    try {
      return await transport.request(method, params, options);
    } catch (error) {
      throw toDevinAcpActionError(error);
    }
  };
  return {
    async renameSession(sessionId, title, options) {
      const trimmed = title.trim();
      if (!trimmed) throw new DevinAcpActionError(0, "Session title must not be empty");
      if (trimmed.length > MAX_TITLE_LENGTH)
        throw new DevinAcpActionError(0, "Session title exceeds the wire bound");
      boundedResponse(
        await request(DEVIN_ACP_METHODS.sessionRename, { sessionId, title: trimmed }, options),
        "session/rename",
      );
    },
    async reviseCommand(sessionId, command, note, options) {
      const target = nonEmptyString(command);
      if (!target) throw new DevinAcpActionError(0, "Command must not be empty");
      if (target.length > MAX_COMMAND_LENGTH)
        throw new DevinAcpActionError(0, "Command exceeds the wire bound");
      const boundedNote = nonEmptyString(note);
      if (boundedNote && boundedNote.length > MAX_NOTE_LENGTH)
        throw new DevinAcpActionError(0, "Revise note exceeds the wire bound");
      const response = boundedResponse(
        await request(
          DEVIN_ACP_METHODS.commandRevise,
          {
            sessionId,
            command: target,
            ...(boundedNote ? { note: boundedNote } : {}),
          },
          options,
        ),
        "command/revise",
      );
      const revised = nonEmptyString(response.command);
      if (!revised) {
        throw new DevinAcpActionError(0, "Unexpected command/revise response shape");
      }
      // A truncated command is not a command: over-bound revisions fail
      // instead of silently cutting executable text.
      if (revised.length > MAX_COMMAND_LENGTH) {
        throw new DevinAcpActionError(0, "Revised command exceeds the wire bound");
      }
      return revised;
    },
    async listRules(sessionId, options) {
      const response = boundedResponse(
        await request(DEVIN_ACP_METHODS.rulesList, { sessionId }, options),
        "rules/list",
      );
      if (!Array.isArray(response.rules)) {
        throw new DevinAcpActionError(0, "Unexpected rules/list response shape");
      }
      if (response.rules.length > MAX_LIST_ENTRIES) {
        throw new DevinAcpActionError(0, "rules/list response exceeds the entry bound");
      }
      return response.rules.map((entry, index) => {
        const record = asRecord(entry);
        const name = nonEmptyString(record?.name);
        const path = nonEmptyString(record?.path);
        // One malformed entry is a contract violation for the whole list —
        // silently dropping a rule would hide active policy from the user.
        if (!record || !name || !path) {
          throw new DevinAcpActionError(0, `Malformed rules/list entry at index ${index}`);
        }
        return { ...record, name, path } as DevinAcpRule;
      });
    },
    async listHooks(sessionId, options) {
      const response = boundedResponse(
        await request(DEVIN_ACP_METHODS.hooksList, { sessionId }, options),
        "hooks/list",
      );
      if (!Array.isArray(response.hooks)) {
        throw new DevinAcpActionError(0, "Unexpected hooks/list response shape");
      }
      if (response.hooks.length > MAX_LIST_ENTRIES) {
        throw new DevinAcpActionError(0, "hooks/list response exceeds the entry bound");
      }
      // The populated schema is unqualified. Preserve every bounded plain
      // JSON value; the response admission above rejects lossy/non-JSON data.
      return [...response.hooks];
    },
    async archiveSession(sessionId, options) {
      const response = boundedResponse(
        await request(DEVIN_ACP_METHODS.sessionArchive, { sessionId }, options),
        "session/archive",
      );
      // The live response echoes {sessionId, status, is_archived, …}. A
      // success that does not state is_archived=true is a contract violation:
      // treating it as archived would strand the cloud session.
      if (response.is_archived !== true) {
        throw new DevinAcpActionError(0, "Unexpected session/archive response shape");
      }
      // Ownership matching: the agent must echo the exact id that was
      // requested. A response naming a different session (misroute, foreign
      // or partial data) can never confirm THIS session archived — the
      // action fails typed instead of publishing a confirmation we cannot
      // attribute. A missing/blank echo is the same violation.
      const echoed = nonEmptyString(response.sessionId);
      if (!echoed) {
        throw new DevinAcpActionError(0, "session/archive response did not echo a sessionId");
      }
      if (echoed !== sessionId) {
        throw new DevinAcpActionError(
          0,
          "session/archive response echoed a different session than requested",
        );
      }
      const meta = asRecord(response._meta);
      const archivedAt = nonEmptyString(meta?.["cognition.ai/archivedAt"]);
      return {
        isArchived: true,
        sessionId: echoed,
        status: nonEmptyString(response.status),
        archivedAt,
      };
    },
  };
}

/**
 * Neutral session-action ids (shared seam addresses actions by id only —
 * never by raw wire method).
 */
export const DEVIN_ACP_SESSION_ACTION_IDS = {
  rename: "devin.session.rename",
  revise: "devin.command.revise",
  rules: "devin.rules.list",
  hooks: "devin.hooks.list",
  archive: "devin.session.archive",
} as const;

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

const payloadString = (payload: Record<string, unknown>, key: string, bound: number) => {
  const value = nonEmptyString(payload[key]);
  if (!value) throw new DevinAcpActionError(0, `Session action payload requires "${key}"`);
  if (value.length > bound)
    throw new DevinAcpActionError(0, `Session action "${key}" exceeds the wire bound`);
  return value;
};

/**
 * Where the Devin session executes. Each target declares only the controls
 * that were live-qualified ON that target (tmp/devin/lane-e3-result.md):
 * an unqualified RPC stays undeclared rather than shipping a button that
 * answers `-32601` to the user.
 */
export type DevinAcpSessionActionTarget = "local" | "cloud";

export interface DevinAcpSessionActionDescriptorOptions {
  /**
   * Which host the session runs on (default `"local"`).
   *
   * - `"local"` declares the four locally-confirmed actions —
   *   `devin.session.rename`, `devin.command.revise`, `devin.rules.list`,
   *   `devin.hooks.list`. `_cognition.ai/session/archive` is NOT registered
   *   by the local build (`-32601`) and stays undeclared.
   * - `"cloud"` declares only the cloud-earned, activation-gated controls —
   *   `devin.session.rename` and `devin.session.archive` (receipts:
   *   rename + archive succeed only AFTER first-prompt activation; both
   *   answer `-32002 Access denied` on a `pendingSession`, which surfaces
   *   typed). `command/revise`, `rules/list` and `hooks/list` were never
   *   qualified on the cloud relay and stay undeclared there.
   */
  readonly target?: DevinAcpSessionActionTarget;
}

/** Neutral ids declared per target, in declaration order (stable surface). */
const DEVIN_ACP_SESSION_ACTIONS_BY_TARGET: Record<DevinAcpSessionActionTarget, readonly string[]> =
  {
    local: [
      DEVIN_ACP_SESSION_ACTION_IDS.rename,
      DEVIN_ACP_SESSION_ACTION_IDS.revise,
      DEVIN_ACP_SESSION_ACTION_IDS.rules,
      DEVIN_ACP_SESSION_ACTION_IDS.hooks,
    ],
    cloud: [DEVIN_ACP_SESSION_ACTION_IDS.rename, DEVIN_ACP_SESSION_ACTION_IDS.archive],
  };

/**
 * Declare the confirmed vendor RPCs as neutral session actions for the
 * shared ACP seam. The shared session addresses them by id with validated
 * payloads and injects the live session id itself, so no host caller gets a
 * raw RPC tunnel into the agent. The `target` option gates WHICH controls
 * exist for a session — see {@link DevinAcpSessionActionDescriptorOptions}.
 */
export function devinAcpSessionActionDescriptors(
  transport: DevinAcpSessionActionTransport,
  options?: DevinAcpSessionActionDescriptorOptions,
): import("../../base/types").AcpSessionActionDescriptor[] {
  const actions = createDevinAcpSessionActions(transport);
  const target = options?.target ?? "local";
  const boundedResult = (result: Record<string, unknown>) => {
    try {
      assertBoundedJson(result, MAX_RESPONSE_BYTES);
    } catch {
      throw new DevinAcpActionError(0, "Session action result exceeds the serialized bound");
    }
    return result;
  };
  const all: Record<string, import("../../base/types").AcpSessionActionDescriptor> = {
    [DEVIN_ACP_SESSION_ACTION_IDS.rename]: {
      id: DEVIN_ACP_SESSION_ACTION_IDS.rename,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        if (!record) throw new DevinAcpActionError(0, "Rename payload must be an object");
        return { title: payloadString(record, "title", MAX_TITLE_LENGTH) };
      },
      invoke: async (payload, ctx) => {
        if (!ctx.sessionId) throw new DevinAcpActionError(0, "ACP session is not open");
        await raceAbort(
          actions.renameSession(ctx.sessionId, payload.title as string, { signal: ctx.signal }),
          ctx.signal,
        );
        return { renamed: true };
      },
    },
    [DEVIN_ACP_SESSION_ACTION_IDS.revise]: {
      id: DEVIN_ACP_SESSION_ACTION_IDS.revise,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        if (!record) throw new DevinAcpActionError(0, "Revise payload must be an object");
        const note = nonEmptyString(record.note);
        if (note && note.length > MAX_NOTE_LENGTH)
          throw new DevinAcpActionError(0, "Revise note exceeds the wire bound");
        return {
          command: payloadString(record, "command", MAX_COMMAND_LENGTH),
          ...(note ? { note } : {}),
        };
      },
      invoke: async (payload, ctx) => {
        if (!ctx.sessionId) throw new DevinAcpActionError(0, "ACP session is not open");
        const command = await raceAbort(
          actions.reviseCommand(
            ctx.sessionId,
            payload.command as string,
            nonEmptyString(payload.note),
            { signal: ctx.signal },
          ),
          ctx.signal,
        );
        return boundedResult({ command });
      },
    },
    [DEVIN_ACP_SESSION_ACTION_IDS.rules]: {
      id: DEVIN_ACP_SESSION_ACTION_IDS.rules,
      invoke: async (_payload, ctx) => {
        if (!ctx.sessionId) throw new DevinAcpActionError(0, "ACP session is not open");
        return boundedResult({
          rules: await raceAbort(
            actions.listRules(ctx.sessionId, { signal: ctx.signal }),
            ctx.signal,
          ),
        });
      },
    },
    [DEVIN_ACP_SESSION_ACTION_IDS.hooks]: {
      id: DEVIN_ACP_SESSION_ACTION_IDS.hooks,
      invoke: async (_payload, ctx) => {
        if (!ctx.sessionId) throw new DevinAcpActionError(0, "ACP session is not open");
        return boundedResult({
          hooks: await raceAbort(
            actions.listHooks(ctx.sessionId, { signal: ctx.signal }),
            ctx.signal,
          ),
        });
      },
    },
    [DEVIN_ACP_SESSION_ACTION_IDS.archive]: {
      id: DEVIN_ACP_SESSION_ACTION_IDS.archive,
      invoke: async (_payload, ctx) => {
        if (!ctx.sessionId) throw new DevinAcpActionError(0, "ACP session is not open");
        const result = await raceAbort(
          actions.archiveSession(ctx.sessionId, { signal: ctx.signal }),
          ctx.signal,
        );
        // Stable bounded confirmation for the host UI: the echoed id is
        // guaranteed identical to the owned session id (validated in the
        // adapter), `archived` is the explicit boolean the button needs, and
        // only the two status fields join it. The provider payload (raw
        // response, `_meta` account/org data) never crosses the shared seam.
        return boundedResult({
          archived: true as const,
          sessionId: ctx.sessionId,
          ...(result.status ? { status: result.status } : {}),
          ...(result.archivedAt ? { archivedAt: result.archivedAt } : {}),
        });
      },
    },
  };
  return DEVIN_ACP_SESSION_ACTIONS_BY_TARGET[target].map((id) => all[id]!);
}
