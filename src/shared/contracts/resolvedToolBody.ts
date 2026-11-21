import { z } from "zod";

/** Closed display vocabulary. It contains no tool names, actions, or executable data. */
const text = z.string().max(1_048_576);
export const resolvedToolBodySchema = z.object({
  blocks: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("markdown"), text }),
        z.object({ kind: z.literal("code"), text, language: z.enum(["plain", "json"]) }),
        z.object({
          kind: z.literal("disclosure-list"),
          label: z.literal("results"),
          countLabel: z.string().max(4096),
          rows: z
            .array(
              z.object({
                title: text.optional(),
                summary: text,
                detail: text.optional(),
                fields: z
                  .array(
                    z.object({
                      label: text,
                      text,
                      kind: z.enum(["text", "code"]),
                    }),
                  )
                  .max(4096),
              }),
            )
            .max(4096),
        }),
      ]),
    )
    .max(8),
});
export type ResolvedToolBody = z.infer<typeof resolvedToolBodySchema>;
