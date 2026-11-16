import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";

export function clientDraftPersistenceError(cause?: unknown): Error {
  return new Error(
    i18n._(msg`Couldn't save this draft on this device. Your content is still in the composer.`),
    { cause },
  );
}
