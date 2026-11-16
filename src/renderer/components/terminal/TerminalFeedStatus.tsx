import { Alert } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { RemoteTerminalWatchResultError } from "@/shared/remote/protocol";

export function TerminalFeedStatus({
  error,
  loading = false,
  inputFailed = false,
}: {
  error: RemoteTerminalWatchResultError | null;
  loading?: boolean;
  inputFailed?: boolean;
}) {
  const { t } = useLingui();
  const message = inputFailed
    ? t`Terminal input failed. Some input may not have reached the shell. Reopen the terminal before typing again.`
    : loading
      ? t`Loading terminal…`
      : error?.retryable
        ? t`Reconnecting to terminal…`
        : error?.code === "forbidden"
          ? t`Terminal access denied.`
          : t`Terminal output is unavailable. Reconnect to try again.`;
  return (
    <div className="absolute inset-x-2 top-2 z-10" role="status">
      <Alert status={!inputFailed && (loading || error?.retryable) ? "default" : "warning"}>
        <Alert.Content>
          <Alert.Description className="text-xs">{message}</Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}
