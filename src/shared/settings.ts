import { z } from "zod";
import { terminalPositionSchema, themeModeSchema } from "./contracts";

export const sharedSettingsSchema = z.object({
  themeMode: themeModeSchema,
  terminalPosition: terminalPositionSchema,
  commitGenProvider: z.string(),
  commitGenModel: z.string(),
  commitGenEffort: z.string(),
  titleGenProvider: z.string(),
  titleGenModel: z.string(),
  titleGenEffort: z.string(),
});
export type SharedSettings = z.infer<typeof sharedSettingsSchema>;

export const defaultSharedSettings: SharedSettings = {
  themeMode: "system",
  terminalPosition: "right",
  commitGenProvider: "auto",
  commitGenModel: "",
  commitGenEffort: "",
  titleGenProvider: "auto",
  titleGenModel: "",
  titleGenEffort: "",
};

const partialSharedSettingsSchema = sharedSettingsSchema.partial();

export function normalizeSharedSettings(value: unknown): SharedSettings {
  const parsed = partialSharedSettingsSchema.safeParse(value);
  if (!parsed.success) {
    return { ...defaultSharedSettings };
  }

  return {
    themeMode: parsed.data.themeMode ?? defaultSharedSettings.themeMode,
    terminalPosition: parsed.data.terminalPosition ?? defaultSharedSettings.terminalPosition,
    commitGenProvider: parsed.data.commitGenProvider ?? defaultSharedSettings.commitGenProvider,
    commitGenModel: parsed.data.commitGenModel ?? defaultSharedSettings.commitGenModel,
    commitGenEffort: parsed.data.commitGenEffort ?? defaultSharedSettings.commitGenEffort,
    titleGenProvider: parsed.data.titleGenProvider ?? defaultSharedSettings.titleGenProvider,
    titleGenModel: parsed.data.titleGenModel ?? defaultSharedSettings.titleGenModel,
    titleGenEffort: parsed.data.titleGenEffort ?? defaultSharedSettings.titleGenEffort,
  };
}
