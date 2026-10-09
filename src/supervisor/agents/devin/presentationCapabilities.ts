import type { AgentCapability } from "@/shared/contracts";

/**
 * GUI presentation override composition.
 *
 * Detection may attach an EXPLICIT gui override (the ACP-negotiated model
 * menu — see `selectionCapabilities.ts`). Presentation overrides replace
 * selection fields in the shared picker, so such an override must survive
 * this composition: its models/efforts/controls are the launchable session
 * truth, and replacing them with the terminal catalog's fields would offer
 * unlaunchable variants again. Base (terminal) fields only FILL the gaps so
 * the shared fold never sees a selection-less override.
 */
export function withDevinPresentationCapabilities(capabilities: AgentCapability): AgentCapability {
  const detected = capabilities.presentationCapabilities?.gui;
  // Surface isolation for the family relation: a negotiated override always
  // declares its own relation (see selectionCapabilities) and wins as-is; an
  // override WITHOUT the field is declared empty so the CLI-wide table is
  // never inherited. With NO override, the GUI fallback declares NO relation
  // either: the only compiled GUI relation is the accepted-menu one, and a
  // probe enrichment gap must not change control encoding. The base relation
  // is model-bound (Terminal), so copying it here would advertise CLI-only
  // pairs and — once the live model select narrows the inventory — would keep
  // those model-bound bindings while hiding the native Effort/Fast controls.
  // The catalog-fallback GUI stays on the ordinary raw models and native
  // controls until an accepted, config-bound relation exists.
  const gui = {
    ...selectionFields(capabilities),
    ...detected,
    ...(detected ? (detected.modelFamilies === undefined ? { modelFamilies: [] } : {}) : {}),
    presentationMode: "gui" as const,
    liveInputMode: "server" as const,
    // The legacy GUI Bypass default; an explicit override entry wins.
    defaultApprovalPolicy: detected?.defaultApprovalPolicy ?? "bypass",
  };
  return {
    ...capabilities,
    presentationCapabilities: {
      ...capabilities.presentationCapabilities,
      gui,
    },
  };
}

/** Base (terminal) selection fields, filling only what the override omits. */
function selectionFields(capabilities: AgentCapability): Partial<AgentCapability> {
  const keys = [
    "models",
    "efforts",
    "modelEfforts",
    "defaultEffort",
    "modelDefaultEfforts",
    "defaultHiddenModels",
    "contextSizes",
    "modelContextSizes",
    "defaultContextSize",
    "fastModels",
    "fastDisabledReason",
    "thinkingModels",
    "subProviders",
    "modelSubProvider",
    "modes",
    "approvalPolicies",
    "sandboxModes",
    "supportsResume",
    "supportsDirectInput",
    "settingDefs",
  ] as const;
  return Object.fromEntries(
    keys.filter((key) => capabilities[key] !== undefined).map((key) => [key, capabilities[key]]),
  );
}
