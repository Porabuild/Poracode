import { useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Check } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { friendlyError } from "@/shared/messages";
import { Input, PixelLoader } from "@/renderer/components/common";
import { flushSharedSettings, useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { CursorRuntimeCardRow } from "./CursorRuntimeCard";
import { CursorProfileApiKeySetup } from "./CursorSdkRuntimeSetup";
import { isDuplicateProfileName } from "./profileIds";

/**
 * A Cursor profile's own identity: the name every surface labels it with, and
 * the API key each runtime spawns under. Lives outside
 * `CursorProviderSettings` so the runtime cards stay that file's single
 * concern. The instance id (and therefore the agent kind) is deliberately
 * immutable — threads reference it — so a rename only moves `displayName`.
 */
export function CursorProfileIdentity(props: {
  agentKind: string;
  profileInstanceId: string;
  /** Detected auth state for this profile's key, rendered on the key row. */
  authDescription: string;
  refreshStatus: () => Promise<unknown>;
}) {
  const { t } = useLingui();
  const instance = useSharedSettings((state) => state.agentInstances[props.profileInstanceId]);
  const agentInstances = useSharedSettings((state) => state.agentInstances);
  const setAgentInstance = useSharedSettings((state) => state.setAgentInstance);
  const savedName = instance?.displayName ?? props.profileInstanceId;
  const [name, setName] = useState(savedName);
  const [pending, setPending] = useState(false);

  // Re-seed when the settings page switches to a different profile, or when the
  // saved name changes out-of-band (another window, the MCP tool).
  useEffect(() => {
    setName(savedName);
  }, [savedName]);

  const trimmed = name.trim();
  const cursorInstances = Object.values(agentInstances).filter(
    (candidate) => candidate.driver === "cursor",
  );
  const isDuplicate = isDuplicateProfileName(trimmed, cursorInstances, props.profileInstanceId);
  const canSave = trimmed.length > 0 && trimmed !== savedName && !isDuplicate && !pending;

  const saveName = async () => {
    if (!canSave || !instance) return;
    setPending(true);
    const previous = instance;
    try {
      setAgentInstance({ ...instance, displayName: trimmed });
      // The adapter builds its label from `displayName`, so the sidebar and
      // model picker only pick the new name up after a detection refresh.
      await flushSharedSettings();
      await props.refreshStatus();
      toast.success(t`Cursor profile renamed.`);
    } catch (error) {
      setAgentInstance(previous);
      setName(previous.displayName ?? props.profileInstanceId);
      toast.danger(friendlyError(error));
    } finally {
      setPending(false);
    }
  };

  if (!instance) return null;

  return (
    <div className="mb-4">
      <p className="text-sm font-medium text-foreground">
        <Trans>Profile</Trans>
      </p>
      <p className="mb-2 text-xs text-muted">
        <Trans>
          This API key authenticates this profile's SDK chats and its usage card. It does not change
          the main Cursor CLI login.
        </Trans>
      </p>
      <div className="space-y-1.5">
        <CursorRuntimeCardRow
          label={t`Name`}
          description={
            isDuplicate ? (
              <span className="text-danger">
                <Trans>A Cursor profile with this name already exists.</Trans>
              </span>
            ) : (
              <Trans>Shown in the sidebar and the model picker.</Trans>
            )
          }
          stacked
        >
          <div className="flex items-center gap-1.5">
            <Input
              aria-label={t`Cursor profile name`}
              className="min-w-0 flex-1"
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void saveName();
              }}
            />
            <Button
              size="sm"
              variant="tertiary"
              isIconOnly
              aria-label={t`Save Cursor profile name`}
              isDisabled={!canSave}
              onPress={() => void saveName()}
            >
              {pending ? <PixelLoader size="xs" /> : <Check className="size-3.5" />}
            </Button>
          </div>
        </CursorRuntimeCardRow>
        <CursorProfileApiKeySetup
          agentKind={props.agentKind}
          profileInstanceId={props.profileInstanceId}
          authDescription={props.authDescription}
          refreshStatus={props.refreshStatus}
        />
      </div>
    </div>
  );
}
