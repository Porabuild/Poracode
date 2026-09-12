import Foundation

enum TerminalStrings {
  private static func value(_ key: String, _ fallback: String) -> String {
    NSLocalizedString(key, tableName: "Terminal", bundle: .main, value: fallback, comment: "")
  }

  static let title = value("terminal.title", "Terminal")
  static let output = value("terminal.output", "Terminal output")
  static let input = value("terminal.input", "Terminal input")
  static let inputPlaceholder = value("terminal.input.placeholder", "Enter a command")
  static let send = value("terminal.send", "Send")
  static let sendHint = value("terminal.send.hint", "Sends the command followed by Return.")
  static let controlC = value("terminal.control_c", "Control-C")
  static let tab = value("terminal.tab", "Tab")
  static let reconnect = value("terminal.reconnect", "Reconnect")
  static let shellTitle = value("terminal.shell.title", "Shell")
  static let shellOpen = value("terminal.shell.open", "Open Shell")
  static let shellStart = value("terminal.shell.start", "Start Shell")
  static let shellStarting = value("terminal.shell.starting", "Starting the shell…")
  static let shellRetry = value("terminal.shell.retry", "Start Again")
  static let shellIdle = value(
    "terminal.shell.idle",
    "Start a shell on the desktop in this folder."
  )
  static let close = value("terminal.close", "Close Terminal")
  static let closeTitle = value("terminal.close.title", "Close this terminal?")
  static let closeMessage = value(
    "terminal.close.message", "The running terminal process will be stopped."
  )
  static let cancel = value("terminal.cancel", "Cancel")
  static let readOnly = value("terminal.read_only", "This session is read-only.")
  static let empty = value("terminal.empty", "Waiting for terminal output…")
  static let connecting = value("terminal.status.connecting", "Connecting…")
  static let reconnecting = value("terminal.status.reconnecting", "Reconnecting…")
  static let connected = value("terminal.status.connected", "Connected")
  static let disconnected = value("terminal.status.disconnected", "Disconnected")
  static let failed = value("terminal.status.failed", "Terminal connection unavailable")
  static let exited = value("terminal.status.exited", "Process exited")

  static func exited(code: Int) -> String {
    String(
      format: value("terminal.status.exited.code", "Process exited (%lld)"),
      locale: .autoupdatingCurrent,
      code
    )
  }

  static func status(
    _ lifecycle: RichChatTerminalLifecycle,
    connection: RichChatTerminalConnectionState,
    exit: RichChatTerminalExit? = nil
  ) -> String {
    if let exit {
      return exit.exitCode.map { exited(code: $0) } ?? exited
    }
    switch lifecycle {
    case .inactive: return disconnected
    case .starting: return connection == .connecting ? connecting : reconnecting
    case .watching: return connected
    case .watchFailed: return failed
    }
  }
}
