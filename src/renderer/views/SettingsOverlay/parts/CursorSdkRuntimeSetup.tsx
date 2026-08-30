import { useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Download, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { runAgentInstallCommand } from "@/renderer/actions/agentLoginActions";
import { readBridge } from "@/renderer/bridge";
import { Input, PixelLoader } from "@/renderer/components/common";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { findProjectForStatus } from "@/renderer/utils/acpRegistryAuth";
import {
  CURSOR_SDK_MAX_EXCLUSIVE_MAJOR,
  CURSOR_SDK_MIN_SUPPORTED_VERSION,
  CURSOR_SDK_PACKAGE_NAME,
} from "@/shared/agents/cursorSdkPackage";
import { isNewerVersion } from "@/shared/agents/updateResolver";
import type { AgentStatus } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import {
  canUpdateCursorSdk,
  cursorRuntimeInstallState,
  cursorSdkInstallCommand,
  cursorSdkUpdateCommand,
} from "./cursorRuntimeInstall";
import { CursorRuntimeCardRow } from "./CursorRuntimeCard";
import { SAVED_CREDENTIAL_MASK } from "./secretMask";

/**
 * Everything the Cursor SDK runtime needs to become usable: its own npm
 * package and its own API key. Both live in the SDK card so they are never
 * confused with the Cursor CLI install and sign-in the ACP runtime uses.
 */
export function CursorSdkRuntimeSetup(props: {
  agentKind: string;
  profileInstanceId?: string;
  status: AgentStatus | undefined;
  authDescription: string;
  refreshStatus: () => Promise<unknown>;
  refreshPackageStatus: () => Promise<unknown>;
  /** Runs after the key is dropped, so the selected runtime can fall back. */
  onApiKeyCleared: () => Promise<void> | void;
}) {
  return (
    <>
      <SdkPackageRow
        agentKind={props.agentKind}
        status={props.status}
        refreshStatus={props.refreshPackageStatus}
      />
      {props.profileInstanceId ? null : (
        <SdkApiKeyRow
          agentKind={props.agentKind}
          isInstalled={cursorRuntimeInstallState(props.status).sdkInstalled}
          authDescription={props.authDescription}
          refreshStatus={props.refreshStatus}
          onApiKeyCleared={props.onApiKeyCleared}
        />
      )}
    </>
  );
}

export function CursorProfileApiKeySetup(props: {
  agentKind: string;
  profileInstanceId: string;
  authDescription: string;
  refreshStatus: () => Promise<unknown>;
}) {
  return (
    <SdkApiKeyRow
      agentKind={props.agentKind}
      profileInstanceId={props.profileInstanceId}
      isInstalled
      authDescription={props.authDescription}
      refreshStatus={props.refreshStatus}
      onApiKeyCleared={() => undefined}
    />
  );
}

function SdkPackageRow(props: {
  agentKind: string;
  status: AgentStatus | undefined;
  refreshStatus: () => Promise<unknown>;
}) {
  const { t } = useLingui();
  const projects = useAppStore((state) => state.projects);
  const [pending, setPending] = useState(false);
  const [latestSupportedVersion, setLatestSupportedVersion] = useState<string | undefined>(
    undefined,
  );
  const { status } = props;
  const installState = cursorRuntimeInstallState(status);
  const project = findProjectForStatus(status, projects);

  // The install source only says the package *can* be updated in place. Probe
  // npm for the newest release inside the supported range so the button appears
  // solely when there is something newer to install — same rule the Cursor CLI
  // row uses. Offline / probe failure leaves it hidden.
  useEffect(() => {
    let cancelled = false;
    const agentKind = props.agentKind;
    readBridge()
      .getLatestAgentVersion({
        agentKind,
        npmPackage: {
          name: CURSOR_SDK_PACKAGE_NAME,
          minVersion: CURSOR_SDK_MIN_SUPPORTED_VERSION,
          maxExclusiveMajor: CURSOR_SDK_MAX_EXCLUSIVE_MAJOR,
        },
      })
      .then((result) => {
        if (!cancelled) setLatestSupportedVersion(result.version);
      })
      .catch((error) => {
        console.warn(
          `[CursorSdkRuntimeSetup] getLatestAgentVersion(${CURSOR_SDK_PACKAGE_NAME}) failed:`,
          error instanceof Error ? error.message : error,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [props.agentKind]);

  const hasNewerSupportedVersion =
    latestSupportedVersion !== undefined &&
    installState.sdkVersion !== undefined &&
    isNewerVersion(latestSupportedVersion, installState.sdkVersion);
  const canUpdate = status ? canUpdateCursorSdk(status) && hasNewerSupportedVersion : false;

  const runPackageCommand = (purpose: "install" | "update") => {
    if (pending || (purpose === "update" && (!status || !canUpdate))) return;
    setPending(true);
    const opened = runAgentInstallCommand({
      label: purpose === "update" ? t`Update Cursor SDK` : t`Install Cursor SDK`,
      command:
        purpose === "update" && status
          ? (targetProject) => cursorSdkUpdateCommand(status, targetProject) ?? ""
          : cursorSdkInstallCommand,
      ...(purpose === "update" ? { purpose } : {}),
      ...(project ? { project } : {}),
      onCommandComplete: (exitCode) => {
        if (exitCode !== 0) {
          setPending(false);
          return;
        }
        void props
          .refreshStatus()
          .catch((error) => toast.danger(friendlyError(error)))
          .finally(() => setPending(false));
      },
    });
    if (!opened) setPending(false);
  };

  return (
    <CursorRuntimeCardRow
      label={t`Package`}
      description={
        installState.sdkInstalled ? (
          <>
            {"@cursor/sdk"}
            {installState.sdkVersion ? ` · v${installState.sdkVersion}` : null}
          </>
        ) : (
          <Trans>@cursor/sdk is not installed.</Trans>
        )
      }
    >
      {!installState.sdkInstalled ? (
        <Button
          size="sm"
          variant="tertiary"
          className="h-7 min-h-7 shrink-0 gap-1 px-2 text-[11px]"
          aria-label={t`Install Cursor SDK`}
          isPending={pending}
          onPress={() => runPackageCommand("install")}
        >
          <Download className="size-3" />
          <Trans>Install</Trans>
        </Button>
      ) : canUpdate ? (
        <Button
          size="sm"
          variant="tertiary"
          className="h-7 min-h-7 shrink-0 gap-1 px-2 text-[11px]"
          aria-label={t`Update Cursor SDK`}
          isPending={pending}
          onPress={() => runPackageCommand("update")}
        >
          <RefreshCw className="size-3" />
          <Trans>Update</Trans>
        </Button>
      ) : null}
    </CursorRuntimeCardRow>
  );
}

function SdkApiKeyRow(props: {
  agentKind: string;
  profileInstanceId?: string;
  isInstalled: boolean;
  authDescription: string;
  refreshStatus: () => Promise<unknown>;
  onApiKeyCleared: () => Promise<void> | void;
}) {
  const { t } = useLingui();
  const savedAgentSettings = useSharedSettings((state) => state.agentSettings[props.agentKind]);
  const profileInstance = useSharedSettings((state) =>
    props.profileInstanceId ? state.agentInstances[props.profileInstanceId] : undefined,
  );
  const setAgentSecretSetting = useSharedSettings((state) => state.setAgentSecretSetting);
  const setAgentInstance = useSharedSettings((state) => state.setAgentInstance);
  const [apiKey, setApiKey] = useState("");
  // A stored key is shown as a mask, matching the ACP credential fields. Typing
  // starts a replacement; the mask returns when the field is left empty.
  const [isEditing, setIsEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const hasSavedApiKey = props.profileInstanceId
    ? typeof profileInstance?.environment?.CURSOR_API_KEY?.value === "string" &&
      profileInstance.environment.CURSOR_API_KEY.value.length > 0
    : typeof savedAgentSettings?.sdkApiKey === "string" && savedAgentSettings.sdkApiKey.length > 0;
  const canEditApiKey = props.profileInstanceId !== undefined || props.isInstalled;
  const isMasked = hasSavedApiKey && !isEditing;

  const saveApiKey = async () => {
    const value = apiKey.trim();
    if (!value || pending) return;
    setPending(true);
    try {
      if (props.profileInstanceId) {
        // Sealed in the main process; the same path Claude profiles use.
        const instance = await readBridge().setProfileEnvironment({
          instanceId: props.profileInstanceId,
          environment: { CURSOR_API_KEY: { value, sensitive: true } },
        });
        setAgentInstance(instance);
      } else {
        await setAgentSecretSetting(props.agentKind, "sdkApiKey", value);
      }
      setApiKey("");
      setIsEditing(false);
      toast.success(
        props.profileInstanceId ? t`Cursor profile API key saved.` : t`Cursor SDK API key saved.`,
      );
    } catch (error) {
      toast.danger(friendlyError(error));
      setPending(false);
      return;
    }
    try {
      await props.refreshStatus();
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setPending(false);
    }
  };

  const clearApiKey = async () => {
    if (!hasSavedApiKey || pending) return;
    setPending(true);
    try {
      await setAgentSecretSetting(props.agentKind, "sdkApiKey", "");
      setApiKey("");
      setIsEditing(false);
      await props.onApiKeyCleared();
      await props.refreshStatus();
      toast.success(t`Cursor SDK API key removed.`);
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <CursorRuntimeCardRow
      label={t`API key`}
      description={
        // A profile's row shows its detected auth state: "Separate API key"
        // repeated the section heading and never said whether the key works.
        props.profileInstanceId || props.isInstalled
          ? props.authDescription
          : t`Install the package to add its API key.`
      }
      stacked
    >
      <div className="flex items-center gap-1.5">
        <Input
          type="password"
          aria-label={props.profileInstanceId ? t`Cursor profile API key` : t`Cursor SDK API key`}
          className="min-w-0 flex-1 font-mono text-xs"
          placeholder={isMasked ? "" : t`Paste Cursor API key`}
          value={isMasked ? SAVED_CREDENTIAL_MASK : apiKey}
          disabled={!canEditApiKey || pending}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onFocus={() => {
            if (isMasked) {
              setIsEditing(true);
              setApiKey("");
            }
          }}
          onBlur={() => {
            if (isEditing && apiKey.length === 0) setIsEditing(false);
          }}
          onChange={(event) => setApiKey(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Enter saves, matching the other credential fields in Settings.
            if (event.key !== "Enter") return;
            event.preventDefault();
            void saveApiKey();
          }}
        />
        <Button
          size="sm"
          variant="tertiary"
          isIconOnly
          aria-label={
            props.profileInstanceId ? t`Save Cursor profile API key` : t`Save Cursor SDK API key`
          }
          isDisabled={!canEditApiKey || !apiKey.trim() || pending}
          onPress={() => void saveApiKey()}
        >
          {pending ? <PixelLoader size="xs" /> : <KeyRound className="size-3.5" />}
        </Button>
        {hasSavedApiKey && !props.profileInstanceId ? (
          <Button
            size="sm"
            variant="tertiary"
            isIconOnly
            aria-label={t`Remove Cursor SDK API key`}
            isDisabled={pending}
            onPress={() => void clearApiKey()}
          >
            {pending ? <PixelLoader size="xs" /> : <Trash2 className="size-3.5 text-danger" />}
          </Button>
        ) : null}
      </div>
    </CursorRuntimeCardRow>
  );
}
