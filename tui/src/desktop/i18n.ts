import type { I18n, MessageDescriptor } from "@lingui/core";

/**
 * English stand-in for the renderer's `@/renderer/i18n/i18n` catalog. The TUI
 * has no translations, so a descriptor renders its source message; the Lingui
 * macro shim already interpolated template values into it.
 */
export type TranslateFn = (descriptor: MessageDescriptor) => string;

function translate(descriptor: MessageDescriptor | string, values?: Record<string, unknown>) {
  const message =
    typeof descriptor === "string" ? descriptor : (descriptor.message ?? descriptor.id);
  const params = typeof descriptor === "string" ? values : (descriptor.values ?? values);
  if (!params) return message;
  return message.replace(/\{(\w+)\}/gu, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export const i18n = { locale: "en", _: translate } as Pick<I18n, "_" | "locale">;
