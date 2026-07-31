export * from "./CursorIcon";

import { msg } from "@lingui/core/macro";
import { CursorIcon } from "./CursorIcon";
import providerManifest from "./manifest";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import {
  CURSOR_SDK_MAX_EXCLUSIVE_MAJOR,
  CURSOR_SDK_MIN_SUPPORTED_VERSION,
  CURSOR_SDK_PACKAGE_NAME,
} from "@/shared/agents/cursorSdkPackage";
import { resolveUnrestrictedPermissionConfig } from "@/shared/agents/unrestrictedPermissions";
import { cursorRuntimeInstallState, cursorSdkUpdateCommand } from "./runtimeInstall";
import { fullAccessToggle, planWorkToggle } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls, registerComposerRuntimeUpdate } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;

registerProviderIcon(PROVIDER_KIND, CursorIcon);
registerComposerRuntimeUpdate(PROVIDER_KIND, ({ agentStatus, project }) => {
  const runtimeLabel = agentStatus.capabilities.runtimeLabel;
  if (runtimeLabel !== "SDK") return undefined;
  const sdk = cursorRuntimeInstallState(agentStatus);
  const command = cursorSdkUpdateCommand(agentStatus, project);
  return {
    label: `${agentStatus.label} ${runtimeLabel}`,
    installed: sdk.sdkInstalled,
    ...(sdk.sdkVersion ? { installedVersion: sdk.sdkVersion } : {}),
    ...(command
      ? {
          command,
          npmPackage: {
            name: CURSOR_SDK_PACKAGE_NAME,
            minVersion: CURSOR_SDK_MIN_SUPPORTED_VERSION,
            maxExclusiveMajor: CURSOR_SDK_MAX_EXCLUSIVE_MAJOR,
          },
        }
      : {}),
  };
});
// `composer-2.5-fast` is Cursor's own default — the cheaper "fast" request tier,
// as quick as plain composer-2.5 at equivalent quality on these utility tasks.
// Cursor's other models are pricier GPT/Claude pass-throughs, so stay on Composer.
registerCommitGenDefaults(PROVIDER_KIND, {
  label: "Cursor",
  hint: "Composer 2.5 Fast",
  model: "composer-2.5-fast",
  effort: "",
});
registerTitleGenDefaults(PROVIDER_KIND, {
  label: "Cursor",
  hint: "Composer 2.5 Fast",
  model: "composer-2.5-fast",
  effort: "",
});
registerConflictResolverDefaults(PROVIDER_KIND, {
  label: "Cursor",
  hint: "Composer 2.5 Fast",
  model: "composer-2.5-fast",
  effort: "",
});

registerComposerControls(PROVIDER_KIND, ({ capabilities, config, isDisabled, onConfigChange }) => {
  const hasPlanMode = capabilities.modes.includes("plan");
  const isPlanMode = config.mode === "plan";
  const unrestricted = resolveUnrestrictedPermissionConfig(capabilities);
  const isFullAccess =
    (unrestricted.approvalPolicy === undefined ||
      config.approvalPolicy === unrestricted.approvalPolicy) &&
    (unrestricted.sandboxMode === undefined || config.sandboxMode === unrestricted.sandboxMode);

  const controls: ComposerControl[] = [
    ...(hasPlanMode
      ? [
          planWorkToggle({
            isPlanMode,
            isDisabled,
            onChange: (isSelected) => onConfigChange({ mode: isSelected ? "plan" : "agent" }),
          }),
        ]
      : []),
    ...(capabilities.approvalPolicies.length > 0
      ? [
          fullAccessToggle({
            isFullAccess,
            isDisabled,
            restrictedLabel: "Auto-review",
            restrictedDisplayLabel: msg`Auto-review`,
            onChange: (isSelected) => {
              if (isSelected) {
                onConfigChange(unrestricted);
                return;
              }
              onConfigChange({
                approvalPolicy: "default",
                ...(capabilities.sandboxModes.length > 0
                  ? {
                      sandboxMode:
                        capabilities.sandboxModes.find(({ id }) => id !== unrestricted.sandboxMode)
                          ?.id ??
                        capabilities.sandboxModes[0]?.id ??
                        "workspace-write",
                    }
                  : {}),
              });
            },
          }),
        ]
      : []),
  ];

  return controls;
});
