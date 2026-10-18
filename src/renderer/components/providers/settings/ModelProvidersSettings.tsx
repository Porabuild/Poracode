import { useState, type ReactNode } from "react";
import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentStatus } from "@/shared/contracts";
import { agentEnvForStatus, agentEnvKey } from "@/shared/machines";
import { Select } from "@/renderer/components/common/Select";
import { localEnvLabel } from "@/renderer/utils/machineLabels";
import { SettingRow } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";
import { ModelProviderManager } from "./ModelProviderManager";

/** Shared presentation; each agent adapter owns its native config and credentials. */
export function ModelProvidersSettings({
  agentKind,
  statuses,
  description,
  onChanged,
}: {
  agentKind: string;
  statuses: readonly AgentStatus[];
  description: ReactNode;
  onChanged: () => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("native");
  const environments = new Map(
    statuses
      .filter((status) => status.installed)
      .map((status) => {
        const env = agentEnvForStatus(status);
        return [agentEnvKey(env), env];
      }),
  );
  const activeKey = environments.has(selected) ? selected : environments.keys().next().value;
  const env = activeKey ? environments.get(activeKey) : undefined;
  return (
    <div className="border-t border-border/10 pt-3">
      <SettingRow title={t`AI providers`} description={description} className="py-1.5">
        <Button size="sm" variant="secondary" isDisabled={!env} onPress={() => setOpen(true)}>
          <Trans>Manage providers</Trans>
        </Button>
      </SettingRow>
      <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className="sm:max-w-[680px]">
            <Modal.CloseTrigger aria-label={t`Close`} />
            <Modal.Header>
              <Modal.Heading>
                <Trans>AI providers</Trans>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="space-y-4 p-4">
              {description}
              {environments.size > 1 ? (
                <Select
                  aria-label={t`Environment`}
                  value={activeKey ?? null}
                  onChange={setSelected}
                  options={[...environments].map(([id, environment]) => ({
                    id,
                    label: localEnvLabel(environment),
                  }))}
                />
              ) : env ? (
                <p className="text-xs text-muted">{localEnvLabel(env)}</p>
              ) : null}
              {open && env ? (
                <ModelProviderManager
                  key={`${agentKind}:${activeKey}`}
                  agentKind={agentKind}
                  env={env}
                  onChanged={onChanged}
                />
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
