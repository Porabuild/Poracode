import type { DevinProfileConfig } from "@/shared/agents/devin/profileConfig";
import type { AcpStructuredSessionOptions } from "../acp/session";
import {
  findAdvertisedConfigOption,
  listAdvertisedSelectValueIds,
} from "../acp/sessionConfigOptions";
import { profileUnavailable } from "./sessionBinding";

type CloudDefaults = DevinProfileConfig["cloudDefaults"];
type ConfigureOpenedSession = NonNullable<AcpStructuredSessionOptions["configureOpenedSession"]>;

/** Only explicitly selected chat launch choices affect execution. Unknown
 * future profile keys remain persisted but are never guessed into RPCs. */
export function hasDevinCloudSetupChoices(defaults: CloudDefaults): boolean {
  return (
    defaults !== undefined &&
    (defaults.repositories !== undefined ||
      defaults.persona !== undefined ||
      defaults.platform !== undefined)
  );
}

function pendingCloudSession(response: unknown): boolean {
  if (!response || typeof response !== "object" || Array.isArray(response)) return false;
  const meta = (response as { _meta?: unknown })._meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const pending = (meta as Record<string, unknown>)["cognition.ai/pendingSession"];
    if (pending !== undefined && typeof pending !== "boolean") {
      throw profileUnavailable(
        "cloud-pending-state-invalid",
        "The cloud relay returned an invalid pending-session marker.",
      );
    }
  }
  return (
    !!meta &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    (meta as Record<string, unknown>)["cognition.ai/pendingSession"] === true
  );
}

/** The native cloud relay accepts an empty repository selection and CSV of
 * advertised repository ids although neither is itself an option row. Both
 * were echoed by 3000.11.3 before activation and on pending session/load.
 * This declaration never authorizes another option or a foreign repository. */
export const allowDevinCloudRepositorySelection: NonNullable<
  AcpStructuredSessionOptions["allowUnlistedSelectValue"]
> = (configId, value, option) => {
  if (configId !== "repos" || option.type !== "select") return false;
  if (value === "") return true;
  const ids = value.split(",");
  const advertised = listAdvertisedSelectValueIds(option);
  return (
    ids.length > 1 &&
    new Set(ids).size === ids.length &&
    ids.every((id) => id.length > 0 && advertised.includes(id))
  );
};

/** Configure only a fresh or still-pending cloud chat, before the common
 * composer model is applied. A persona may choose its own model, so applying
 * the user's explicit model afterwards keeps the composer authoritative.
 * Activated resumes keep their existing VM; absent profile fields keep the
 * relay's current choice (including changes from an earlier pending attempt). */
export function configureDevinCloudSetup(defaults: CloudDefaults): ConfigureOpenedSession {
  const choices = defaults === undefined ? undefined : structuredClone(defaults);
  return async (opened) => {
    if (!hasDevinCloudSetupChoices(choices)) return;
    if (opened.kind !== "new" && !pendingCloudSession(opened.openResponse)) return;

    const set = async (configId: string, value: string): Promise<void> => {
      const option = findAdvertisedConfigOption(opened.readCurrentConfigOptions(), configId);
      if (!option || option.type !== "select") {
        throw profileUnavailable(
          "cloud-setup-unavailable",
          `The cloud session does not offer ${configId}.`,
        );
      }
      const advertised = listAdvertisedSelectValueIds(option);
      if (
        !advertised.includes(value) &&
        !allowDevinCloudRepositorySelection(configId, value, option)
      ) {
        throw profileUnavailable(
          "cloud-setup-selection-unavailable",
          `The cloud session does not offer the selected ${configId} value.`,
        );
      }
      if (option.currentValue !== value) await opened.setConfigOption(configId, value);
    };

    if (choices?.persona !== undefined) await set("persona_slug", choices.persona);
    if (choices?.platform !== undefined) await set("platform", choices.platform);
    if (choices?.repositories !== undefined) {
      if (new Set(choices.repositories).size !== choices.repositories.length) {
        throw profileUnavailable(
          "cloud-setup-selection-unavailable",
          "The cloud repository selection contains repeated identifiers.",
        );
      }
      await set("repos", choices.repositories.join(","));
    }
  };
}

/** These are ACP chat setup controls, not CLI flags. Refuse a different
 * presentation's launch rather than dropping an explicit workspace choice.
 * The real cloud CLI still supports its own interactive setup commands. */
export function assertDevinCloudSetupChatOnly(
  runtimeTarget: "local" | "cloud" | undefined,
  defaults: CloudDefaults,
): void {
  if (runtimeTarget !== "cloud" || !hasDevinCloudSetupChoices(defaults)) return;
  throw profileUnavailable(
    "cloud-setup-chat-only",
    "This profile has cloud chat setup choices. Use Chat, or clear those choices and configure the workspace in Devin's native CLI.",
  );
}
