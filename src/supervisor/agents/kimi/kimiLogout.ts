import { detectProbeLocation, quotePowerShellLiteral, type AgentEnvContext } from "../base";
import { buildKimiCommand } from "./detection";
import { nativeKimiOAuthCredentialPath } from "./paths";

/**
 * The credential-file half of a Kimi logout.
 *
 * Logout is ACP-first: 0.33.0's v2 server advertises
 * `agentCapabilities.auth.logout`, and the RPC is the engine-native path. The
 * adapter opts into it with `preferAcpLogoutRpc`, and `dispatchAcpLogout` runs
 * that RPC before executing the spec built here. The legacy engine has no
 * logout RPC — its own `/logout` handler just removes the managed OAuth token
 * through FileTokenStorage — so this command IS the logout there, and stays a
 * harmless cleanup (`rm -f` / `-ErrorAction SilentlyContinue`) after a
 * successful RPC.
 *
 * This function is a pure builder on purpose. It used to perform the RPC
 * itself, which meant merely asking the adapter for its logout spec signed the
 * user out — a unit test doing exactly that wiped a real session.
 */
export function buildKimiLogoutCommand(ctx?: AgentEnvContext) {
  const location = detectProbeLocation(ctx);
  if (location.kind === "windows") {
    return {
      command: "powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Remove-Item -LiteralPath ${quotePowerShellLiteral(nativeKimiOAuthCredentialPath())} -Force -ErrorAction SilentlyContinue`,
      ],
      cwd: location.path,
    };
  }
  return buildKimiCommand(
    location,
    ["-c", 'rm -f -- "${KIMI_CODE_HOME:-$HOME/.kimi-code}/credentials/kimi-code.json"'],
    "sh",
  );
}
