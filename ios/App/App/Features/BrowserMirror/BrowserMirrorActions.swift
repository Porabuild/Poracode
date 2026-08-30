import Foundation

enum BrowserMirrorAddressNormalizer {
  private static let webSchemePattern = #"^[A-Za-z]+://"#
  private static let localHostPattern =
    #"^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[(?:[0-9a-f:]+)\])(?::\d+)?(?:[/?#]|$)"#
  private static let searchQueryAllowed = CharacterSet(
    charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"
  )

  /// Matches the compact PWA omnibox contract: explicit URLs pass through,
  /// local development addresses use HTTP, and ordinary words become a search.
  static func normalize(_ input: String) -> String {
    let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return "" }

    if trimmed.range(of: webSchemePattern, options: .regularExpression) != nil
      || trimmed.lowercased().hasPrefix("about:")
    {
      return trimmed
    }
    if trimmed.range(
      of: localHostPattern,
      options: [.regularExpression, .caseInsensitive]
    ) != nil {
      return "http://\(trimmed)"
    }
    if trimmed.rangeOfCharacter(from: .whitespacesAndNewlines) != nil
      || !trimmed.contains(".")
    {
      let query = trimmed.addingPercentEncoding(withAllowedCharacters: searchQueryAllowed) ?? ""
      return "https://duckduckgo.com/?q=\(query)"
    }
    return "https://\(trimmed)"
  }
}

enum BrowserMirrorUIAction: Equatable, Sendable {
  static let newTabHomeURL = "https://duckduckgo.com"

  case createTab
  case closeTab(String)
  case activateTab(String)
  case moveTab(String, target: String, position: BrowserMirrorMovePosition)
  case navigate(String)
  case back
  case forward
  case reload

  func command(in state: BrowserMirrorState) -> BrowserMirrorCommand? {
    switch self {
    case .createTab:
      return .createTab(url: Self.newTabHomeURL)
    case .closeTab(let tabId):
      return .closeTab(tabId: tabId)
    case .activateTab(let tabId):
      return .activateTab(tabId: tabId)
    case .moveTab(let tabId, let target, let position):
      return .moveTab(tabId: tabId, targetTabId: target, position: position)
    case .navigate(let url):
      let normalized = BrowserMirrorAddressNormalizer.normalize(url)
      guard let tabId = state.activeTabId, !normalized.isEmpty else { return nil }
      return .navigate(tabId: tabId, url: normalized)
    case .back:
      guard let tab = state.activeTab, tab.canGoBack else { return nil }
      return .back(tabId: tab.tabId)
    case .forward:
      guard let tab = state.activeTab, tab.canGoForward else { return nil }
      return .forward(tabId: tab.tabId)
    case .reload:
      guard let tabId = state.activeTabId else { return nil }
      return .reload(tabId: tabId)
    }
  }
}
