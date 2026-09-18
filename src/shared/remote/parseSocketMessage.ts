import { remoteWebSocketServerMessageSchema, type RemoteWebSocketServerMessage } from "./protocol";

export function tryParseSocketMessage(value: string): RemoteWebSocketServerMessage | null {
  try {
    const parsed = remoteWebSocketServerMessageSchema.safeParse(JSON.parse(value) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
