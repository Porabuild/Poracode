import Foundation

/// Native menu capabilities. Provider leaves own wire IDs and payload formats.
enum RichChatSessionActionPanelKind: Hashable, Sendable, Identifiable {
  case reviseCommand
  case listRules
  var id: Self { self }
}

struct RichChatSessionActionForm: Sendable {
  var command = ""
  var note = ""
}

struct RichChatSessionActionEntryTarget: Equatable, Sendable {
  let actionID: String
  let panel: RichChatSessionActionPanelKind
}

struct RichChatRuleEntryView: Equatable, Sendable {
  let name: String
  let path: String
  let details: [String]
}

struct RichChatSessionActionDecodeError: Error {}

protocol RichChatSessionActionContributor: Sendable {
  func presents(agentKind: String) -> Bool
  func panel(for actionID: String) -> RichChatSessionActionPanelKind?
  func payload(for panel: RichChatSessionActionPanelKind, form: RichChatSessionActionForm)
    -> [String: RichJSON]
  func ruleEntries(in result: [String: RichJSON]) throws -> [RichChatRuleEntryView]
  func reviseSuggestion(in result: [String: RichJSON]) -> String?
}

extension RichChatSessionActionContributor {
  func entries(inventory: [String]) -> [RichChatSessionActionEntryTarget] {
    var seen = Set<RichChatSessionActionPanelKind>()
    return inventory.compactMap { id in
      guard let panel = panel(for: id), seen.insert(panel).inserted else { return nil }
      return RichChatSessionActionEntryTarget(actionID: id, panel: panel)
    }
  }
}
