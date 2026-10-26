import { z } from "zod";

// Review metadata shared by forge payloads and review results. Kept free of
// other contract imports so both modules can depend on it without a cycle.

export const prLabelSchema = z.object({
  name: z.string().min(1),
  /** Six-digit hex without `#`. */
  color: z
    .string()
    .regex(/^[0-9a-f]{6}$/i)
    .optional(),
  description: z.string().optional(),
});

export const prReviewerSchema = z.object({
  /** The host's own request identity; opaque to clients. */
  id: z.string().min(1),
  login: z.string().min(1),
  name: z.string().optional(),
  avatarUrl: z.string().optional(),
  /** A group request (GitHub team, GitLab group). */
  team: z.boolean().optional(),
});
