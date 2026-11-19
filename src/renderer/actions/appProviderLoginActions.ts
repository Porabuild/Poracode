import type {
  AppProviderLoginRequest,
  AppProviderLoginResult,
} from "@/shared/contracts/appProviderAuth";
import {
  providerAuthDiscovery,
  selectProviderAuthStatus,
  selectProviderSignIn,
} from "@/shared/providerAuthSelection";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useLoginTerminalStore } from "@/renderer/state/loginTerminalStore";
import { findProjectForMachine } from "@/renderer/utils/acpRegistryAuth";
import { runAgentLoginCommand } from "./agentLoginActions";

export async function runAppProviderLogin(
  { input }: AppProviderLoginRequest,
  begin: () => Promise<void>,
): Promise<AppProviderLoginResult> {
  const bridge = readBridge();
  const { wslDistros, scope } = providerAuthDiscovery(input);
  const status = selectProviderAuthStatus(
    await bridge.refreshAgentStatuses(wslDistros, scope),
    input,
  );
  const selected = selectProviderSignIn(status, input);
  if (selected.type !== "terminal") {
    throw new Error("The provider's sign-in method changed. Read its status again.");
  }
  const env = input.env;
  const wsl = env.kind === "wsl";
  const project = findProjectForMachine(
    {
      id: wsl ? env.distro : "native",
      ref: { host: "local", env: input.env },
      kind: wsl ? "local-wsl" : "local",
      label: status.label,
      status: "online",
    },
    useAppStore.getState().projects,
    bridge.platform === "win32",
    [status],
    { allowHomeWithoutProject: true },
  );
  if (!project) throw new Error("Could not resolve the local sign-in environment.");
  await begin();
  if (useLoginTerminalStore.getState().active) {
    throw new Error(
      "A login terminal is already open. Finish or close it before starting another.",
    );
  }
  return {
    opened: runAgentLoginCommand({
      label: status.label,
      status,
      project,
      command: selected.command,
      ...(selected.method?.type === "terminal" && selected.method.env
        ? { env: selected.method.env }
        : {}),
      onCommandComplete: () => {
        void bridge.refreshAgentStatuses(wslDistros, scope).catch(() => undefined);
      },
    }),
  };
}
