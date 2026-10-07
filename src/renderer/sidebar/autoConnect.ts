import { managedLoopbackBootstrapSchema } from "@/shared/managedLoopback";
import { chromeSidebarClientIssueSchema } from "@/shared/chromeSidebarProtocol";
import {
  useRemoteServersStore,
  selectBrowserBridgeServer,
} from "@/renderer/state/remoteServersStore";

type ExtensionRuntime = { sendMessage(message: { cmd: string }): Promise<unknown> };

/** Discovery stays in the worker; credentials are never logged or put in page URLs. */
export function installSidebarAutoConnect(onStatus: (error: unknown | null) => void): () => void {
  const runtime = (globalThis as typeof globalThis & { chrome?: { runtime?: ExtensionRuntime } })
    .chrome?.runtime;
  if (!runtime) return () => {};
  let disposed = false;
  let running = false;
  const attempt = async () => {
    if (disposed || running) return;
    if (selectBrowserBridgeServer(useRemoteServersStore.getState())) {
      onStatus(null);
      return;
    }
    running = true;
    try {
      const response = await runtime.sendMessage({ cmd: "getChatBootstrap" });
      if (disposed) return;
      const issue = chromeSidebarClientIssueSchema.safeParse(response);
      if (issue.success) {
        onStatus(issue.data.issue);
        return;
      }
      const parsed = managedLoopbackBootstrapSchema.safeParse(response);
      if (!parsed.success) {
        onStatus(null);
        return;
      }
      await useRemoteServersStore
        .getState()
        .pairServer({ endpoint: parsed.data.endpoint, token: parsed.data.pairingUrl });
      if (!disposed) await useRemoteServersStore.getState().connectAll();
      if (!disposed) onStatus(null);
    } catch (error) {
      if (!disposed) onStatus(error);
    } finally {
      running = false;
    }
  };
  void attempt();
  const interval = setInterval(() => void attempt(), 4000);
  return () => {
    disposed = true;
    clearInterval(interval);
  };
}
