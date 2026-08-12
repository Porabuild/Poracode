import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import type { SshBridgeAuthentication } from "@poracode/ssh-bridge";

const KEY_PREFIX = "remoteSshCredential.";

function keyFor(connectionId: string): string {
  return `${KEY_PREFIX}${connectionId}`;
}

export async function setSshCredential(
  connectionId: string,
  credential: SshBridgeAuthentication,
): Promise<void> {
  await SecureStorage.set(keyFor(connectionId), JSON.stringify(credential));
}

export async function getSshCredential(
  connectionId: string,
): Promise<SshBridgeAuthentication | null> {
  const raw = await SecureStorage.get(keyFor(connectionId));
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw) as Partial<SshBridgeAuthentication>;
    if (value.kind === "password" && typeof value.password === "string") {
      return { kind: "password", password: value.password };
    }
    if (value.kind === "private-key" && typeof value.privateKey === "string") {
      return {
        kind: "private-key",
        privateKey: value.privateKey,
        ...(typeof value.passphrase === "string" ? { passphrase: value.passphrase } : {}),
      };
    }
  } catch {
    // A corrupt keystore entry is treated like a missing credential.
  }
  return null;
}

export async function deleteSshCredential(connectionId: string): Promise<void> {
  await SecureStorage.remove(keyFor(connectionId));
}
