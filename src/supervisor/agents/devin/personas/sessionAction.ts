import { assertBoundedJson } from "@/shared/jsonBounds";
import type { AcpSessionActionDescriptor } from "../../base/types";
import type { DevinPersonaCatalog, DevinPersonaScanOutcome } from "./catalog";

/**
 * Neutral `native-personas.list` session action (root-agreed bounded seam —
 * no extra IPC; UI lanes U3/N know this id and view shape).
 *
 * Unlike the four `_cognition.ai/*` actions this is NOT an agent RPC: it is
 * served entirely Poracode-side from a read-only scan of the execution
 * context's persona roots. The result is therefore a CANDIDATE catalog —
 * every entry carries `confirmed: false` because a scan cannot prove the
 * provider actually loaded a definition (plan G15, Q33).
 *
 * Advertisement is the caller's decision: the action is only composed into
 * the session's action set for locations the scan can actually read (WSL
 * without a distro-side reader omits it — an empty-looking catalog would
 * disagree with the session).
 */

export const DEVIN_NATIVE_PERSONAS_ACTION_ID = "native-personas.list";

/** Result bounds keep one scan from ballooning the action payload. */
const MAX_ENTRIES = 500;
const MAX_ISSUES_PER_ENTRY = 20;
const MAX_CROSS_ROOT_ISSUES = 100;
const MAX_RESULT_BYTES = 512 * 1024;
const MAX_NAME_LENGTH = 300;
const MAX_MESSAGE_LENGTH = 500;

export interface DevinPersonasScanFn {
  (options: { signal?: AbortSignal }): Promise<DevinPersonaScanOutcome>;
}

interface BoundedIssue {
  severity: string;
  message: string;
}

interface BoundedEntry {
  name: string;
  description?: string;
  model?: string;
  origin: string;
  scope: string;
  path: string;
  readOnly?: boolean;
  /** Always false: a scan never proves provider-effective loading. */
  confirmed: false;
  issues: BoundedIssue[];
}

export interface DevinPersonasView {
  entries: BoundedEntry[];
  crossRootIssues: BoundedIssue[];
  /** True when the scan stopped early at the entry bound (a truncation marker, never silent). */
  truncated: boolean;
}

const boundedText = (value: unknown, bound: number): string | undefined =>
  typeof value === "string" && value.length > 0
    ? value.length > bound
      ? value.slice(0, bound)
      : value
    : undefined;

function projectIssue(raw: { severity?: unknown; message?: unknown }): BoundedIssue {
  return {
    severity: raw.severity === "warning" ? "warning" : "error",
    message: boundedText(raw.message, MAX_MESSAGE_LENGTH) ?? "Unreadable validation issue.",
  };
}

export function projectDevinPersonasView(catalog: DevinPersonaCatalog): DevinPersonasView {
  // The scan reports PROJECTED truncation (candidates existed beyond a bound);
  // a direct oversized catalog keeps the length-based marker.
  const truncated = catalog.truncated || catalog.entries.length > MAX_ENTRIES;
  const entries = catalog.entries.slice(0, MAX_ENTRIES).map((entry) => {
    const frontmatter = entry.definition.frontmatter;
    const description = boundedText(frontmatter.description, MAX_MESSAGE_LENGTH);
    const model = boundedText(frontmatter.model, MAX_NAME_LENGTH);
    return {
      name: boundedText(frontmatter.name ?? entry.definition.pathId, MAX_NAME_LENGTH) ?? "",
      ...(description ? { description } : {}),
      ...(model ? { model } : {}),
      origin: entry.root.origin,
      scope: entry.scope,
      path: entry.definition.filePath,
      ...(entry.root.readOnly ? { readOnly: true } : {}),
      confirmed: false as const,
      issues: entry.validation.slice(0, MAX_ISSUES_PER_ENTRY).map(projectIssue),
    };
  });
  const crossRootIssues = catalog.crossRootIssues.slice(0, MAX_CROSS_ROOT_ISSUES).map(projectIssue);
  return { entries, crossRootIssues, truncated };
}

/**
 * The `native-personas.list` descriptor. `scan` is injected: the adapter
 * closes it over the execution context resolved for THIS session, so the
 * action can never scan the supervisor's global env by accident.
 */
export function devinNativePersonasSessionAction(
  scan: DevinPersonasScanFn,
): AcpSessionActionDescriptor {
  const boundedResult = (result: DevinPersonasView): Record<string, unknown> => {
    try {
      assertBoundedJson(result, MAX_RESULT_BYTES);
    } catch {
      throw new Error("Native persona catalog exceeds the serialized bound");
    }
    return result as unknown as Record<string, unknown>;
  };
  return {
    id: DEVIN_NATIVE_PERSONAS_ACTION_ID,
    invoke: async (_payload, ctx) => {
      ctx.signal?.throwIfAborted();
      const outcome = await scan({ signal: ctx.signal });
      if (outcome.status === "unsupported-environment") {
        // Typed refusal — never an empty catalog pretending the account has
        // no personas.
        throw new Error(outcome.reason);
      }
      return boundedResult(projectDevinPersonasView(outcome.catalog));
    },
  };
}
