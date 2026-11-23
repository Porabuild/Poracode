import { type ReactNode, useState } from "react";
import { Button, Disclosure, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { RotateCcw } from "lucide-react";
import { Input, ToggleSwitch } from "@/renderer/components/common";
import { Select, type SelectOption } from "@/renderer/components/common/Select";
import {
  useAgentSettingsHost,
  useHostAgentSettingValues,
} from "../settings/AgentSettingsHostContext";
import { flushSharedSettings, useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { SettingRow } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";
import {
  DEEPSEEK_AGENT_SETTING_DEFAULTS,
  DEEPSEEK_APPLY_PATCH_SETTING_KEY,
  DEEPSEEK_CODE_MODE_SETTING_KEY,
  DEEPSEEK_INT_SETTING_BOUNDS,
  DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY,
  DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY,
  DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY,
  DEEPSEEK_OFFICE_TOOLS_SETTING_KEY,
  DEEPSEEK_RALPH_LOOP_SETTING_KEY,
  DEEPSEEK_READ_BEFORE_EDIT_SETTING_KEY,
  DEEPSEEK_SESSION_SEARCH_SETTING_KEY,
  DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY,
  DEEPSEEK_SUBAGENT_INTERRUPT_SETTING_KEY,
  DEEPSEEK_UPLOAD_SESSION_LOG_SETTING_KEY,
  DEEPSEEK_WEB_BILLING_SETTING_KEY,
  DEEPSEEK_WEB_FETCH_PROVIDER_SETTING_KEY,
  DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY,
  DEEPSEEK_WEB_SEARCH_PROVIDER_SETTING_KEY,
  type DeepSeekIntSettingKey,
  hasDeepSeekAgentSettingOverrides,
  parseDeepSeekIntSetting,
  resolveDeepSeekAgentSettings,
} from "@/shared/agents/deepseekAgentSettings";
import { friendlyError } from "@/shared/messages";

/** Select option id meaning "no Poracode override". */
const UNSET = "__unset__";

function withCurrent(options: SelectOption[], current: string): SelectOption[] {
  return current && !options.some((option) => option.id === current)
    ? [...options, { id: current, label: current }]
    : options;
}

function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <p className="pt-2 pb-0.5 text-[11px] font-medium tracking-wide text-muted uppercase">
      {children}
    </p>
  );
}

function ToggleSettingRow(props: {
  title: string;
  description: ReactNode;
  isSelected: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <SettingRow className="py-1.5" title={props.title} description={props.description}>
      <ToggleSwitch
        aria-label={props.title}
        isSelected={props.isSelected}
        size="sm"
        onChange={props.onChange}
      />
    </SettingRow>
  );
}

function NumericSettingRow(props: {
  title: string;
  description: ReactNode;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <SettingRow className="py-1.5" title={props.title} description={props.description}>
      <Input
        aria-label={props.title}
        className="h-8 min-h-8 w-24 shrink-0"
        inputMode="numeric"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        onBlur={props.onCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") props.onCommit();
        }}
      />
    </SettingRow>
  );
}

/**
 * Collapsed DeepSeek Harness launch settings. Values live in
 * `agentSettings.deepseek` and are compiled into the staged `--patch` overlay
 * when a `dsh acp` session starts; running threads keep their current process.
 */
