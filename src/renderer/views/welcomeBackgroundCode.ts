/**
 * Decorative source-code wallpaper for the welcome overlay. The contents are
 * intentionally evocative rather than literal — the strings reference imports
 * and APIs that may not exist. Kept in a separate module so the welcome
 * overlay can lazily import it once and so the 20KB literal doesn't bloat
 * surrounding files.
 */
export const WELCOME_BACKGROUND_CODE =
  `import { startTransition, useEffect, useState } from "react";
import { invokeAgent, type AgentStatus } from "@poracode/agents";
import { PTYSession } from "@/shared/pty";
import { useAppStore } from "@/renderer/state/appStore";
import { readBridge } from "@/renderer/bridge";
import { parseUnifiedDiff } from "@/shared/lineUnifiedDiff";

export interface OrchestratorProps {
  projectId: string;
  initialPrompt?: string;
}

export function AgentOrchestrator({ projectId, initialPrompt }: OrchestratorProps) {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [output, setOutput] = useState("");
  const dispatch = useAppStore((state) => state.dispatch);

  useEffect(() => {
    const session = new PTYSession(projectId);
    session.on("data", (chunk) => {
      dispatch({ type: "PTY_DATA", payload: chunk });
      setOutput((prev) => prev + chunk.toString());
    });

    if (initialPrompt) handleInvoke(initialPrompt);

    return () => session.kill();
  }, [projectId, initialPrompt]);

  const handleInvoke = async (prompt: string) => {
    startTransition(() => setStatus("running"));
    try {
      const location = await readBridge().getProjectLocation(projectId);
      const result = await invokeAgent({
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        tools: ["read_file", "run_shell_command", "replace", "invoke_agent"],
        context: { cwd: location.path },
        prompt
      });

      if (result.patch) {
        const diff = parseUnifiedDiff(result.patch);
        await readBridge().applyPatch(location.path, diff);
      }
    } catch (err) {
      console.error("Agent execution failed:", err);
      dispatch({ type: "AGENT_ERROR", error: err as Error });
    } finally {
      startTransition(() => setStatus("idle"));
    }
  };

  return (
    <div className="orchestrator-panel relative flex h-full flex-col bg-background/50 backdrop-blur-md">
      <header className="flex h-12 items-center border-b border-white/10 px-4">
        <h2 className="text-sm font-medium text-foreground">Active Session</h2>
        <StatusBadge status={status} className="ml-auto" />
      </header>
      <div className="flex-1 overflow-hidden">
        <TerminalView session={session} value={output} />
      </div>
      <footer className="shrink-0 p-4">
        <ChatInput onSubmit={handleInvoke} disabled={status === "running"} />
      </footer>
    </div>
  );
}

// Supervisor process management for native execution
export class SupervisorRuntime {
  private workers = new Map<string, Worker>();
  private ptyHandles = new Set<string>();

  async spawn(config: RuntimeConfig) {
    const worker = new Worker(config.entrypoint, { type: "module" });
    worker.postMessage({ type: "INIT", config });

    worker.on("message", (msg) => {
      if (msg.type === "PTY_SPAWN") {
        this.ptyHandles.add(msg.pid);
      }
    });

    this.workers.set(config.id, worker);
    return worker;
  }

  async terminate(id: string) {
    const worker = this.workers.get(id);
    if (worker) {
      worker.terminate();
      this.workers.delete(id);
    }
  }
}
`.repeat(6);
