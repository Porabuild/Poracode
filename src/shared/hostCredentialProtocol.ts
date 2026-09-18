/** Native host callbacks transform key bytes only; they never receive file paths. */
export interface NativeSecretValue {
  readonly ownerGeneration: string;
  readonly value: string;
}

export type NativeCredentialMode = "os-sealed" | "session-only";
