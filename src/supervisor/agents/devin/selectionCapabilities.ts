import type { AgentCapability } from "@/shared/contracts";
import type { CapabilitiesProbeResult } from "../base";
import { DEVIN_CLOUD_DEFAULT_MODEL_ID, type DevinModelFamily } from "./models";
import { devinGuiFamilySelections } from "./modelFamilySelections";
import { devinDefaultHiddenModels } from "./modelVisibility";

/**
 * Provider-owned GUI selection projection (Qpicker correction).
 *
 * The shared ACP probe negotiates the session's ACTUAL config options: the
 * accepted `model` values, the separate `thought_level` ladder, and the
 * per-model controls observed during the sweep. That negotiated menu — not
 * the full CLI catalog (whose family/effort variants include ids the live
 * session would refuse) — is what the GUI picker must offer, so a detected
 * selection is always launchable. The CLI catalog stays the base capability
 * set for Terminal, where `--model` accepts every catalog UID.
 *
 * The catalog contributes pricing for accepted ids while native option
 * labels preserve speed, context and composite pair identity, never extra
 * entries. Overrides are schema-complete: runtime-identity fields are taken
 * from the negotiated projection (falling back to the provider baseline), so
 * the shared presentation fold needs no further filling.
 */

export type DevinGuiSelectionOverride = NonNullable<
  NonNullable<AgentCapability["presentationCapabilities"]>["gui"]
>;

/** The shared runtime-identity fields every GUI override must declare. */
function devinGuiRuntimeIdentity(
  base: AgentCapability,
  projection: CapabilitiesProbeResult,
): Pick<
  DevinGuiSelectionOverride,
  | "modes"
  | "approvalPolicies"
  | "sandboxModes"
  | "supportsResume"
  | "supportsDirectInput"
  | "liveInputMode"
  | "presentationMode"
  | "settingDefs"
> {
  return {
    modes: projection.modes?.length ? projection.modes : (base.modes ?? []),
    approvalPolicies: projection.approvalPolicies ?? base.approvalPolicies ?? [],
    sandboxModes: projection.sandboxModes ?? base.sandboxModes ?? [],
    supportsResume: base.supportsResume ?? true,
    supportsDirectInput: base.supportsDirectInput ?? true,
    liveInputMode: "server",
    presentationMode: "gui",
    settingDefs: base.settingDefs ?? [],
  };
}

type CatalogIdentity = { description?: string };

/** Accepted IDs receive catalog pricing without changing native controls. */
function devinCatalogIdentityIndex(
  families: readonly DevinModelFamily[],
): Map<string, CatalogIdentity> {
  const index = new Map<string, CatalogIdentity>();
  for (const family of families) {
    for (const variant of family.variants) {
      if (index.has(variant.id)) continue;
      index.set(variant.id, {
        ...(variant.cost ? { description: variant.cost } : {}),
      });
    }
  }
  return index;
}

/**
 * The GUI selection override for a LOCAL session, built from the negotiated
 * ACP options. `undefined` when the probe negotiated no model menu — the
 * presentation helper then fills the GUI from the terminal catalog instead
 * of hiding the provider (an enrichment gap; the ACP resolver still rejects
 * any non-accepted pick at chat time).
 */
