import { useEffect, useState, type RefObject } from "react";
import { toast } from "@heroui/react";
import { Download, Webhook, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type {
  AgentHookPluginStatus,
  AgentStatus,
  Project,
  PromptSegment,
  ThreadConfig,
  ThreadPresentationMode,
  TurnClientContext,
} from "@/shared/contracts";
import { hookEnvForProject, hookEnvKey } from "@/shared/agentHookPluginEnv";
import type { ThreadWorktreeDraftFields } from "@/shared/threadWorktreeLaunch";
import { readBridge } from "@/renderer/bridge";
import { hasAnyClientBridge } from "@/renderer/clientRuntime";
import { Button } from "@/renderer/components/common/Button";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import {
  ComposerAddMenu,
  type ComposerCustomMcpItem,
  type ComposerMcpMenuItem,
} from "@/renderer/components/composer/ComposerAddMenu";
import { ComposerVoiceInput } from "@/renderer/components/composer/ComposerVoiceInput";
import type { MentionInputHandle } from "@/renderer/components/composer/MentionInput";
import type { VoiceInputHandle } from "@/renderer/components/composer/VoiceInputButton";
import { openMcpServersSettings } from "@/renderer/actions/panelActions";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ThreadDockHeader, ThreadDockIconButton, ThreadDockSection } from "./ThreadDockUI";
import type { ComposerControl } from "./ThreadComposer";

export type DraftStartOutcome = "accepted" | "cancelled";
export type DraftStartResult = DraftStartOutcome | void;
export type DraftStartInput = ThreadWorktreeDraftFields & {
  threadId?: string | undefined;
  clientSubmissionId?: string | undefined;
  agentKind: AgentStatus["kind"];
  config: ThreadConfig;
  prompt: string;
  segments?: PromptSegment[] | undefined;
  presentationMode?: ThreadPresentationMode | undefined;
  clientContext?: TurnClientContext | undefined;
};

export function HookInstallProposal(props: {
  project: Project;
  selectedAgent: AgentStatus;
  presentationMode: ThreadPresentationMode;
}) {
  const { t } = useLingui();
  const env = hookEnvForProject(props.project);
  const envKey = hookEnvKey(env);
  const agentKind = props.selectedAgent.kind;
  const proposalKey = `${agentKind}:${envKey}`;
  const dismissed = useSharedSettings((s) => s.dismissedHookInstallProposals[proposalKey] === true);
  const dismissHookInstallProposal = useSharedSettings((s) => s.dismissHookInstallProposal);
  const [status, setStatus] = useState<AgentHookPluginStatus | undefined>(undefined);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (props.presentationMode !== "terminal" || dismissed || !hasAnyClientBridge()) {
      setStatus(undefined);
      return;
    }
    const requestEnv = env;
    let cancelled = false;
    readBridge()
      .getAgentHookPluginStatuses({ agentKind, envs: [requestEnv] })
      .then((statuses) => {
        if (!cancelled) setStatus(statuses[0]);
      })
      .catch(() => {
        if (!cancelled) setStatus(undefined);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissed, props.presentationMode, agentKind, envKey]);

  if (
    dismissed ||
    props.presentationMode !== "terminal" ||
    !status ||
    !status.supported ||
    status.installed
  ) {
    return null;
  }

  const install = () => {
    setPending(true);
    readBridge()
      .installAgentHookPlugin({ agentKind: props.selectedAgent.kind, env })
      .then((result) => {
        setStatus(result.status);
        toast.success(t`${props.selectedAgent.label} hooks installed.`);
      })
      .catch((error) =>
        toast.danger(
          error instanceof Error
            ? error.message
            : t`Unable to install ${props.selectedAgent.label} hooks.`,
        ),
      )
      .finally(() => setPending(false));
  };

  return (
    <ThreadDockSection placement="composer" collapsed={false} ariaLabel={t`Install CLI hooks`}>
      <ThreadDockHeader
        icon={Webhook}
        iconClassName="text-foreground"
        title={t`Install CLI hooks`}
        actions={
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-w-0 px-2 text-xs text-foreground"
              isDisabled={pending}
              isPending={pending}
              onPress={install}
            >
              {pending ? <PixelLoader size="xs" /> : <Download className="size-3.5" />}
              <Trans>Install</Trans>
            </Button>
            <ThreadDockIconButton
              label={t`Don't show hook install proposal`}
              tooltip={t`Dismiss`}
              danger
              onPress={() => dismissHookInstallProposal(proposalKey)}
            >
              <X className="size-3.5" />
            </ThreadDockIconButton>
          </div>
        }
      >
        <span className="min-w-0 flex-1 truncate leading-5 text-[color:var(--muted)]">
          <Trans>Better status updates while agents run.</Trans>
        </span>
      </ThreadDockHeader>
    </ThreadDockSection>
  );
}

export function DraftComposerAfterControls(props: {
  planControl?: Extract<ComposerControl, { kind: "toggle" }> | undefined;
  mcpServers: readonly ComposerMcpMenuItem[];
  customMcpServers: readonly ComposerCustomMcpItem[];
  pluginLabels: Readonly<Record<string, string>>;
  onPickFiles: () => void;
  showVoiceInputButton: boolean;
  isDisabled: boolean;
  readOnlyMcp?: boolean;
  experiment?: {
    enabled: boolean;
    disabled: boolean;
    onToggle: (next: boolean) => void;
  };
  mentionRef: RefObject<MentionInputHandle | null>;
  voiceInputRef: RefObject<VoiceInputHandle | null>;
  computerUse: {
    enabled: boolean;
    visible: boolean;
    onToggle: (next: boolean) => void;
  };
}) {
  return (
    <>
      <ComposerAddMenu
        planControl={props.planControl}
        mcpServers={props.mcpServers}
        customMcpServers={props.customMcpServers}
        onManageMcpServers={openMcpServersSettings}
        pluginLabels={props.pluginLabels}
        {...(props.readOnlyMcp
          ? {
              readOnly: true,
              readOnlyCaption: <Trans>Change servers in provider settings</Trans>,
            }
          : {})}
        showFileOption
        onPickFiles={props.onPickFiles}
        computerUse={props.computerUse}
        {...(props.experiment ? { experiment: props.experiment } : {})}
      />
      <ComposerVoiceInput
        show={props.showVoiceInputButton}
        isDisabled={props.isDisabled}
        mentionRef={props.mentionRef}
        voiceInputRef={props.voiceInputRef}
      />
    </>
  );
}
