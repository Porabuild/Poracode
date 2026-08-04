import { msg } from "@lingui/core/macro";
import {
  canUpdateCursorSdk,
  cursorRuntimeInstallCommand,
  cursorRuntimeInstallState,
  cursorSdkUpdateCommand,
} from "@/renderer/components/providers/cursor/runtimeInstall";
import type { NativeAgentRuntimeSlots } from "./nativeAgentRuntimes";

export {
  canUpdateCursorSdk,
  cursorAgentInstallCommand,
  cursorRuntimeInstallCommand,
  cursorRuntimeInstallState,
  cursorSdkInstallCommand,
  cursorSdkUpdateCommand,
} from "@/renderer/components/providers/cursor/runtimeInstall";

/** Cursor's install-source vocabulary; only Cursor knows what these mean. */
function cursorSdkSourceLabel(source: string) {
  if (source === "global-npm") return msg`global npm`;
  if (source === "global-pnpm") return msg`global pnpm`;
  if (source === "project") return msg`project managed`;
  if (source === "configured") return msg`custom path`;
  if (source === "node-path") return "NODE_PATH";
  if (source === "global-explicit" || source === "global-inferred") return msg`global`;
  return undefined;
}

/**
 * Cursor ships two independently installed runtimes behind one provider tile:
 * the Cursor Agent CLI (ACP) and the public `@cursor/sdk` package. The shared
 * registry card renders both from this declaration.
 */
export const cursorRuntimeSlots: NativeAgentRuntimeSlots = {
  runtimes: [
    {
      id: "acp",
      badge: "ACP",
      installedTag: msg`ACP installed`,
      notInstalledTag: msg`ACP not installed`,
      installLabel: (environment) =>
        environment
          ? msg`Install Cursor Agent (ACP) in ${environment}`
          : msg`Install Cursor Agent (ACP)`,
      installCommand: (project) => cursorRuntimeInstallCommand("acp", project),
      detect: (status) => {
        const state = cursorRuntimeInstallState(status);
        return {
          installed: state.acpInstalled,
          ...(state.acpVersion ? { version: state.acpVersion } : {}),
        };
      },
    },
    {
      id: "sdk",
      badge: "SDK",
      installedTag: msg`SDK installed`,
      notInstalledTag: msg`SDK not installed`,
      installLabel: (environment) =>
        environment ? msg`Install Cursor SDK in ${environment}` : msg`Install Cursor SDK`,
      installCommand: (project) => cursorRuntimeInstallCommand("sdk", project),
      detect: (status) => {
        const state = cursorRuntimeInstallState(status);
        return {
          installed: state.sdkInstalled,
          ...(state.sdkVersion ? { version: state.sdkVersion } : {}),
          ...(state.sdkInstallationSource
            ? { installationSource: state.sdkInstallationSource }
            : {}),
        };
      },
      sourceLabel: cursorSdkSourceLabel,
      update: {
        actionLabel: (environment) =>
          environment ? msg`Update Cursor SDK in ${environment}` : msg`Update Cursor SDK`,
        buttonLabel: msg`Update SDK`,
        menuLabel: msg`Cursor SDK update targets`,
        updatedToast: (nextVersion) => msg`Cursor SDK updated to v${nextVersion}.`,
        upToDateToast: msg`Cursor SDK is up to date.`,
        canUpdate: canUpdateCursorSdk,
        command: cursorSdkUpdateCommand,
      },
    },
  ],
  bundle: {
    id: "both",
    installLabel: (environment) =>
      environment ? msg`Install ACP + SDK in ${environment}` : msg`Install ACP + SDK`,
    installCommand: (project) => cursorRuntimeInstallCommand("both", project),
  },
};
