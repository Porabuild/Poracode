import {
  DEVICE_WORKSPACE_AGENT_KEY_ENV,
  deviceThreadProof,
} from "@/shared/deviceWorkspaceAgentProof";
import type { McpThreadIdentity } from "@/shared/browserMcpThread";

// Consume the launch secret before provider processes or environment snapshots
// are constructed. Only the per-thread proof is delivered to an agent.
const signingKey = process.env[DEVICE_WORKSPACE_AGENT_KEY_ENV];
delete process.env[DEVICE_WORKSPACE_AGENT_KEY_ENV];

export function withDeviceProof(
  identity: McpThreadIdentity | undefined,
): McpThreadIdentity | undefined {
  return signingKey && identity?.threadId
    ? { ...identity, deviceProof: deviceThreadProof(signingKey, identity.threadId) }
    : identity;
}
