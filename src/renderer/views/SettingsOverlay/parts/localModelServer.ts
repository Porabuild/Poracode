import { modelProviderUrlSchema } from "@/shared/contracts/modelProviders";

/** Exact model ids accepted by profile configs. */
export const LOCAL_PROFILE_MODEL_MAX_LENGTH = 200;

/** A credential-free HTTP(S) endpoint; reuses the authoritative provider URL schema. */
export function isValidModelEndpoint(value: string): boolean {
  return modelProviderUrlSchema.safeParse(value.trim()).success;
}
