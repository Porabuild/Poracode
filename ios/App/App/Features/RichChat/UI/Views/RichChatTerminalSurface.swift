import SwiftUI

/// Terminal presentation follows the same connecting/content split as chat.
struct RichChatTerminalSurface: View {
  let controller: RichChatTerminalController
  let terminalID: String
  let canOperate: Bool
  let isConnectingHost: Bool

  var body: some View {
    if isConnectingHost {
      LoadingStateView(message: ProjectWorkspaceStrings.connecting)
        .accessibilityIdentifier("native-e2e.thread-connecting")
    } else {
      RichTerminalView(controller: controller, terminalID: terminalID, canOperate: canOperate)
    }
  }
}
