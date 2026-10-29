import { z } from "zod";

// Version 2 adds the saved-session auth variant (CLI/TUI ship together; a v1
// TUI launched by a v2 CLI — or vice versa — refuses cleanly, never degrades).
export const TUI_BOOTSTRAP_VERSION = 2;
export const TUI_HOME_DIRECTORY = "tui";
export const TUI_LAST_MODEL_FILE_NAME = "last-model.json";
// Version 1 remains additive so older selection files retain their meaning.
export const TUI_LAST_MODEL_VERSION = 1;

export const tuiBootstrapArgsSchema = z
  .strictObject({
    continue: z.boolean().optional(),
    sessionId: z.string().min(1).optional(),
    prompt: z.string().optional(),
    auto: z.boolean().optional(),
  })
  .default({});

const tuiBootstrapBase = {
  version: z.literal(TUI_BOOTSTRAP_VERSION),
  appVersion: z.string().min(1),
  home: z.string().min(1),
  directory: z.string().min(1),
  projectId: z.string().min(1).optional(),
  args: tuiBootstrapArgsSchema,
};

export const tuiBootstrapSchema = z.discriminatedUnion("auth", [
  z.strictObject({ ...tuiBootstrapBase, auth: z.literal("pairing"), pairingUrl: z.string().url() }),
  // Session mode carries no credentials — the TUI loads session.json from
  // PORACODE_TUI_HOME itself so rotation stays single-file authoritative.
  z.strictObject({ ...tuiBootstrapBase, auth: z.literal("session") }),
]);
export type TuiBootstrap = z.infer<typeof tuiBootstrapSchema>;

export const tuiLastModelSchema = z
  .object({
    version: z.literal(TUI_LAST_MODEL_VERSION),
    provider: z.string().min(1),
    model: z.string().min(1),
    effort: z.string().min(1).optional(),
    fast: z.boolean().optional(),
    thinking: z.boolean().optional(),
    contextSize: z.string().min(1).optional(),
    approvalPolicy: z.string().min(1).optional(),
    sandboxMode: z.string().min(1).optional(),
    updatedAt: z.string().min(1),
  })
  .passthrough();
export type TuiLastModel = z.infer<typeof tuiLastModelSchema>;

export class UnsupportedTuiBootstrapVersionError extends Error {
  constructor() {
    super("This TUI build does not match this Poracode CLI; reinstall/update");
    this.name = "UnsupportedTuiBootstrapVersionError";
  }
}

export function parseTuiBootstrap(value: unknown): TuiBootstrap {
  const version = z.object({ version: z.unknown() }).safeParse(value);
  if (!version.success || version.data.version !== TUI_BOOTSTRAP_VERSION)
    throw new UnsupportedTuiBootstrapVersionError();
  return tuiBootstrapSchema.parse(value);
}
