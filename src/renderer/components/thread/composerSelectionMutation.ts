import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import {
  applyThreadConfigMutation,
  SELECTION_AXES,
  type SelectionMutationEvent,
} from "@/shared/selectionBinding";
import { modelFamilyForModel } from "@/shared/modelFamilySelection";
import type { SelectionBindingOwner } from "@/shared/selectionBinding.schemas";

/**
 * The ordinary composer's complete-config selection seam over the one shared
 * mutation primitive (`applyThreadConfigMutation`).
 *
 * Composer callbacks carry an optional ephemeral {@link ComposerSelectionOrigin}
 * beside their patch — private UI metadata that is never serialized, persisted,
 * or branched on a provider name. It preserves what the patch shape alone
 * cannot prove: whether a model-bearing patch is a member edit the shared
 * relation helper already resolved (the only event that may mint) or an
 * explicit raw pick. Every other event is classified from the patch's touched
 * keys, so existing generic provider controls keep working unchanged: a bare
 * model patch drops the record, carrier-only patches revoke the touched axes,
 * and unrelated patches (mode/approval/sandbox/MCP, an empty family retain)
 * just retain still-matching intent.
 *
 * The event type is always derived from the user's operation and the validated
 * actual surface — the projected relation of the resolved model, and the
 * ephemeral origin the producing leaf attached — never from UID syntax, a
 * record, or the resolved patch's own membership: a raw pick stays an exact
 * drop even when a relation helper collateral-computed its member patch.
 * Unresolvable inputs stay refused inside the shared primitive; a
 * family-resolved edit whose relation lookup finds nothing on this surface
 * routes as an exact pick instead of inventing a mint.
 */

/**
 * Ephemeral origin of one resolved composer patch, attached by the leaf that
 * produced it. `family-resolved` — the patch came from the shared relation
 * edit helper and may mint when its model resolves to a member of the
 * surface's projected relation. `raw-pick` — the patch came from the ordinary
 * model-menu path and always drops the record, including a same-UID re-pick.
 */
export type ComposerSelectionOrigin = { kind: "family-resolved" } | { kind: "raw-pick" };

/**
 * Classify one resolved patch into the neutral mutation event. A model-bearing
 * patch is a family-member edit only when the shared helper resolved it and
 * the resulting model is an actual member of a projected relation on this
 * surface; carrier-key touches revoke exactly those axes even when the values
 * did not change; everything else — an empty family retain or an unrelated
 * field edit — retains still-matching intent without minting.
 */
export function composerSelectionEvent(
  patch: Partial<ThreadConfig>,
  origin: ComposerSelectionOrigin | undefined,
  capabilities: AgentCapability,
): SelectionMutationEvent {
  if (Object.hasOwn(patch, "model")) {
    if (origin?.kind === "family-resolved") {
      const relation = modelFamilyForModel(capabilities, patch.model);
      if (relation) return { type: "family-member-edit", relation };
    }
    return { type: "exact-model-edit" };
  }
  const axes = SELECTION_AXES.filter((axis) => Object.hasOwn(patch, axis));
  if (axes.length > 0) return { type: "independent-carrier-edit", axes };
  return { type: "unrelated-edit" };
}

/**
 * The one complete-config replacement for a deliberate composer edit.
 * `previous` is the actual complete stored thread config; `effective` is the
 * live normalized overlay the composer displays; `patch` is the caller's
 * resolved edit. The composed candidate is the previous config under the
 * overlay and the patch, and any stamp it carries is extracted explicitly
 * before the one helper input — the documented next candidate has no stamp
 * authority — so only the classified event decides the returned field.
 * Unrelated config fields and every own-present actual control (empty strings
 * and false included) flow through untouched; the caller persists the result
 * only when it differs from `previous` (see `isThreadConfigEqual`), so a
 * harmless no-op never becomes a native setter acknowledgement.
 */
export function applyComposerSelectionMutation(input: {
  previous: ThreadConfig;
  effective: ThreadConfig;
  patch: Partial<ThreadConfig>;
  origin: ComposerSelectionOrigin | undefined;
  capabilities: AgentCapability;
  owner: SelectionBindingOwner;
}): ThreadConfig {
  const { selectionBinding: _carriedRecord, ...candidate } = {
    ...input.previous,
    ...input.effective,
    ...input.patch,
  };
  return applyThreadConfigMutation({
    previous: input.previous,
    next: candidate,
    owner: input.owner,
    event: composerSelectionEvent(input.patch, input.origin, input.capabilities),
  });
}
