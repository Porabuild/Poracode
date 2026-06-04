import { app } from "electron";
import { type LightcodeChannel, webAuthnKeychainAccessGroupFor } from "@/shared/channel";

declare const __APPLE_TEAM_ID__: string | undefined;

const BUILD_APPLE_TEAM_ID = typeof __APPLE_TEAM_ID__ === "string" ? __APPLE_TEAM_ID__ : "";

export function configureMacWebAuthn(channel: LightcodeChannel): boolean {
  if (process.platform !== "darwin") {
    return false;
  }

  const keychainAccessGroup = webAuthnKeychainAccessGroupFor(BUILD_APPLE_TEAM_ID, channel);
  if (!keychainAccessGroup) {
    console.error(
      "[lightcode][webauthn] APPLE_TEAM_ID was not available at build time; macOS platform passkeys are disabled.",
    );
    return false;
  }

  try {
    app.configureWebAuthn({
      touchID: {
        keychainAccessGroup,
        promptReason: "sign in to $1",
      },
    });
    return true;
  } catch (error) {
    console.error("[lightcode][webauthn] configureWebAuthn failed", error);
    return false;
  }
}
