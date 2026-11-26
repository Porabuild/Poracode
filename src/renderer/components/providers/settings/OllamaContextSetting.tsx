import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  isOllamaContextLength,
  isOllamaLoopbackEndpoint,
  isValidOllamaInstalledModelId,
  ollamaContextAlias,
  parseOllamaContextInput,
} from "@/shared/agents/ollamaContext";
import { MAX_CONTEXT_WINDOW_TOKENS, MIN_CONTEXT_WINDOW_TOKENS } from "@/shared/contextWindow";
import { friendlyError } from "@/shared/messages";
import { Input } from "@/renderer/components/common";
import {
  useAgentSettingsHost,
  rediscoverHostAgents,
} from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import {
  prepareOllamaContextModel,
  OllamaContextPreparationError,
} from "@/renderer/views/SettingsOverlay/parts/ollamaModelContext";

export interface OllamaContextSelection {
  /** Exact route persisted on the profile. */
  model: string;
  /** Original installed model when the route is a derived alias. */
  baseModel?: string;
  /** Exact Ollama window baked into the alias. */
  contextLength?: number;
}

/**
 * The shared Context length control for existing local Ollama profiles.
 * Providers own where the value lives; this component owns the selector,
 * selected-host shell lifecycle, and the all-or-nothing profile update.
 */
export function OllamaContextSetting(props: {
  instanceId: string;
  profileKind: string;
  endpoint: string;
  /** The provider's declared local Ollama endpoint shape. */
  declaredEndpoint: string;
  /** Original installed model (`baseModel` metadata when present). */
  baseModel: string;
  contextLength?: number | undefined;
  /** Persists the provider-owned config; must resolve only after the host saved it. */
  applyContext: (selection: OllamaContextSelection) => Promise<unknown>;
}) {
  const { t } = useLingui();
  const settingsHost = useAgentSettingsHost();
  const min = MIN_CONTEXT_WINDOW_TOKENS;
  const max = MAX_CONTEXT_WINDOW_TOKENS;
  const currentInput =
    props.contextLength !== undefined && isOllamaContextLength(props.contextLength)
      ? String(props.contextLength)
      : "";
  const syncKey = `${props.instanceId}\u0000${props.baseModel}\u0000${currentInput}`;
  const [draft, setDraft] = useState<{
    key: string;
    input: string;
    badInput: boolean;
  }>(() => ({ key: syncKey, input: currentInput, badInput: false }));
  const input = draft.key === syncKey ? draft.input : currentInput;
  const badInput = draft.key === syncKey ? draft.badInput : false;
  const setInput = (next: string, nextBadInput = false) =>
    setDraft({ key: syncKey, input: next, badInput: nextBadInput });
  const captureInput = (target: HTMLInputElement) =>
    setInput(target.value, target.validity.badInput);
  const parsed = parseOllamaContextInput(input, badInput);
  const invalid = parsed.kind === "invalid";
  const requested = parsed.kind === "valid" ? parsed.tokens : undefined;
  const requestingDefault = parsed.kind === "default";
  const [saving, setSaving] = useState(false);

  if (!isOllamaLoopbackEndpoint(props.endpoint, props.declaredEndpoint)) return null;

  const onlineWritable = settingsHost.isOnline && settingsHost.canWrite;
  const canOperateTerminal = settingsHost.canOperateTerminal ?? !settingsHost.isRemote;
  const canReadTerminal = settingsHost.canReadTerminal ?? !settingsHost.isRemote;
  const safeBaseModel = isValidOllamaInstalledModelId(props.baseModel);
  const canPrepare = onlineWritable && canOperateTerminal && canReadTerminal && safeBaseModel;
  const hasProject = settingsHost.machineProject !== undefined;
  const changed =
    !invalid &&
    (requested !== undefined
      ? requested !== props.contextLength
      : requestingDefault && props.contextLength !== undefined);
  const canApply =
    !saving &&
    onlineWritable &&
    safeBaseModel &&
    !invalid &&
    changed &&
    (requestingDefault || (canPrepare && hasProject));
  const unavailableReason = !settingsHost.isOnline
    ? t`The selected host is offline.`
    : !settingsHost.canWrite
      ? t`This connection is read-only.`
      : !safeBaseModel
        ? t`Enter a safe installed Ollama model id.`
        : requested !== undefined && (!canOperateTerminal || !canReadTerminal)
          ? t`Changing context needs terminal access on the selected host. Server default can still be restored.`
          : requested !== undefined && !hasProject
            ? t`No host location is available for this machine.`
            : undefined;

  const apply = async () => {
    if (!canApply) return;
    setSaving(true);
    try {
      if (requestingDefault) {
        await props.applyContext({ model: props.baseModel });
      } else if (requested !== undefined) {
        if (!settingsHost.machineProject) {
          throw new OllamaContextPreparationError(
            "terminal-unavailable",
            props.baseModel,
            requested,
          );
        }
        const alias = ollamaContextAlias(props.baseModel, requested);
        const prepared = await prepareOllamaContextModel({
          project: settingsHost.machineProject,
          baseModel: props.baseModel,
          alias,
          contextLength: requested,
          ...(settingsHost.connectionKey ? { remoteServerId: settingsHost.connectionKey } : {}),
        });
        await props.applyContext({
          model: prepared,
          baseModel: props.baseModel,
          contextLength: requested,
        });
      } else {
        return;
      }
      toast.success(t`Context length updated. It applies to new sessions.`);
      void rediscoverHostAgents(settingsHost, props.profileKind).catch(() => undefined);
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5 border-t border-border/10 pt-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium text-muted">
            <Trans>Context length</Trans>
          </span>
          <Input
            aria-label={t`Context length`}
            aria-invalid={invalid}
            className="font-mono text-xs"
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            placeholder={t`Server default`}
            value={input}
            disabled={saving || !onlineWritable}
            onChange={(event) => captureInput(event.currentTarget)}
            onInput={(event) => captureInput(event.currentTarget)}
          />
          {invalid ? (
            <p role="alert" className="text-[11px] text-danger">
              {t`Enter a whole number from ${min} to ${max}.`}
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="tertiary"
          className="h-7 min-h-7 px-3 text-[11px]"
          isDisabled={!canApply}
          isPending={saving}
          onPress={() => void apply()}
        >
          <Trans>Apply</Trans>
        </Button>
      </div>
      <p className="text-[11px] text-muted">
        {unavailableReason ??
          t`Larger windows reserve more memory. Changes apply to new sessions; a running session keeps the context it started with.`}
      </p>
    </div>
  );
}
