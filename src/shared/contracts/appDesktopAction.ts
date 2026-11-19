import { z } from "zod";

export const appDesktopActionStartSchema = z.strictObject({
  version: z.literal(1),
  type: z.literal("start"),
});

export const appDesktopActionNotStartedSchema = z.strictObject({
  type: z.literal("not-started"),
  message: z.string(),
});
export type AppDesktopActionNotStarted = z.infer<typeof appDesktopActionNotStartedSchema>;

export function desktopActionReplySchema<Result extends z.ZodType>(result: Result) {
  return z.discriminatedUnion("type", [
    z.strictObject({ version: z.literal(1), type: z.literal("attached") }),
    z.strictObject({ version: z.literal(1), type: z.literal("accepted") }),
    z.strictObject({ version: z.literal(1), type: z.literal("result"), result }),
    z.strictObject({ version: z.literal(1), type: z.literal("error"), message: z.string() }),
  ]);
}

export type AppDesktopActionReply<Result> =
  | { version: 1; type: "attached" | "accepted" }
  | { version: 1; type: "result"; result: Result }
  | { version: 1; type: "error"; message: string };