export function devinNegotiatedGuiSelectionCapabilities(
  base: AgentCapability,
  projection: CapabilitiesProbeResult,
  families: readonly DevinModelFamily[],
): Pick<AgentCapability, "presentationCapabilities"> | undefined {
  const negotiated = projection.models ?? [];
  if (negotiated.length === 0) return undefined;
  const identity = devinCatalogIdentityIndex(families);
  // Unprobed models inherit the negotiated global ladder. Composite pairs
  // also expose an independent native thought-level selector; catalog labels
  // must not suppress it. Explicit per-model ladders remain authoritative.
  const modelEfforts = { ...(projection.modelEfforts ?? {}) };
  // The accepted-menu relation (62 pair rows on the captured inventory,
  // effort/Fast owned by the independent native selects). Declared even when
  // EMPTY: a presentation override must re-declare its own accepted-member
  // relation — the shared fold strips the root value so an override that
  // stayed silent would advertise no relation at all.
  const guiFamilies = devinGuiFamilySelections(negotiated, families);
  const hiddenModels = new Set(devinDefaultHiddenModels(families));
  const gui: DevinGuiSelectionOverride = {
    // The ACP effort control IS the separate thought_level select: its
    // observed ladder (and the session's current level) is the GUI effort
    // declaration. No per-family effort matrix is synthesized.
    models: negotiated.map((model) => {
      const known = identity.get(model.id);
      return {
        ...model,
        // The native menu owns distinctions such as context and speed.
        // Catalog pricing enriches the row without replacing its identity.
        ...(known?.description ? { description: known.description } : {}),
      };
    }),
    efforts: projection.efforts ?? [],
    modelEfforts,
    defaultHiddenModels: negotiated
      .filter((model) => hiddenModels.has(model.id))
      .map((model) => model.id),
    ...(projection.defaultEffort ? { defaultEffort: projection.defaultEffort } : {}),
    ...(projection.modelDefaultEfforts
      ? { modelDefaultEfforts: projection.modelDefaultEfforts }
      : {}),
    // Grouped-menu sections, when the negotiated menu arrived grouped: the
    // shared picker renders them as sub-provider sections. Flat menus omit
    // both, keeping the override (and the picker) exactly as before. Native
    // group ids/labels pass through verbatim — sections are provider content.
    ...(projection.subProviders?.length ? { subProviders: projection.subProviders } : {}),
    ...(projection.modelSubProvider && Object.keys(projection.modelSubProvider).length > 0
      ? { modelSubProvider: projection.modelSubProvider }
      : {}),
    ...(projection.fastModels?.length ? { fastModels: projection.fastModels } : {}),
    ...(projection.thinkingModels?.length ? { thinkingModels: projection.thinkingModels } : {}),
    ...(projection.contextSizes?.length ? { contextSizes: projection.contextSizes } : {}),
    ...(projection.modelContextSizes ? { modelContextSizes: projection.modelContextSizes } : {}),
    modelFamilies: guiFamilies,
    ...devinGuiRuntimeIdentity(base, projection),
  };
  return { presentationCapabilities: { gui } };
}

/**
 * The cloud selection projection. Cloud ACP exposes no `model` option at all
 * (the model role is `devin_version`, only visible on an open session, and
 * probing would allocate one) — yet a provider with zero advertised models
 * is hidden by the pickers and the draft refuses an empty model, so the
 * profile would be unstartable. The provider-owned native-default choice
 * (label "Default", the common provider-agnostic label) is the single honest
 * entry: the resolver resolves it to the live `devin_version` current value,
 * never an invented id. No cloud modes/approval policies are invented: the
 * override (and the base fields) declare empty lists.
 */
export function devinCloudSelectionCapabilities(
  base: AgentCapability,
): Pick<
  AgentCapability,
  | "models"
  | "efforts"
  | "modelEfforts"
  | "modes"
  | "approvalPolicies"
  | "sandboxModes"
  | "supportsResume"
> &
  Pick<AgentCapability, "presentationCapabilities"> {
  const cloudModel = { id: DEVIN_CLOUD_DEFAULT_MODEL_ID, label: "Default" };
  const gui: DevinGuiSelectionOverride = {
    models: [cloudModel],
    efforts: [],
    modelEfforts: { [DEVIN_CLOUD_DEFAULT_MODEL_ID]: [] },
    modes: [],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: base.supportsResume ?? true,
    supportsDirectInput: base.supportsDirectInput ?? true,
    liveInputMode: "server",
    presentationMode: "gui",
    settingDefs: base.settingDefs ?? [],
  };
  return {
    models: [cloudModel],
    efforts: [],
    modelEfforts: { [DEVIN_CLOUD_DEFAULT_MODEL_ID]: [] },
    modes: [],
    approvalPolicies: [],
    sandboxModes: [],
    // Cloud PTY launches do not yet produce an owned resumable ID. GUI
    // loadSession remains independently supported by its override above.
    supportsResume: false,
    presentationCapabilities: { gui },
  };
}
