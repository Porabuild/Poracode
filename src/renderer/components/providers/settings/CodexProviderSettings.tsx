import { Trans, useLingui } from "@lingui/react/macro";
import {
  CODEX_CONTEXT_WINDOWS_SETTING_KEY,
  DEFAULT_CODEX_CONTEXT_WINDOWS,
  parseContextWindowInput,
  resolveCodexContextWindows,
} from "@/shared/agents/codexContextWindows";
import { CodexAdvancedSettings } from "./CodexAdvancedSettings";
import { ProviderContextWindowSettings } from "./ProviderContextWindowSettings";

export function CodexProviderSettings(props: { agentKind: string; wslDistros: string[] }) {
  const { t } = useLingui();
  return (
    <>
      <ProviderContextWindowSettings
        {...props}
        settingKey={CODEX_CONTEXT_WINDOWS_SETTING_KEY}
        defaults={DEFAULT_CODEX_CONTEXT_WINDOWS}
        resolveWindows={resolveCodexContextWindows}
        parseWindow={parseContextWindowInput}
        invalidSizeMessage={t`Enter a size like 512k or 1m.`}
        description={
          <Trans>
            Sizes shown in the Codex composer. Compaction starts automatically at 95% of the
            selected window. New chats default to 400k when that size is in the list.
          </Trans>
        }
      />
      <CodexAdvancedSettings agentKind={props.agentKind} />
    </>
  );
}
