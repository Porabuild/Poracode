import type { SelectionBindingOwner } from "@/shared/selectionBinding.schemas";
import { prepareOneShot } from "../../oneShotSpawn";
import type { RunOneShotInput } from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { buildDevinOneShotArgs } from "./argv";
import {
  cachedDevinModelsForKey,
  devinModelCatalogKey,
  loadDevinModelsForKey,
} from "./modelCatalog";
import { assertDevinUnmappedOneShotControls, resolveDevinUtilityModel } from "./oneShotSelection";
import type { DevinModelFamily } from "./models";
import {
  resolveDevinDefaultCatalogScope,
  resolveDevinVolatileCatalogScope,
} from "./volatileCatalog";
import { assertCloudOneShotSupported, profileUnavailable } from "./sessionBinding";
import {
  resolveDevinExecutionContext,
  type DevinExecutionContext,
  type DevinExecutionSettings,
} from "./profileContext";

/**
 * Resolve the execution context for a one-shot lane. `undefined` (no profile
 * settings) keeps the legacy default-account behavior exactly; a PROFILE
 * whose context cannot resolve fails visibly — silently falling back to the
 * default account would run the utility under the wrong credentials and
 * misattribute its usage.
 */
export async function devinOneShotContext(
  settings: DevinExecutionSettings | undefined,
  location: RunOneShotInput["location"],
  signal?: AbortSignal | undefined,
): Promise<DevinExecutionContext | undefined> {
  if (!settings) return undefined;
  const resolution = await resolveDevinExecutionContext(settings, location, { signal });
  if (!resolution.ok) throw profileUnavailable(resolution.code, resolution.message);
  return resolution.context;
}

/**
 * Utilities can run before detection has warmed the process-local catalog.
 * The catalog is best-effort enrichment: a cold or failing catalog passes the
 * raw model id through, but explicit effort/Fast/thinking/context controls
 * that need mapping fail visibly instead of silently switching the variant.
 * Cloud profiles are rejected up front — no qualified cloud-safe utility path
 * exists, and a local spawn would silently run under the default account.
 *
 * This is the CLI print method: it consumes the complete utility selection
 * with Terminal semantics regardless of which adapter method reached it, and
 * never derives anything from the selection binding's recorded owner — the
 * executing adapter kind is the actual profile kind by construction.
 */
export async function runDevinOneShot(
  input: RunOneShotInput,
  settings: DevinExecutionSettings | undefined,
  owner: SelectionBindingOwner,
): Promise<string> {
  if (!input.selection.model) assertDevinUnmappedOneShotControls(input.selection);
  const context = await devinOneShotContext(settings, input.location, input.signal);
  assertCloudOneShotSupported(context?.runtimeTarget);
  const executable =
    context?.binaryIdentity ?? resolveAgentBinaryPath(input.location, "devin") ?? "devin";
  // The catalog key carries the FULL volatile scope (credential + effective
  // config + org — see `volatileCatalog.ts`). A scope resolution failure
  // degrades to no catalog together with the load below; it must never fall
  // back to a key that omits a dimension, which another credential/org/
  // policy state could have cached an entry under. Explicit effort/Fast/
  // thinking/context controls still fail visibly in
  // `resolveDevinOneShotModel` instead of silently downgrading.
  let families: DevinModelFamily[] | undefined;
  try {
    const scope = context
      ? {
          location: input.location,
          generation: context.generation,
          volatileGeneration: await resolveDevinVolatileCatalogScope(context, input.signal),
        }
      : {
          location: input.location,
          // Base/default utilities key the native default account's scoped
          // view, so detection's warmed entry is reused and a rotated
          // default credential is never served the previous catalog.
          ...(await resolveDevinDefaultCatalogScope(input.location, input.signal)),
        };
    const scopeKey = devinModelCatalogKey(scope);
    families = cachedDevinModelsForKey(scopeKey).length
      ? cachedDevinModelsForKey(scopeKey)
      : await loadDevinModelsForKey(
          scopeKey,
          input.location,
          executable,
          input.signal,
          context?.env,
          context?.prefixArgs,
        );
  } catch {
    families = undefined;
  }
  const model = resolveDevinUtilityModel(families, input.selection, owner);
  const { spec, spawn } = await prepareOneShot(input.location, {
    command: "devin",
    args: [...(context?.prefixArgs ?? []), ...buildDevinOneShotArgs(model, input.prompt)],
    isolateCwd: !input.readOnlyWorkspace,
    ...(context?.env ? { env: context.env } : {}),
  });
  return spawn(spec, "", 120_000, input.signal);
}
