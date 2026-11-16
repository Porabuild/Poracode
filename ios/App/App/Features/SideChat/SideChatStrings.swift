import Foundation

enum SideChatStrings {
  static var title: String { String(localized: "Side chat", table: "SideChat") }
  static var contextUnavailable: String { String(localized: "Could not read the parent conversation. Your question was not sent.", table: "SideChat") }
  static var hostUpdate: String { String(localized: "Update the remote host to use side chat with private context.", table: "SideChat") }
  static var retry: String { String(localized: "Retry the original question", table: "SideChat") }
  static var uncertain: String { String(localized: "The result is uncertain. Retry sends the same question once.", table: "SideChat") }
  static var close: String { String(localized: "Close side chat", table: "SideChat") }
  static var newChat: String { String(localized: "Start a new side chat", table: "SideChat") }
  static var closeConfirmation: String { String(localized: "Close this side chat? The parent conversation stays open.", table: "SideChat") }
  static var switchedHost: String { String(localized: "Switch back to the source host to continue this side chat.", table: "SideChat") }
  static var ask: String { String(localized: "Ask in side chat", table: "SideChat") }
  static var removeQuote: String { String(localized: "Remove quoted text", table: "SideChat") }
  static var questionPrompt: String { String(localized: "Ask a side question", table: "SideChat") }
  static var parent: String { String(localized: "Parent conversation", table: "SideChat") }

  static func contextFailure(_ failure: SideChatContextFailure) -> String {
    switch failure {
    case .hostUpdateRequired: hostUpdate
    case .staleHost: switchedHost
    default: contextUnavailable
    }
  }
}
