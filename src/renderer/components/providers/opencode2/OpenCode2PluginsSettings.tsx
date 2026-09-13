import { useState } from "react";
import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentStatus } from "@/shared/contracts";
import { agentEnvForStatus, agentEnvKey } from "@/shared/machines";
import { Select } from "@/renderer/components/common/Select";
import { localEnvLabel } from "@/renderer/utils/machineLabels";
import { SettingRow } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";
import { OpenCode2PluginManager } from "./OpenCode2PluginManager";

export function OpenCode2PluginsSettings({
  agentKind,
  statuses,
}: {
  agentKind: string;
  statuses: readonly AgentStatus[];
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [selectedEnvironment, setSelectedEnvironment] = useState("native");
  const environments = new Map(
    statuses
      .filter((status) => status.installed)
      .map((status) => {
        const env = agentEnvForStatus(status);
        return [agentEnvKey(env), env];
      }),
  );
  const activeKey = environments.has(selectedEnvironment)
    ? selectedEnvironment
    : environments.keys().next().value;
  const env = activeKey ? environments.get(activeKey) : undefined;

  return (
    <div className="border-t border-border/10 pt-3">
      <SettingRow
        title={t`Plugins`}
        description={t`Install and manage native OpenCode plugins.`}
        className="py-1.5"
      >
        <Button
          size="sm"
          variant="tertiary"
          className="h-7 min-h-7 shrink-0 px-3 text-[11px]"
          onPress={() => setOpen(true)}
        >
          <Trans>Manage plugins</Trans>
        </Button>
      </SettingRow>
      <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className="sm:max-w-[680px]">
            <Modal.CloseTrigger aria-label={t`Close`} />
            <Modal.Header>
              <Modal.Heading>
                <Trans>OpenCode 2 plugins</Trans>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  <Trans>Changes apply globally to this environment.</Trans>
                </p>
                {environments.size > 1 ? (
                  <Select
                    aria-label={t`Environment`}
                    className="w-48"
                    value={activeKey ?? null}
                    onChange={setSelectedEnvironment}
                    options={[...environments].map(([id, environment]) => ({
                      id,
                      label: localEnvLabel(environment),
                    }))}
                  />
                ) : env ? (
                  <span className="text-xs text-muted">{localEnvLabel(env)}</span>
                ) : null}
              </div>
              {open && env ? (
                <OpenCode2PluginManager
                  key={`${agentKind}:${activeKey}`}
                  agentKind={agentKind}
                  env={env}
                />
              ) : open ? (
                <p className="text-sm text-muted">
                  <Trans>Install OpenCode 2 to manage its plugins.</Trans>
                </p>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              <Button size="sm" variant="tertiary" onPress={() => setOpen(false)}>
                <Trans>Done</Trans>
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
