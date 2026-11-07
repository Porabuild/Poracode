import { Trans, useLingui } from "@lingui/react/macro";
import {
  orderContextWindows,
  parseContextWindowInput,
  parseStoredContextWindowOptions,
} from "@/shared/contextWindowOptions";
import { ProviderContextWindowSettings } from "../settings/ProviderContextWindowSettings";

// Mirror the provider's native presets and Claude Code's accepted window range.
// The default mirrors the supervisor's CLAUDE_DEFAULT_CONTEXT_SIZE.
const CLAUDE_DEFAULT_WINDOW_ID = "400k";
export const CLAUDE_DEFAULT_WINDOWS = [CLAUDE_DEFAULT_WINDOW_ID, "1m"].map((id) =>
  parseContextWindowInput(id)!,
);

export function parseClaudeWindowInput(raw: string) {
  const window = parseContextWindowInput(raw);
  return window && window.tokens >= 100_000 && window.tokens <= 1_000_000 ? window : undefined;
}

export function resolveClaudeWindows(stored?: Record<string, boolean | string>) {
  const windows = parseStoredContextWindowOptions(
    stored?.contextWindows,
    CLAUDE_DEFAULT_WINDOWS,
    parseClaudeWindowInput,
  );
  return orderContextWindows(windows, CLAUDE_DEFAULT_WINDOW_ID);
}

export function ClaudeContextWindowSettings(props: { agentKind: string; wslDistros: string[] }) {
  const { t } = useLingui();
  return (
    <ProviderContextWindowSettings
      {...props}
      settingKey="contextWindows"
      defaults={CLAUDE_DEFAULT_WINDOWS}
      resolveWindows={resolveClaudeWindows}
      parseWindow={parseClaudeWindowInput}
      invalidSizeMessage={t`Enter a size between 100k and 1m.`}
      description={
        <Trans>
          Sizes shown for 1M Claude models. Choose any size from 100k to 1M; new chats default to 1M
          when available.
        </Trans>
      }
    />
  );
}
