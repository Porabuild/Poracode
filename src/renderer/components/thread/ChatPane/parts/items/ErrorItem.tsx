import { Alert } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ErrorItemPayload } from "@/shared/contracts";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";

interface ErrorItemProps {
  item: RuntimeChatItem;
}

export function ErrorItem({ item }: ErrorItemProps) {
  const { t } = useLingui();
  const payload = getRuntimeItemPayload<ErrorItemPayload>(item, "error");
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description className="text-[length:var(--lc-chat-font-size-meta)]">
          {payload?.message ?? t`Error`}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
