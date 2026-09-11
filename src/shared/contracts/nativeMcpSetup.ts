import { z } from "zod";
import { agentKindSchema } from "./common";
import { agentEnvSchema } from "../machines";

export const nativeMcpSetupPayloadSchema = z.object({
  agentKind: agentKindSchema,
  env: agentEnvSchema,
});
export type NativeMcpSetupPayload = z.infer<typeof nativeMcpSetupPayloadSchema>;
export const applyNativeMcpSetupPayloadSchema = nativeMcpSetupPayloadSchema.extend({
  revision: z.string().min(1),
  installIds: z.array(z.string().min(1)).max(200),
  removeNames: z.array(z.string().min(1)).max(200),
});
export type ApplyNativeMcpSetupPayload = z.infer<typeof applyNativeMcpSetupPayloadSchema>;
export interface NativeMcpSetupStatus {
  supported: boolean;
  configPath?: string;
  revision?: string;
  issue?: "invalid-config";
  candidates: {
    id: string;
    name: string;
    target: string;
    eligible: boolean;
    conflict: boolean;
    installed: boolean;
  }[];
  installedNames: string[];
  modifiedNames: string[];
}
