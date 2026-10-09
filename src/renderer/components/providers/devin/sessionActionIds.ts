/**
 * Renderer-side ids for the Devin session actions the GUI controls know how
 * to present. These mirror `DEVIN_ACP_SESSION_ACTION_IDS` from the
 * supervisor's `agents/devin/acp/sessionActions.ts` (renderer source may not
 * import supervisor paths) — they are the neutral seam's address space, not a
 * capability claim: a control renders only when the live
 * `listThreadSessionActions` inventory for the thread actually contains its
 * id, so an older supervisor or a session without the action hides the
 * control instead of advertising a dead button.
 */
export const DEVIN_SESSION_ACTION_IDS = {
  rename: "devin.session.rename",
  revise: "devin.command.revise",
  rules: "devin.rules.list",
  hooks: "devin.hooks.list",
  archive: "devin.session.archive",
} as const;

export type DevinSessionActionId =
  (typeof DEVIN_SESSION_ACTION_IDS)[keyof typeof DEVIN_SESSION_ACTION_IDS];

/**
 * Renderer-side ids for the LIVE session-configuration action pair
 * (`devin.config.list` / `devin.config.set`), mirroring
 * `DEVIN_ACP_CONFIG_ACTION_IDS` from the supervisor's
 * `agents/devin/acp/sessionConfiguration.ts`. A separate constant — not a
 * member of {@link DEVIN_SESSION_ACTION_IDS} — because the supervisor
 * declares the pair from its own seam (only when the live config transport
 * members exist), while this map is the renderer's presentation address
 * space; both sides are parity-locked by test. The settings entry renders
 * only when the inventory advertises BOTH ids.
 */
export const DEVIN_SESSION_CONFIG_ACTION_IDS = {
  list: "devin.config.list",
  set: "devin.config.set",
} as const;

/**
 * Seam id for the read-only native persona catalog (`native-personas.list`,
 * payload `{}`), answered by the supervisor's persona index through the same
 * session-action inventory. Deliberately a separate constant, not a member of
 * {@link DEVIN_SESSION_ACTION_IDS}: it is the provider-agnostic native
 * personas descriptor id, not a Devin ACP action, and the supervisor parity
 * test keeps comparing the Devin ids exactly. Native clients (iOS/Android)
 * mirror this exact string.
 */
export const DEVIN_NATIVE_PERSONAS_ACTION_ID = "native-personas.list";
