import type { ThreadPresentationMode } from "@/shared/contracts";
import type { ModelSelection } from "@/shared/selectionBinding.schemas";
import type { SharedSettings } from "@/shared/settings";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  applyUtilityPresetMutation,
  readUtilitySelection,
  utilitySelectionOwner,
  type UtilityPresetEdit,
} from "@/renderer/utils/utilitySelection";

type UtilityDomain = "titleGen" | "commitGen" | "conflictResolver";
type UtilityKeyPrefix = UtilityDomain | `wsl${Capitalize<UtilityDomain>}`;

/** The shared-settings keys one utility domain reads and writes. */
interface UtilitySettingsKeys {
  canonical: `${UtilityKeyPrefix}Selection`;
  provider: `${UtilityKeyPrefix}Provider`;
  model: `${UtilityKeyPrefix}Model`;
  effort: `${UtilityKeyPrefix}Effort`;
  fast: `${UtilityKeyPrefix}Fast`;
}

export function utilitySettingsKeys(domain: UtilityDomain, wsl: boolean): UtilitySettingsKeys {
  const prefix: UtilityKeyPrefix = wsl
    ? `wsl${(domain.charAt(0).toUpperCase() + domain.slice(1)) as Capitalize<UtilityDomain>}`
    : domain;
  return {
    canonical: `${prefix}Selection`,
    provider: `${prefix}Provider`,
    model: `${prefix}Model`,
    effort: `${prefix}Effort`,
    fast: `${prefix}Fast`,
  };
}

/** The complete stored tuple: the canonical object, else the scalar siblings. */
function readStoredUtilitySelection(state: SharedSettings, keys: UtilitySettingsKeys) {
  return readUtilitySelection(state[keys.canonical], {
    model: state[keys.model],
    effort: state[keys.effort],
    fast: state[keys.fast],
  });
}

/** Apply only the deliberate event's fields over the complete previous tuple. */
export function createUtilityPresetSetter(input: {
  keys: UtilitySettingsKeys;
  presentation: ThreadPresentationMode | undefined;
  setScalars: (provider: string, model: string, effort: string, fast: boolean) => void;
}) {
  const { keys } = input;
  return (
    provider: string,
    model: string,
    effort: string,
    fast: boolean,
    edit: UtilityPresetEdit,
  ) => {
    const state = useSharedSettings.getState();
    if (edit.kind === "family-noop" && state[keys.provider] === provider) return;
    const previous = readStoredUtilitySelection(state, keys);
    const { selectionBinding: _binding, ...actual } = previous;
    let candidate = actual;
    switch (edit.kind) {
      case "reset":
        candidate = { model: "", effort: "", fast: false };
        break;
      case "model":
        candidate = { ...actual, ...edit.patch, model };
        break;
      case "carrier":
        candidate = { ...actual };
        for (const axis of edit.axes) {
          const value = edit.patch
            ? edit.patch[axis]
            : axis === "effort"
              ? effort
              : axis === "fast"
                ? fast
                : actual[axis];
          delete candidate[axis];
          if (value !== undefined) Object.assign(candidate, { [axis]: value });
        }
        break;
      case "family-noop":
      case "presentation":
        break;
    }
    const next = applyUtilityPresetMutation({
      previous,
      previousProvider: state[keys.provider],
      nextProvider: provider,
      next: candidate,
      owner: utilitySelectionOwner(provider, input.presentation ?? "terminal"),
      // One-shot presentation declaration is still pending; never mint for it.
      mintAllowed: input.presentation !== undefined,
      edit,
    });
    persistUtilityPreset(keys, provider, next, input.setScalars);
  };
}

/** Ordinary presentation retarget: preserve controls, permanently revoke old intent. */
export function setUtilityPresentation(wsl: boolean, presentation: ThreadPresentationMode): void {
  const keys = utilitySettingsKeys("conflictResolver", wsl);
  const state = useSharedSettings.getState();
  const presentationKey = wsl
    ? "wslConflictResolverPresentationMode"
    : "conflictResolverPresentationMode";
  if (state[presentationKey] === presentation) return;
  const previous = readStoredUtilitySelection(state, keys);
  const { selectionBinding: _binding, ...actual } = previous;
  const next = applyUtilityPresetMutation({
    previous,
    next: actual,
    previousProvider: state[keys.provider],
    nextProvider: state[keys.provider],
    owner: utilitySelectionOwner(state[keys.provider], presentation),
    mintAllowed: false,
    edit: { kind: "presentation" },
  });
  const setScalars = wsl ? state.setWslConflictResolverConfig : state.setConflictResolverConfig;
  persistUtilityPreset(keys, state[keys.provider], next, setScalars, {
    [presentationKey]: presentation,
  });
}

/** One canonical value supplies both views and the single persistence snapshot. */
function persistUtilityPreset(
  keys: UtilitySettingsKeys,
  provider: string,
  next: ModelSelection,
  setScalars: (provider: string, model: string, effort: string, fast: boolean) => void,
  extra: Partial<SharedSettings> = {},
): void {
  useSharedSettings.setState({
    ...extra,
    [keys.canonical]: next,
    [keys.provider]: provider,
    [keys.model]: next.model,
    [keys.effort]: next.effort ?? "",
    [keys.fast]: next.fast ?? false,
  });
  setScalars(provider, next.model, next.effort ?? "", next.fast ?? false);
}
