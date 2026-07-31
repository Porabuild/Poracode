import type { CommandSpec, CreateStructuredSessionInput } from "../base";
import { AcpStructuredSession } from "./session";

/**
 * Decide whether `createAcpStructuredSession` should actually spawn the ACP
 * agent for this thread launch. Pulled out as a pure predicate so adapters
 * (and tests) can audit the contract without instantiating a real process.
 *
 *   - **Terminal resume** → `false`. The TUI re-attaches via its native flag
 *     (`--resume <id>`, `--session <id>`, etc.) and a parallel ACP session
 *     would just waste a process and confuse the renderer.
 *   - **GUI resume** → `true`. The structured session IS the chat surface,
 *     so it must stay live for the thread's whole lifetime; `openThread`
 *     calls `loadSession` to re-attach.
 *   - **Initial launch (any presentation)** → `true`. Even terminal threads
 *     use a short-lived ACP session to allocate the provider session id
 *     before the TUI takes over.
 */
export function shouldSpawnAcpSession(input: CreateStructuredSessionInput): boolean {
  if (input.sessionRef && input.presentationMode !== "gui") {
    return false;
  }
  return true;
}

/**
 * Create an ACP structured session for the given adapter command.
 *
 * Agent adapters call this from their `createStructuredSession()` method,
 * passing the ACP-mode command (e.g. `gemini --acp`, `copilot --acp --stdio`).
 *
 * The factory owns the resume/presentation gating via {@link shouldSpawnAcpSession}
 * so every ACP-speaking provider behaves identically. Adapters should NOT add
 * their own `if (input.sessionRef) return undefined` gate — that's what
 * produced the Copilot GUI-resume regression. Just call this factory
 * unconditionally and trust the shared decision.
 */
export function createAcpStructuredSession(
  acpCommand: CommandSpec,
  input: CreateStructuredSessionInput,
): AcpStructuredSession | undefined {
  if (!shouldSpawnAcpSession(input)) {
    return undefined;
  }
  return AcpStructuredSession.create(acpCommand, input.projectLocation, input.threadId, {
    ...(input.loadSessionErrorRewriter
      ? { loadSessionErrorRewriter: input.loadSessionErrorRewriter }
      : {}),
    ...(input.acpEmptyResponseErrorResolver
      ? { emptyResponseErrorResolver: input.acpEmptyResponseErrorResolver }
      : {}),
    ...(input.acpSessionUpdateTransform
      ? { sessionUpdateTransform: input.acpSessionUpdateTransform }
      : {}),
    ...(input.acpGoalCommands ? { goalCommands: true } : {}),
    ...(input.acpExtensionSessionUpdateTransform
      ? { extensionSessionUpdateTransform: input.acpExtensionSessionUpdateTransform }
      : {}),
    ...(input.acpExtensionNotificationHandler
      ? { extensionNotificationHandler: input.acpExtensionNotificationHandler }
      : {}),
    ...(input.mcpServers !== undefined ? { mcpServers: input.mcpServers } : {}),
  });
}
