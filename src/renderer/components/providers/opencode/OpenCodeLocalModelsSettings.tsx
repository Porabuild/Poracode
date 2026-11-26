import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { RotateCcw } from "lucide-react";
import type { AgentStatus } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { useAgentSettingsHost } from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { SettingRow } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";
import { isCloudOllamaModelTag } from "@/shared/agents/ollamaModelInventory";
import { OLLAMA_DOWNLOAD_URL } from "./ollama";

/** OpenCode exposes discovered Ollama models under the `ollama` provider id. */
const OLLAMA_MODEL_PREFIX = "ollama/";

function installedOllamaRoutes(statuses: readonly AgentStatus[]): string[] {
  const routes = new Set<string>();
  for (const status of statuses) {
    if (!status.installed) continue;
    for (const model of status.capabilities?.models ?? []) {
      if (!model.id.startsWith(OLLAMA_MODEL_PREFIX) || isCloudOllamaModelTag(model.id)) continue;
      routes.add(model.id);
    }
  }
  return [...routes];
}

/**
 * Ollama routes for the selected host's installed OpenCode environments. The
 * list is what OpenCode discovered from the host's configured Ollama endpoint;
 * it does not claim that a route is local when the endpoint is remote or only
 * a cloud tag. Model downloads stay in the user's terminal; this panel only
 * reports what the host already has.
 */
export function OpenCodeLocalModelsSettings({
  agentKind,
  statuses,
}: {
  agentKind: string;
  statuses: readonly AgentStatus[];
}) {
  const { t } = useLingui();
  const settingsHost = useAgentSettingsHost();
  const [refreshing, setRefreshing] = useState(false);
  const installed = statuses.some((status) => status.installed);
  const routes = installedOllamaRoutes(statuses);
  const canOperateHost = settingsHost.isOnline && settingsHost.canWrite;

  const refresh = async () => {
    if (!canOperateHost) return;
    setRefreshing(true);
    try {
      await settingsHost.rediscoverAgents(undefined, { agentKinds: [agentKind] });
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="border-t border-border/10 pt-3">
      <SettingRow
        title={t`Ollama models`}
        description={
          <Trans>
            Models OpenCode discovered from this host&apos;s configured Ollama endpoint.
          </Trans>
        }
        className="py-1.5"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant="tertiary"
            className="h-7 min-h-7 gap-1 px-3 text-[11px]"
            isDisabled={!canOperateHost || refreshing}
            isPending={refreshing}
            onPress={() => void refresh()}
          >
            {refreshing ? null : <RotateCcw className="size-3" />}
            <Trans>Refresh</Trans>
          </Button>
        </div>
      </SettingRow>

      {!installed ? (
        <p className="mt-2 text-[11px] text-muted">
          <Trans>Install OpenCode for this host to detect Ollama models.</Trans>
        </p>
      ) : routes.length === 0 ? (
        <ContentSurface variant="panel" className="mt-2 px-3 py-2.5">
          <p className="text-[11px] text-muted">
            <Trans>No Ollama models detected. Pull a model, then Refresh.</Trans>
          </p>
        </ContentSurface>
      ) : (
        <ContentSurface variant="group" className="mt-2 px-3">
          <p className="py-2 text-xs font-medium text-foreground">
            <Trans>Discovered routes</Trans>
          </p>
          <div className="divide-y divide-border/10">
            {routes.map((id) => (
              <p key={id} className="py-1.5 font-mono text-[11px] text-foreground/90">
                {id}
              </p>
            ))}
          </div>
        </ContentSurface>
      )}

      <div className="mt-2 space-y-1 text-[11px] text-muted">
        <p>
          <Trans>
            Install Ollama on this host from{" "}
            <a
              href={OLLAMA_DOWNLOAD_URL}
              className="text-accent underline decoration-accent/30 underline-offset-2"
              onClick={(event) => {
                event.preventDefault();
                openExternalWithFeedback(OLLAMA_DOWNLOAD_URL);
              }}
            >
              ollama.com/download
            </a>
            , then keep it running with <code>ollama serve</code>.
          </Trans>
        </p>
        <p>
          <Trans>
            Pull a model in a terminal with <code>ollama pull &lt;model&gt;</code>, then Refresh.
          </Trans>
        </p>
        <p>
          <Trans>Cloud-only tags are excluded from this list.</Trans>
        </p>
        <p>
          <Trans>Choose OpenCode, then the Ollama model for a Crew role.</Trans>
        </p>
      </div>
    </div>
  );
}
