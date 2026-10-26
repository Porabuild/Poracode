import type { AcpMapperState } from "./state";

/**
 * Bind a client terminal to the oldest open unbound command running the exact command.
 * Returns whether a call adopted it.
 */
export function attributeAcpCommandTerminal(
  state: AcpMapperState,
  terminalId: string,
  runsCommand: (command: string) => boolean,
): boolean {
  for (const item of state.toolCallItems.values()) {
    if (
      item.itemType !== "command_execution" ||
      item.payload.status !== "running" ||
      item.terminalId ||
      item.attributedTerminalId
    ) {
      continue;
    }
    const command = item.payload.command;
    if (typeof command !== "string" || !runsCommand(command)) continue;
    item.attributedTerminalId = terminalId;
    return true;
  }
  return false;
}
