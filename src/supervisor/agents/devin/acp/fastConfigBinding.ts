import type { AcpSelectBooleanConfigBinding } from "../../acp/modelConfigOptions";

/**
 * Native id of the local fast/standard quality selector, exact as advertised:
 * `{"id":"speed","name":"Speed","category":"model_config","type":"select",
 * "currentValue":"standard","options":[{"value":"standard","name":"Standard"},
 * {"value":"fast","name":"Fast"}]}` (live `devin acp` 3000.11.3,
 * tmp/devin/checkpoint-l-native-pair-controls.json).
 */
export const DEVIN_ACP_SPEED_CONFIG_ID = "speed";

/**
 * Provider declaration binding the shared ThreadConfig `fast` toggle onto
 * the native `speed` select — the fast/standard quality selector of a local
 * `devin acp` 3000.11.3 session (exact capture,
 * tmp/devin/checkpoint-l-native-pair-controls.json):
 * `{"id":"speed","name":"Speed","category":"model_config","type":"select",
 * "currentValue":"standard","options":[{"value":"standard","name":"Standard"},
 * {"value":"fast","name":"Fast"}]}`.
 *
 * The shared seam (`AcpSelectBooleanConfigBinding`, consumed by
 * `findFastConfigOption`, the composer role tagging and the config-sync
 * fold/push) classifies the bound control by exact id plus the exact
 * two-value pair — the native category stays untouched — then folds the
 * agent's native echo back onto the boolean and pushes the exact native
 * value id on a toggle. Ids and values are never rewritten and no
 * `true`/`false` wire aliases are invented. The binding drives only a
 * session that actually advertises this select with exactly these two
 * values; anything else keeps `fast` unbound rather than guessing.
 *
 * Declared for LOCAL sessions only (launcher behavior). Cloud declares
 * nothing — its Fast model tier (`devin-fast-opus`) stays the sole cloud
 * model choice, with no new cloud toggle.
 */
export const DEVIN_ACP_FAST_CONFIG_BINDING: AcpSelectBooleanConfigBinding = {
  configId: DEVIN_ACP_SPEED_CONFIG_ID,
  disabled: "standard",
  enabled: "fast",
};
