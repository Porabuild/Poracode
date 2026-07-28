import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { Input, Select } from "@/renderer/components/common";
import { flushSharedSettings, useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { AgentCapability, AgentStatus } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { SettingRow } from "./SettingsForm";
import { cursorRuntimeInstallState } from "./cursorRuntimeInstall";

type CursorStructuredRuntime = "acp" | "sdk";

interface CursorRuntimeSettings {
  structuredRuntime: CursorStructuredRuntime;
  sdkPackagePath: string;
}

function readCursorRuntimeSettings(
  settings: Record<string, boolean | string> | undefined,
): CursorRuntimeSettings {
  return {
    structuredRuntime: settings?.structuredRuntime === "sdk" ? "sdk" : "acp",
    sdkPackagePath:
      typeof settings?.sdkPackagePath === "string" ? settings.sdkPackagePath.trim() : "",
  };
}

/**
 * Cursor's GUI runtime is provider-global, but changes only affect sessions
 * created after Save. Existing sessions keep their runtime-specific resume id,
 * so this panel deliberately re-probes detection without hot-reloading them.
 */
export function CursorProviderSettings(props: {
  agentKind: string;
  statuses?: readonly AgentStatus[];
  wslDistros: string[];
}) {
  const { t } = useLingui();
  const { agentKind, statuses, wslDistros } = props;
  const savedSettings = readCursorRuntimeSettings(
    useSharedSettings((state) => state.agentSettings[agentKind]),
  );
  const setAgentSetting = useSharedSettings((state) => state.setAgentSetting);
  const [baseline, setBaseline] = useState(savedSettings);
  const [structuredRuntime, setStructuredRuntime] = useState<CursorStructuredRuntime>(
    savedSettings.structuredRuntime,
  );
  const [sdkPackagePath, setSdkPackagePath] = useState(savedSettings.sdkPackagePath);
  const [saving, setSaving] = useState(false);

  const normalizedPackagePath = sdkPackagePath.trim();
  const dirty =
    structuredRuntime !== baseline.structuredRuntime ||
    normalizedPackagePath !== baseline.sdkPackagePath;
  const runtimeOptions = [
    { id: "acp", label: t`ACP` },
    { id: "sdk", label: t`SDK` },
  ];
  const firstStatus = statuses?.[0];
  const installState = cursorRuntimeInstallState(firstStatus);
  const runtimeCards: Array<{
    id: CursorStructuredRuntime;
    label: string;
    installed: boolean;
    authState: AgentStatus["authState"];
    capabilities: AgentCapability | undefined;
  }> = [
    {
      id: "acp",
      label: t`ACP`,
      installed: installState.acpInstalled,
      authState:
        firstStatus?.runtimeVariants?.acp?.authState ?? firstStatus?.authState ?? "unknown",
      capabilities: firstStatus?.runtimeVariants?.acp?.capabilities,
    },
    {
      id: "sdk",
      label: t`SDK`,
      installed: installState.sdkInstalled,
      authState: firstStatus?.runtimeVariants?.sdk?.authState ?? "unknown",
      capabilities: firstStatus?.runtimeVariants?.sdk?.capabilities,
    },
  ];

  const save = async () => {
    if (!dirty || saving) return;

    setSaving(true);
    try {
      if (structuredRuntime !== baseline.structuredRuntime) {
        setAgentSetting(agentKind, "structuredRuntime", structuredRuntime);
      }
      if (normalizedPackagePath !== baseline.sdkPackagePath) {
        setAgentSetting(agentKind, "sdkPackagePath", normalizedPackagePath);
      }

      // Detection reads the supervisor-owned settings file. The store setter
      // persists asynchronously, so flush before asking detection to re-read it.
      await flushSharedSettings();
      await readBridge().refreshAgentStatuses(wslDistros, { agentKinds: [agentKind] });

      const nextBaseline = {
        structuredRuntime,
        sdkPackagePath: normalizedPackagePath,
      };
      setSdkPackagePath(normalizedPackagePath);
      setBaseline(nextBaseline);
      toast.success(t`Cursor GUI runtime updated.`);
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-border/10 pt-3">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <Trans>GUI runtime</Trans>
          </p>
          <p className="text-xs text-muted">
            <Trans>
              Install ACP, SDK, or both, then choose which runtime starts new Cursor GUI chats.
              Existing chats stay pinned to the runtime that created them.
            </Trans>
          </p>
        </div>
        <Button
          size="sm"
          variant="primary"
          className="h-7 min-h-7 shrink-0 px-3 text-[11px]"
          aria-label={t`Save Cursor GUI runtime`}
          isDisabled={!dirty || saving}
          isPending={saving}
          onPress={() => void save()}
        >
          <Trans>Save</Trans>
        </Button>
      </div>

      <div className="space-y-0.5">
        <div className="grid gap-2 py-1.5 sm:grid-cols-2">
          {runtimeCards.map((runtime) => {
            const controls = [
              runtime.capabilities?.modelContextSizes &&
              Object.keys(runtime.capabilities.modelContextSizes).length > 0
                ? t`Context`
                : undefined,
              runtime.capabilities?.efforts.length ? t`Reasoning` : undefined,
              runtime.capabilities?.fastModels?.length ? t`Fast` : undefined,
              runtime.capabilities?.thinkingModels?.length ? t`Thinking` : undefined,
            ].filter((value): value is string => value !== undefined);
            const modes = runtime.capabilities?.modes.map((mode) =>
              mode === "agent" ? t`Work` : mode === "plan" ? t`Plan` : t`Autopilot`,
            );
            return (
              <div
                key={runtime.id}
                className={`rounded-lg border px-3 py-2 ${
                  structuredRuntime === runtime.id
                    ? "border-accent/50 bg-accent/5"
                    : "border-border/40 bg-surface-secondary/35"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{runtime.label}</span>
                  <span className="text-[10px] font-medium text-muted">
                    {structuredRuntime === runtime.id ? t`Default` : null}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {runtime.installed ? t`Installed` : t`Not installed`}
                  {runtime.installed && runtime.authState === "missing"
                    ? runtime.id === "sdk"
                      ? ` · ${t`API key required`}`
                      : ` · ${t`Sign in required`}`
                    : null}
                </p>
                {runtime.capabilities ? (
                  <>
                    <p className="mt-1 text-[11px] text-muted">
                      {t`${runtime.capabilities.models.length} models`}
                      {modes?.length ? ` · ${t`Modes`}: ${modes.join(", ")}` : null}
                    </p>
                    {controls.length ? (
                      <p className="mt-1 text-[11px] text-muted">
                        {t`Model controls`}: {controls.join(", ")}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>

        <SettingRow
          title={t`Structured runtime`}
          description={
            <Trans>
              ACP uses the Cursor Agent login. SDK uses @cursor/sdk with CURSOR_API_KEY.
            </Trans>
          }
          className="py-1.5"
        >
          <Select
            aria-label={t`Structured runtime`}
            className="w-[210px] shrink-0"
            isDisabled={saving}
            options={runtimeOptions}
            value={structuredRuntime}
            onChange={(value) => setStructuredRuntime(value === "sdk" ? "sdk" : "acp")}
          />
        </SettingRow>

        {structuredRuntime === "sdk" ? (
          <>
            <p className="py-1.5 text-xs text-muted">
              <Trans>
                SDK mode requires a separately installed @cursor/sdk package and CURSOR_API_KEY. It
                does not use the Cursor Agent CLI login.
              </Trans>
            </p>
            <SettingRow
              title={t`SDK package path (optional)`}
              description={
                <Trans>
                  Enter an absolute @cursor/sdk package path, or leave this blank for automatic
                  discovery.
                </Trans>
              }
              className="py-1.5"
            >
              <Input
                aria-label={t`SDK package path`}
                className="w-[260px] shrink-0 font-mono text-xs"
                placeholder={t`/path/to/node_modules/@cursor/sdk`}
                value={sdkPackagePath}
                disabled={saving}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => setSdkPackagePath(event.currentTarget.value)}
              />
            </SettingRow>
          </>
        ) : null}
      </div>
    </div>
  );
}
