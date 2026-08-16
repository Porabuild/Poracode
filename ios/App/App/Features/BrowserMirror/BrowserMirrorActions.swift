import Foundation

enum BrowserMirrorUIAction: Equatable, Sendable {
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
      return .createTab(url: nil)
    case .closeTab(let tabId):
      return .closeTab(tabId: tabId)
    case .activateTab(let tabId):
      return .activateTab(tabId: tabId)
    case .moveTab(let tabId, let target, let position):
      return .moveTab(tabId: tabId, targetTabId: target, position: position)
    case .navigate(let url):
      guard let tabId = state.activeTabId, !url.isEmpty else { return nil }
      return .navigate(tabId: tabId, url: url)
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
