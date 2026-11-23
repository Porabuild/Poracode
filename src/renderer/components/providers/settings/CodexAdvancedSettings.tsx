import { useEffect, useState } from "react";
import { Button, Disclosure, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { RotateCcw } from "lucide-react";
import type { AgentStatus } from "@/shared/contracts";
import { Input } from "@/renderer/components/common";
import { Select, type SelectOption } from "@/renderer/components/common/Select";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { SettingRow } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";
import {
  CODEX_AGENT_SETTING_KEYS,
  CODEX_MAX_SUBAGENTS_LIMIT,
  CODEX_MAX_SUBAGENTS_SETTING_KEY,
  CODEX_PARENT_EFFORT_HINT_KEY,
  CODEX_PARENT_MODEL_HINT_KEY,
  CODEX_PLAN_MODE_EFFORT_SETTING_KEY,
  CODEX_SUBAGENT_EFFORT_SETTING_KEY,
  CODEX_SUBAGENT_MODEL_SETTING_KEY,
  codexVersionSupportsAgentsConfig,
  parseMaxSubagents,
} from "@/shared/agents/codexAgentSettings";
import { friendlyError } from "@/shared/messages";
import {
  useAgentSettingsHost,
  useHostAgentSettingValues,
  useHostSettingsReady,
} from "./AgentSettingsHostContext";

/** Select option id meaning "no Poracode override". */
const UNSET = "__unset__";

/** Keeps a stored value selectable even when the live option list no longer offers it. */
function withCurrent(options: SelectOption[], current: string): SelectOption[] {
  return current && !options.some((option) => option.id === current)
    ? [...options, { id: current, label: current }]
    : options;
}

/**
 * Collapsed Codex launch defaults. Values live in `agentSettings.codex` and are
 * passed to Codex as `-c` overrides at launch; `config.toml` values the host
 * reads are shown as read-only hints for whatever is left empty.
 */
export function CodexAdvancedSettings(props: {
  agentKind: string;
  statuses?: readonly AgentStatus[];
}) {
  const { agentKind } = props;
  const { t } = useLingui();
  const settingsHost = useAgentSettingsHost();
  const stored = useHostAgentSettingValues(agentKind);
  const ready = useHostSettingsReady();
  const localStatus = useAgentStatusesStore((state) =>
    props.statuses ? undefined : state.agentStatuses.find((entry) => entry.kind === agentKind),
  );
  const status =
    props.statuses?.find((entry) => entry.kind === agentKind) ?? props.statuses?.[0] ?? localStatus;
  const capabilities = status?.capabilities;
  const isAgentsConfigUnsupported =
    status?.version !== undefined &&
    /\d+\.\d+\.\d+/.test(status.version) &&
    !codexVersionSupportsAgentsConfig(status.version);
  const [configDefaults, setConfigDefaults] = useState<Record<string, string>>({});
  const [maxDraft, setMaxDraft] = useState<string | undefined>();

  useEffect(() => {
    if (!settingsHost.isOnline) {
      setConfigDefaults({});
      return;
    }
    let cancelled = false;
    void settingsHost
      .callProcedure("getAgentConfigDefaults", { agentKind })
      .then((result) => {
        if (!cancelled) setConfigDefaults(result.defaults);
      })
      .catch(() => {
        // Hints only: a failed read leaves the fields without config.toml context.
        if (!cancelled) setConfigDefaults({});
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- host key identifies the target machine.
  }, [settingsHost.key, settingsHost.isOnline, agentKind]);

  const valueOf = (key: string) => (typeof stored?.[key] === "string" ? stored[key] : "");
  const subagentModel = valueOf(CODEX_SUBAGENT_MODEL_SETTING_KEY);
  const subagentEffort = valueOf(CODEX_SUBAGENT_EFFORT_SETTING_KEY);
  const planEffort = valueOf(CODEX_PLAN_MODE_EFFORT_SETTING_KEY);
  const maxSubagents = valueOf(CODEX_MAX_SUBAGENTS_SETTING_KEY);
  const hasOverrides = CODEX_AGENT_SETTING_KEYS.some((key) => valueOf(key) !== "");

  const save = async (updates: Record<string, string>) => {
    if (!ready) return;
    try {
      await settingsHost.saveAgentSettings(agentKind, updates, { requireSuccess: true });
    } catch (error) {
      toast.danger(friendlyError(error));
    }
  };

  const withDefault = (options: SelectOption[], current: string): SelectOption[] => [
    { id: UNSET, label: t`Default` },
    ...withCurrent(options, current),
  ];
  const modelOptions = withDefault(
    (capabilities?.models ?? []).map((model) => ({ id: model.id, label: model.label })),
    subagentModel,
  );
  const effortChoices = (model: string) =>
    (model ? capabilities?.modelEfforts[model] : undefined) ?? capabilities?.efforts ?? [];
  const effortOptions = (choices: readonly string[], current: string) =>
    withDefault(
      choices.map((effort) => ({ id: effort, label: effort })),
      current,
    );

  // A stored effort the new model does not offer would make Codex reject every sub-agent spawn.
  const changeSubagentModel = (next: string) => {
    const offered = next ? capabilities?.modelEfforts[next] : undefined;
    const dropEffort =
      subagentEffort !== "" && offered !== undefined && !offered.includes(subagentEffort);
    void save({
      [CODEX_SUBAGENT_MODEL_SETTING_KEY]: next,
      ...(dropEffort ? { [CODEX_SUBAGENT_EFFORT_SETTING_KEY]: "" } : {}),
    });
  };

  const hint = (key: string, value: string, fallback: string) => {
    const configValue = configDefaults[key];
    if (value) {
      return configValue && configValue !== value
        ? t`Overrides config.toml: ${configValue}`
        : t`Set in Poracode.`;
    }
    return configValue ? t`From config.toml: ${configValue}` : fallback;
  };

  const parentModel = configDefaults[CODEX_PARENT_MODEL_HINT_KEY];
  const parentEffort = configDefaults[CODEX_PARENT_EFFORT_HINT_KEY];
  const modelFallback = parentModel
    ? t`Inherits the parent model: ${parentModel}`
    : t`Inherits the parent model`;
  const effortFallback = parentEffort
    ? t`Inherits the parent effort: ${parentEffort}`
    : t`Inherits the parent effort`;

  const commitMax = () => {
    if (maxDraft === undefined) return;
    const raw = maxDraft.trim();
    setMaxDraft(undefined);
    if (raw === maxSubagents) return;
    if (raw !== "" && parseMaxSubagents(raw) === undefined) {
      toast.warning(t`Enter a whole number from 1 to ${CODEX_MAX_SUBAGENTS_LIMIT}.`);
      return;
    }
    void save({ [CODEX_MAX_SUBAGENTS_SETTING_KEY]: raw });
  };

  const selectValue = (value: string) => value || UNSET;
  const fromSelect = (value: string) => (value === UNSET ? "" : value);

  return (
    <div className="border-t border-border/10 pt-3">
      <div className="flex items-start gap-4">
        <Disclosure className="min-w-0 flex-1">
          <Disclosure.Heading>
            <Disclosure.Trigger className="flex w-full min-w-0 items-start gap-3 py-1 text-left">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  <Trans>Advanced settings</Trans>
                </p>
                <p className="text-xs text-muted">
                  <Trans>
                    Sub-agent and planning defaults. They override config.toml and apply when a
                    Codex session starts; running sessions keep their current values.
                  </Trans>
                </p>
              </div>
              <Disclosure.Indicator className="mt-1 size-3.5 shrink-0 text-muted" />
            </Disclosure.Trigger>
          </Disclosure.Heading>

          <Disclosure.Content>
            <Disclosure.Body className="space-y-0.5 pt-2">
              {isAgentsConfigUnsupported ? (
                <p className="pb-1 text-xs text-warning">
                  <Trans>
                    The sub-agent settings need Codex 0.145 or newer. They are ignored until Codex
                    is updated.
                  </Trans>
                </p>
              ) : null}
              <SettingRow
                className="py-1.5"
                title={t`Sub-agent model`}
                description={hint(CODEX_SUBAGENT_MODEL_SETTING_KEY, subagentModel, modelFallback)}
              >
                <Select
                  aria-label={t`Sub-agent model`}
                  className="w-[160px] shrink-0"
                  options={modelOptions}
                  value={selectValue(subagentModel)}
                  isDisabled={!ready}
                  onChange={(value) => changeSubagentModel(fromSelect(value))}
                />
              </SettingRow>
              <SettingRow
                className="py-1.5"
                title={t`Sub-agent reasoning effort`}
                description={hint(
                  CODEX_SUBAGENT_EFFORT_SETTING_KEY,
                  subagentEffort,
                  effortFallback,
                )}
              >
                <Select
                  aria-label={t`Sub-agent reasoning effort`}
                  className="w-[160px] shrink-0"
                  options={effortOptions(effortChoices(subagentModel), subagentEffort)}
                  value={selectValue(subagentEffort)}
                  isDisabled={!ready}
                  onChange={(value) =>
                    void save({ [CODEX_SUBAGENT_EFFORT_SETTING_KEY]: fromSelect(value) })
                  }
                />
              </SettingRow>
              <SettingRow
                className="py-1.5"
                title={t`Max concurrent sub-agents`}
                description={hint(CODEX_MAX_SUBAGENTS_SETTING_KEY, maxSubagents, t`Codex default`)}
              >
                <Input
                  aria-label={t`Max concurrent sub-agents`}
                  className="h-8 min-h-8 w-24 shrink-0"
                  inputMode="numeric"
                  placeholder={configDefaults[CODEX_MAX_SUBAGENTS_SETTING_KEY] ?? t`Default`}
                  value={maxDraft ?? maxSubagents}
                  disabled={!ready}
                  onChange={(event) => setMaxDraft(event.currentTarget.value)}
                  onBlur={commitMax}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitMax();
                  }}
                />
              </SettingRow>
              <SettingRow
                className="py-1.5"
                title={t`Plan mode reasoning effort`}
                description={hint(CODEX_PLAN_MODE_EFFORT_SETTING_KEY, planEffort, t`Codex default`)}
              >
                <Select
                  aria-label={t`Plan mode reasoning effort`}
                  className="w-[160px] shrink-0"
                  options={effortOptions(capabilities?.efforts ?? [], planEffort)}
                  value={selectValue(planEffort)}
                  isDisabled={!ready}
                  onChange={(value) =>
                    void save({ [CODEX_PLAN_MODE_EFFORT_SETTING_KEY]: fromSelect(value) })
                  }
                />
              </SettingRow>
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 min-h-7 shrink-0 gap-1 px-2 text-[11px]"
          aria-label={t`Reset advanced settings`}
          isDisabled={!hasOverrides || !ready}
          onPress={() =>
            void save(Object.fromEntries(CODEX_AGENT_SETTING_KEYS.map((key) => [key, ""])))
          }
        >
          <RotateCcw className="size-3" />
          <Trans>Reset</Trans>
        </Button>
      </div>
    </div>
  );
}
