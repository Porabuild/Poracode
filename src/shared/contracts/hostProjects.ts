import { z } from "zod";
import { projectLocationSchema } from "./common";

export const HOST_PROJECT_INVENTORY_VERSION = 1;
export const hostProjectCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("projects-list"),
    limit: z.int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(4096).optional(),
  }),
  z.strictObject({ action: z.literal("projects-inspect"), projectId: z.string().min(1).max(512) }),
  z.strictObject({
    action: z.literal("projects-add"),
    path: z.string().min(1).max(32768),
    name: z.string().trim().min(1).max(255).optional(),
  }),
]);
export type HostProjectCommand = z.infer<typeof hostProjectCommandSchema>;
export const hostProjectSummarySchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  location: projectLocationSchema,
  disabled: z.boolean(),
  createdAt: z.string().min(1),
});
export type HostProjectSummary = z.infer<typeof hostProjectSummarySchema>;
const metadata = {
  formatVersion: z.literal(HOST_PROJECT_INVENTORY_VERSION),
  scope: z.literal("persisted-profile"),
};
export const hostProjectListSchema = z.strictObject({
  ...metadata,
  projects: z.array(hostProjectSummarySchema).max(100),
  nextCursor: z.string().nullable(),
});
export const hostProjectInspectionSchema = z.strictObject({
  ...metadata,
  project: hostProjectSummarySchema,
});
export const hostProjectAdditionSchema = hostProjectInspectionSchema.extend({
  created: z.boolean(),
});
