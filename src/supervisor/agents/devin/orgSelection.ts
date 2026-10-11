import { readFile } from "node:fs/promises";
import JSON5 from "json5";
import type { DevinExecutionContext } from "./profileContext";
import { readAgentCommandOutput } from "../base";
import { DevinAccountIdentityError } from "./accountIdentity";
import { effectiveDevinUserConfigPath, embedDevinDistroConfigPath } from "./launchContext";

/**
 * EFFECTIVE Devin organization selection (plan correction: org binding).
 *
 * The resume-scope identity must bind the org the session will ACTUALLY run
 * under, not merely the profile setting. A profile without a settings org
 * inherits its org from the native config the CLI itself resolves: an
 * explicit `--config` file, else the (seeded) config view / account root,
 * else the native default — exactly `effectiveDevinUserConfigPath`. That
 * file can change (`devin.org_id`) while the user, account root and file
 * path stay identical, so the org is re-read from the declared source and
 * validated into the binding before every spawn or load: same user at the
 * same path under a CHANGED org is a visible scope mismatch, while model or
 * policy edits never invalidate anything (only `devin.org_id` is read).
 *
 * Precedence, honestly: a settings org wins outright — the launch seeds it
 * into the profile's config view, so the file always agrees with it. An
 * explicit `--config` file is otherwise the effective source (the CLI uses
 * it INSTEAD of the view), and the redirected/native config closes last.
 *
 * Absence policy matches the lane doctrine: ONLY a genuinely missing file
 * (ENOENT on the host, `-e` false inside the WSL distro — never a host
 * fallback over a Linux path) is absence. A PRESENT file that is empty,
 * unreadable, unparseable, or type-violating is a typed failure that fails
 * the binding visibly: emptiness after a known selection is truncation
 * ambiguity, not a legitimate "no org".
 */

/** Fail closed: a present config with no parseable content is not "absent". */
function presentConfigOrThrow(content: string): string {
  if (!content.trim()) {
    throw new DevinAccountIdentityError(
      "org-selection-unreadable",
      "The Devin config that selects the profile's organization exists but is empty; refusing to bind an org selection from a truncated file.",
    );
  }
  return content;
}

/** Read the effective config text: ENOENT-only absence, typed failure otherwise. */
async function readEffectiveConfigOrAbsent(
  context: DevinExecutionContext,
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  const path = effectiveDevinUserConfigPath(context);
  if (path === undefined) return undefined;
  if (context.location.kind === "wsl") {
    signal?.throwIfAborted();
    // Linux path: resolve INSIDE the distro. The effective path may be the
    // controlled native-default EXPRESSION (default account) — embedded raw
    // so `${XDG_CONFIG_HOME:-…}` expands in the distro shell; literal paths
    // (user-provided or Poracode-managed) are single-quoted and can never
    // interpolate. Nonzero exit (permissions, distro error, …) is a failure,
    // never an empty view.
    const script = `f=${embedDevinDistroConfigPath(path)}
if [ -e "$f" ]; then printf 'present\\n'; cat "$f"; else printf 'absent\\n'; fi`;
    const result = await readAgentCommandOutput(context.location, "sh", ["-c", script], {
      ...(signal ? { signal } : {}),
    });
    if (!result.ok) {
      throw new DevinAccountIdentityError(
        "org-selection-unreadable",
        "The Devin config that selects the profile's organization exists but could not be read inside the WSL distro.",
      );
    }
    if (result.stdout === "absent\n") return undefined;
    if (!result.stdout.startsWith("present\n")) {
      throw new DevinAccountIdentityError(
        "org-selection-unreadable",
        "The WSL config read for the organization selection returned an invalid presence marker.",
      );
    }
    return presentConfigOrThrow(result.stdout.slice("present\n".length));
  }
  const content = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw new DevinAccountIdentityError(
      "org-selection-unreadable",
      `The Devin config that selects the profile's organization exists but could not be read (${error.code ?? "unknown error"}).`,
    );
  });
  return content === undefined ? undefined : presentConfigOrThrow(content);
}

/**
 * The `devin.org_id` of one config text. Corrupt sources (non-object JSON,
 * an org id of a non-string type) are typed failures — they are ambiguity,
 * not absence.
 */
export function devinConfigOrgId(raw: string | undefined): string | undefined {
  if (raw === undefined || !raw.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON5.parse(raw);
  } catch {
    throw new DevinAccountIdentityError(
      "org-selection-unreadable",
      "The Devin config that selects the profile's organization is not valid JSON.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DevinAccountIdentityError(
      "org-selection-unreadable",
      "The Devin config that selects the profile's organization is not a JSON object.",
    );
  }
  const devin = (parsed as { devin?: unknown }).devin;
  const orgId =
    devin && typeof devin === "object" && !Array.isArray(devin)
      ? (devin as { org_id?: unknown }).org_id
      : undefined;
  if (orgId === undefined || orgId === null) return undefined;
  if (typeof orgId !== "string") {
    throw new DevinAccountIdentityError(
      "org-selection-unreadable",
      "The Devin config carries an org selection of an unexpected type.",
    );
  }
  const trimmed = orgId.trim();
  return trimmed || undefined;
}

/**
 * The effective org selection for one execution context: the settings org
 * when declared, else `devin.org_id` from the config the session will
 * actually resolve. Typed failure on an unreadable/corrupt source, `undefined`
 * when the session genuinely runs org-less.
 */
export async function resolveDevinEffectiveOrgId(
  context: DevinExecutionContext,
  signal?: AbortSignal | undefined,
): Promise<string | undefined> {
  if (context.orgId !== undefined) return context.orgId;
  return devinConfigOrgId(await readEffectiveConfigOrAbsent(context, signal));
}
