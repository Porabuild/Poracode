import { clearUsageSecret } from "@/shared/usageSecretStore";

/** Retire Poracode's encrypted copy only. Antigravity still owns its sign-in. */
export function retireAntigravityUsageCredential(cacheDir: string): void {
  try {
    clearUsageSecret(cacheDir, "antigravity", "acp-credentials-v1");
  } catch {
    // A read-only cache must not prevent the host from starting.
  }
}