export function DeepSeekAdvancedSettings(props: { agentKind: string }) {
  const { agentKind } = props;
  const { t } = useLingui();
  const settingsHost = useAgentSettingsHost();
  const stored = useHostAgentSettingValues(agentKind);
  const [drafts, setDrafts] = useState<Record<string, string | undefined>>({});

  // Derive displayed values from the same resolver the supervisor uses so
  // controls, Reset, and launch compilation stay in agreement for default,
  // whitespace-padded, and ignored values.
  const resolved = resolveDeepSeekAgentSettings(stored);
  const webSearchProvider = resolved.webSearchProvider ?? "";
  const webFetchProvider = resolved.webFetchProvider ?? "";
  const webBilling = resolved.webBilling ?? "";
  const webSearchCount =
    resolved.webSearchCount !== undefined ? String(resolved.webSearchCount) : "";
  const maxSubagentDepth =
    resolved.maxSubagentDepth !== undefined ? String(resolved.maxSubagentDepth) : "";
  const maxActiveSubagents =
    resolved.maxActiveSubagents !== undefined ? String(resolved.maxActiveSubagents) : "";
  const maxParallelToolCalls =
    resolved.maxParallelToolCalls !== undefined ? String(resolved.maxParallelToolCalls) : "";
  const shellTimeoutSeconds =
    resolved.shellTimeoutSeconds !== undefined ? String(resolved.shellTimeoutSeconds) : "";

  const hasOverrides = hasDeepSeekAgentSettingOverrides(stored);

  const save = async (updates: Readonly<Record<string, boolean | string>>) => {
    if (settingsHost.isRemote) {
      try {
        await settingsHost.saveAgentSettings(agentKind, updates, { requireSuccess: true });
      } catch (error) {
        toast.danger(friendlyError(error));
      }
      return;
    }
    const before = useSharedSettings.getState().agentSettings[agentKind];
    const previous = Object.fromEntries(
      Object.entries(updates).map(([key]) => [
        key,
        before?.[key] ?? DEEPSEEK_AGENT_SETTING_DEFAULTS[key] ?? "",
      ]),
    );
    for (const [key, value] of Object.entries(updates)) {
      settingsHost.setAgentSetting(agentKind, key, value);
    }
    try {
      await flushSharedSettings({ requireSuccess: true });
    } catch (error) {
      // A newer save may already own a key; only undo values this save still holds.
      const current = useSharedSettings.getState().agentSettings[agentKind];
      for (const [key, value] of Object.entries(previous)) {
        if (current?.[key] === updates[key]) settingsHost.setAgentSetting(agentKind, key, value);
      }
      toast.danger(friendlyError(error));
    }
  };

  const commitInt = (key: DeepSeekIntSettingKey, currentValue: string) => {
    const draft = drafts[key];
    if (draft === undefined) return;
    const raw = draft.trim();
    setDrafts((prev) => ({ ...prev, [key]: undefined }));
    if (raw === currentValue) return;
    if (raw !== "" && parseDeepSeekIntSetting(key, raw) === undefined) {
      const { min, max } = DEEPSEEK_INT_SETTING_BOUNDS[key];
      toast.warning(t`Enter a whole number from ${min} to ${max}.`);
      return;
    }
    void save({ [key]: raw });
  };

  const setDraft = (key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const selectValue = (value: string) => value || UNSET;
  const fromSelect = (value: string) => (value === UNSET ? "" : value);

  const webSearchOptions = withCurrent(
    [
      { id: UNSET, label: t`Automatic` },
      { id: "deepseek-search-api", label: t`DeepSeek Search API` },
      { id: "deepseek-official", label: t`DeepSeek server-side search` },
    ],
    webSearchProvider,
  );

  const webFetchOptions = withCurrent(
    [
      { id: UNSET, label: t`Direct fetch (default)` },
      { id: "deepseek-fetch-api", label: t`DeepSeek Fetch API` },
    ],
    webFetchProvider,
  );

  const webBillingOptions = withCurrent(
    [
      { id: UNSET, label: t`Automatic` },
      { id: "account", label: t`DeepSeek account` },
      { id: "api-key", label: t`DeepSeek API key` },
    ],
    webBilling,
  );

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
                    Code mode, optional Harness tools, web providers, execution limits, and session
                    log sharing. Applies to new or restarted threads.
                  </Trans>
                </p>
              </div>
              <Disclosure.Indicator className="mt-1 size-3.5 shrink-0 text-muted" />
            </Disclosure.Trigger>
          </Disclosure.Heading>

          <Disclosure.Content>
            <Disclosure.Body className="space-y-0.5 pt-2">
              <GroupHeading>
                <Trans>Capabilities</Trans>
              </GroupHeading>

              <ToggleSettingRow
                title={t`Code mode (PTC)`}
                description={
                  <Trans>
                    Run tools through sandboxed TypeScript programs (run_code) instead of direct
                    tool calls. Reduces intermediate context usage.
                  </Trans>
                }
                isSelected={resolved.codeMode}
                onChange={(next) => void save({ [DEEPSEEK_CODE_MODE_SETTING_KEY]: next })}
              />

              <ToggleSettingRow
                title={t`Apply patch tool`}
                description={
                  <Trans>Expose the apply_patch file-editing tool alongside edit.</Trans>
                }
                isSelected={resolved.applyPatch}
                onChange={(next) => void save({ [DEEPSEEK_APPLY_PATCH_SETTING_KEY]: next })}
              />

              <ToggleSettingRow
                title={t`Require read before edit`}
                description={
                  <Trans>
                    Block edits or overwrites on files the session has not read yet, and reject
                    stale edits after external changes.
                  </Trans>
                }
                isSelected={resolved.readBeforeEdit}
                onChange={(next) => void save({ [DEEPSEEK_READ_BEFORE_EDIT_SETTING_KEY]: next })}
              />

              <ToggleSettingRow
                title={t`Session history search`}
                description={
                  <Trans>
                    Enable experimental tools for searching and tracing prior Harness sessions in
                    the same workspace.
                  </Trans>
                }
                isSelected={resolved.sessionSearch}
                onChange={(next) => void save({ [DEEPSEEK_SESSION_SEARCH_SETTING_KEY]: next })}
              />

              <ToggleSettingRow
                title={t`Ralph autonomous loop`}
                description={
                  <Trans>
                    Enable the experimental ralph tool for multi-round fresh-agent iteration.
                  </Trans>
                }
                isSelected={resolved.ralphLoop}
                onChange={(next) => void save({ [DEEPSEEK_RALPH_LOOP_SETTING_KEY]: next })}
              />

              <ToggleSettingRow
                title={t`Office document tools`}
                description={
                  <Trans>
                    Enable skill-activated LibreOffice tools for rendering, converting, and
                    recalculating documents.
                  </Trans>
                }
                isSelected={resolved.officeTools}
                onChange={(next) => void save({ [DEEPSEEK_OFFICE_TOOLS_SETTING_KEY]: next })}
              />

              <ToggleSettingRow
                title={t`Sub-agent interruption`}
                description={
                  <Trans>
                    Allow the main agent to interrupt running sub-agents with interrupt_agent.
                  </Trans>
                }
                isSelected={resolved.subagentInterrupt}
                onChange={(next) => void save({ [DEEPSEEK_SUBAGENT_INTERRUPT_SETTING_KEY]: next })}
              />

              <GroupHeading>
                <Trans>Web search &amp; fetch</Trans>
              </GroupHeading>

              <SettingRow
                className="py-1.5"
                title={t`Web search provider`}
                description={
                  <Trans>
                    Automatic uses DeepSeek server-side search on DeepSeek models and DeepSeek
                    Search API on other models.
                  </Trans>
                }
              >
                <Select
                  aria-label={t`Web search provider`}
                  className="w-[190px] shrink-0"
                  options={webSearchOptions}
                  value={selectValue(webSearchProvider)}
                  onChange={(value) =>
                    void save({ [DEEPSEEK_WEB_SEARCH_PROVIDER_SETTING_KEY]: fromSelect(value) })
                  }
                />
              </SettingRow>

              <SettingRow
                className="py-1.5"
                title={t`Web fetch provider`}
                description={
                  <Trans>
                    Choose direct HTTP fetching from this machine or DeepSeek Fetch API.
                  </Trans>
                }
              >
                <Select
                  aria-label={t`Web fetch provider`}
                  className="w-[190px] shrink-0"
                  options={webFetchOptions}
                  value={selectValue(webFetchProvider)}
                  onChange={(value) =>
                    void save({ [DEEPSEEK_WEB_FETCH_PROVIDER_SETTING_KEY]: fromSelect(value) })
                  }
                />
              </SettingRow>

              <SettingRow
                className="py-1.5"
                title={t`DeepSeek Web API billing`}
                description={
                  <Trans>Credential used when calling DeepSeek Search API or Fetch API.</Trans>
                }
              >
                <Select
                  aria-label={t`DeepSeek Web API billing`}
                  className="w-[190px] shrink-0"
                  options={webBillingOptions}
                  value={selectValue(webBilling)}
                  onChange={(value) =>
                    void save({ [DEEPSEEK_WEB_BILLING_SETTING_KEY]: fromSelect(value) })
                  }
                />
              </SettingRow>

              <NumericSettingRow
                title={t`Results per search`}
                description={
                  <Trans>Number of DeepSeek Search API results per query (1–50, default 10).</Trans>
                }
                placeholder="10"
                value={drafts[DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY] ?? webSearchCount}
                onChange={(value) => setDraft(DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY, value)}
                onCommit={() => commitInt(DEEPSEEK_WEB_SEARCH_COUNT_SETTING_KEY, webSearchCount)}
              />

              <GroupHeading>
                <Trans>Execution limits</Trans>
              </GroupHeading>

              <NumericSettingRow
                title={t`Max sub-agent depth`}
                description={
                  <Trans>Maximum delegation nesting depth (0–16, Harness default 1).</Trans>
                }
                placeholder="1"
                value={drafts[DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY] ?? maxSubagentDepth}
                onChange={(value) => setDraft(DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY, value)}
                onCommit={() =>
                  commitInt(DEEPSEEK_MAX_SUBAGENT_DEPTH_SETTING_KEY, maxSubagentDepth)
                }
              />

              <NumericSettingRow
                title={t`Max concurrent sub-agents`}
                description={
                  <Trans>Maximum live sub-agents per session (1–64, Harness default 8).</Trans>
                }
                placeholder="8"
                value={drafts[DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY] ?? maxActiveSubagents}
                onChange={(value) => setDraft(DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY, value)}
                onCommit={() =>
                  commitInt(DEEPSEEK_MAX_ACTIVE_SUBAGENTS_SETTING_KEY, maxActiveSubagents)
                }
              />

              <NumericSettingRow
                title={t`Max parallel tool calls`}
                description={
                  <Trans>
                    Maximum concurrent read-safe tool calls per step (1–64, Harness default 10).
                  </Trans>
                }
                placeholder="10"
                value={drafts[DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY] ?? maxParallelToolCalls}
                onChange={(value) => setDraft(DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY, value)}
                onCommit={() =>
                  commitInt(DEEPSEEK_MAX_PARALLEL_TOOL_CALLS_SETTING_KEY, maxParallelToolCalls)
                }
              />

              <NumericSettingRow
                title={t`Shell command timeout (seconds)`}
                description={
                  <Trans>
                    Default timeout for shell commands (5–600 seconds, Harness default 60).
                  </Trans>
                }
                placeholder="60"
                value={drafts[DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY] ?? shellTimeoutSeconds}
                onChange={(value) => setDraft(DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY, value)}
                onCommit={() =>
                  commitInt(DEEPSEEK_SHELL_TIMEOUT_SECONDS_SETTING_KEY, shellTimeoutSeconds)
                }
              />

              <GroupHeading>
                <Trans>Privacy</Trans>
              </GroupHeading>

              <ToggleSettingRow
                title={t`Upload session log`}
                description={
                  <Trans>
                    Include session logs with official DeepSeek API requests. Enabled by default in
                    DeepSeek Harness.
                  </Trans>
                }
                isSelected={resolved.uploadSessionLog}
                onChange={(next) => void save({ [DEEPSEEK_UPLOAD_SESSION_LOG_SETTING_KEY]: next })}
              />
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 min-h-7 shrink-0 gap-1 px-2 text-[11px]"
          aria-label={t`Reset advanced settings`}
          isDisabled={!hasOverrides}
          onMouseDown={(event) => event.preventDefault()}
          onPress={() => {
            setDrafts({});
            void save(DEEPSEEK_AGENT_SETTING_DEFAULTS);
          }}
        >
          <RotateCcw className="size-3" />
          <Trans>Reset</Trans>
        </Button>
      </div>
    </div>
  );
}
