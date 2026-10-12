import Foundation

/// Provider addresses are offered only when the live inventory advertises them.
enum DevinSessionActionID {
  static let revise = "devin.command.revise"
  static let rules = "devin.rules.list"
}

struct DevinSessionActionPanels: RichChatSessionActionContributor {
  func presents(agentKind: String) -> Bool {
    agentKind == "devin" || agentKind.hasPrefix("devin:")
  }

  func panel(for actionID: String) -> RichChatSessionActionPanelKind? {
    switch actionID {
    case DevinSessionActionID.revise: .reviseCommand
    case DevinSessionActionID.rules: .listRules
    default: nil
    }
  }

  func payload(
    for panel: RichChatSessionActionPanelKind,
    form: RichChatSessionActionForm
  ) -> [String: RichJSON] {
    switch panel {
    case .reviseCommand:
      var payload = ["command": RichJSON.string(form.command)]
      if !form.note.isEmpty { payload["note"] = RichJSON.string(form.note) }
      return payload
    case .listRules: return [:]
    }
  }

  func ruleEntries(in result: [String: RichJSON]) throws -> [RichChatRuleEntryView] {
    guard let entries = result["rules"]?.arrayValue else {
      throw RichChatSessionActionDecodeError()
    }
    return try entries.map { entry in
      guard let record = entry.objectValue,
        let name = record.string("name"), let path = record.string("path")
      else { throw RichChatSessionActionDecodeError() }
      return RichChatRuleEntryView(name: name, path: path, details: [])
    }
  }

  func reviseSuggestion(in result: [String: RichJSON]) -> String? {
    guard let suggested = result["command"]?.stringValue, !suggested.isEmpty else {
      return nil
    }
    return suggested
  }

}

extension [String: RichJSON] {
  fileprivate func string(_ key: String) -> String? {
    guard let value = self[key]?.stringValue, !value.isEmpty else { return nil }
    return value
  }
}
