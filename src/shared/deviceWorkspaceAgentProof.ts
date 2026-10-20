import { createHmac, timingSafeEqual } from "node:crypto";

export const DEVICE_WORKSPACE_AGENT_KEY_ENV = "PORACODE_DEVICE_WORKSPACE_AGENT_KEY";
// Version 1 binds an agent's endpoint proof to one host generation and thread.
// This is separate from the app-wide MCP bearer and all provider credentials.
export function deviceThreadProof(key: string, threadId: string): string {
  return `device-v1.${createHmac("sha256", key).update(threadId).digest("base64url")}`;
}
export function verifyDeviceThreadProof(
  key: string,
  threadId: string,
  proof: string | undefined,
): boolean {
  if (!proof) return false;
  const expected = Buffer.from(deviceThreadProof(key, threadId));
  const actual = Buffer.from(proof);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
