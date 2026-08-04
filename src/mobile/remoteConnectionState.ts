import { useRef, useState } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { isRemoteTransportFailure, isUnauthorizedRemoteError } from "@/shared/remote/client";

export type ConnectionState =
  | "booting"
  | "pairing"
  | "online"
  | "reconnecting"
  | "offline"
  | "unauthorized"
  | "error";

export const CONNECTION_LABELS: Record<ConnectionState, MessageDescriptor> = {
  booting: msg`Starting`,
  pairing: msg`Pairing`,
  online: msg`Live`,
  reconnecting: msg`Reconnecting`,
  offline: msg`Offline`,
  unauthorized: msg`Pair again`,
  error: msg`Error`,
};

type SessionMessage = { readonly kind: "connection" | "operation"; readonly text: string } | null;

export function useRemoteConnectionState() {
  const [connection, setConnection] = useState<ConnectionState>("booting");
  const [sessionMessage, setSessionMessage] = useState<SessionMessage>(null);
  const socketOpenRef = useRef(false);
  const lastRefreshOkAtRef = useRef(0);

  function setConnectionMessage(text: string) {
    setSessionMessage({ kind: "connection", text });
  }

  function setOperationMessage(text: string) {
    setSessionMessage({ kind: "operation", text });
  }

  function clearConnectionMessage() {
    setSessionMessage((current) => (current?.kind === "connection" ? null : current));
  }

  function clearMessage() {
    setSessionMessage(null);
  }

  function downgradeConnectionOnError(error: unknown) {
    if (isUnauthorizedRemoteError(error)) setConnection("unauthorized");
    else if (isRemoteTransportFailure(error)) {
      if (!socketOpenRef.current) setConnection("offline");
    }
  }

  return {
    connection,
    setConnection,
    message: sessionMessage?.text ?? "",
    socketOpenRef,
    lastRefreshOkAtRef,
    setConnectionMessage,
    setOperationMessage,
    clearConnectionMessage,
    clearMessage,
    downgradeConnectionOnError,
  };
}
