import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import { deriveCommandIntent } from "@/shared/commandPresentation/interpret";
import { formatCommandIntent, formatCommandViewPrefix } from "@/shared/commandPresentation/format";
import type {
  CommandIntent,
  CommandIntentDisplay,
  CommandTitleLabel,
  CommandTitleLabels,
} from "@/shared/commandPresentation/model";

export type { CommandIntentDisplay, CommandIntentKind } from "@/shared/commandPresentation/model";
export {
  summarizeShellCommand,
  finalizeTitle,
  basenameFromPath,
  scopeDisplayPath,
} from "@/shared/commandPresentation/shellCommand";

const messages: Record<CommandTitleLabel | "view", MessageDescriptor> = {
  run: msg`Run`,
  view: msg`View`,
  search: msg`Search`,
  list: msg`List`,
  check: msg`Check`,
  git: msg`Git`,
  "format-files": msg`Format files`,
  "package-manager": msg`Package manager`,
  "install-packages": msg`Install packages`,
  "list-packages": msg`List packages`,
  "package-config": msg`Package config`,
};

const labels: CommandTitleLabels = {
  label: (key) => i18n._(messages[key]),
  searchIn: (query, scope) => i18n._(msg`Search: "${query}" in ${scope}`),
};

const MAX_COMMAND_CACHE_ENTRIES = 512;
const commandDisplayCache = new Map<string, { locale: string; display: CommandIntentDisplay }>();

/** Client localization is separate from the host-usable command interpretation. */
export function formatCommandDisplay(intent: CommandIntent): CommandIntentDisplay {
  return formatCommandIntent(intent, labels);
}

export function humanIntentTitle(fullCommandLine: string): string {
  return commandIntentDisplay(fullCommandLine).title;
}

export function commandIntentDisplay(fullCommandLine: string): CommandIntentDisplay {
  const locale = i18n.locale;
  const cached = commandDisplayCache.get(fullCommandLine);
  if (cached?.locale === locale) {
    commandDisplayCache.delete(fullCommandLine);
    commandDisplayCache.set(fullCommandLine, cached);
    return cached.display;
  }
  const display = formatCommandDisplay(deriveCommandIntent(fullCommandLine));
  commandDisplayCache.set(fullCommandLine, { locale, display });
  while (commandDisplayCache.size > MAX_COMMAND_CACHE_ENTRIES) {
    const oldest = commandDisplayCache.keys().next().value;
    if (oldest === undefined) break;
    commandDisplayCache.delete(oldest);
  }
  return display;
}

export function viewPrefix(lines?: string): string {
  return formatCommandViewPrefix(i18n._(messages.view), lines);
}
