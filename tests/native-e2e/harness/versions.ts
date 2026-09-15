/**
 * Native-e2e harness format versions. Bump when a persisted or control-plane
 * shape changes; these artifacts are disposable but still a compatibility
 * boundary between the supervisor script, the lab, and mobile runners.
 */
export const NATIVE_E2E_RUN_DIR_VERSION = 1 as const;
export const NATIVE_E2E_READY_FORMAT_VERSION = 1 as const;
export const NATIVE_E2E_LEDGER_FORMAT_VERSION = 2 as const;
export const NATIVE_E2E_SCENARIO_FORMAT_VERSION = 1 as const;
/** Version of the mobile scenario descriptor/state/action vocabulary. */
export const NATIVE_E2E_SCENARIO_API_VERSION = 1 as const;
export const NATIVE_E2E_OPERATION_MAP_VERSION = 1 as const;
/** Append-only checkpoint/fault journal replayed after a harness restart. */
export const NATIVE_E2E_SCRIPT_JOURNAL_VERSION = 1 as const;
/** Version of the additive replay/Git parity control envelope. */
export const NATIVE_E2E_PARITY_FORMAT_VERSION = 1 as const;
/** Version of the host-local exact-frame observation journal. */
export const NATIVE_E2E_OBSERVATION_JOURNAL_VERSION = 1 as const;

export const NATIVE_E2E_RUN_MARKER_NAME = ".native-e2e-run";
export const NATIVE_E2E_RUN_PARENT = ".tmp/native-e2e";
export const NATIVE_E2E_SLOT_ENV = "PORACODE_NATIVE_E2E_SLOT";
export const NATIVE_E2E_KEEP_ENV = "PORACODE_NATIVE_E2E_KEEP";

/** First ephemeral-range port reserved for slot 0, offset 0. */
export const NATIVE_E2E_PORT_BASE = 49152;
export const NATIVE_E2E_PORTS_PER_SLOT = 8;

export const PORT_OFFSET = {
  appHost: 0,
  control: 1,
  relay: 2,
  productionHost: 3,
  upstream: 4,
} as const;

export type PortOffsetName = keyof typeof PORT_OFFSET;
