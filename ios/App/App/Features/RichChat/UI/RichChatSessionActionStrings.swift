import SwiftUI

/// Localized copy for the neutral session-action panels.
enum RichChatSessionActionStrings {
  static let entryLabel = RichChatStrings.value(
    "rich_chat_session_actions", "Session actions")
  static let entryFailed = RichChatStrings.value(
    "rich_chat_session_actions_failed", "Session actions could not be loaded.")

  static let revise = RichChatStrings.value("rich_chat_session_action_revise", "Revise command")
  static let rules = RichChatStrings.value("rich_chat_session_action_rules", "Rules")

  static let reviseCommandField = RichChatStrings.value(
    "rich_chat_session_revise_command_field", "Command to revise")
  static let reviseNoteField = RichChatStrings.value(
    "rich_chat_session_revise_note_field", "What should change? (optional)")
  static let reviseSubmit = RichChatStrings.value(
    "rich_chat_session_revise_submit", "Get suggestion")
  static let reviseHint = RichChatStrings.value(
    "rich_chat_session_revise_hint",
    "The agent proposes a revised command; you review it before anything runs."
  )
  static let reviseResultTitle = RichChatStrings.value(
    "rich_chat_session_revise_result_title", "Suggested command — review before use")
  static let reviseInsert = RichChatStrings.value(
    "rich_chat_session_revise_insert", "Insert into composer")
  static let reviseDiscard = RichChatStrings.value("rich_chat_session_revise_discard", "Discard")
  static let reviseInsertHint = RichChatStrings.value(
    "rich_chat_session_revise_insert_hint",
    "Poracode never runs the suggestion — inserting only fills the composer for you to edit and send."
  )
  static let reviseEmpty = RichChatStrings.value(
    "rich_chat_session_revise_empty", "The agent did not return a revised command.")
  static let rulesTitle = RichChatStrings.value(
    "rich_chat_session_rules_title", "Rules in this session")
  static let rulesEmpty = RichChatStrings.value(
    "rich_chat_session_rules_empty", "No rules were listed for this session.")

  static let listingFailed = RichChatStrings.value(
    "rich_chat_session_listing_failed", "The listing could not be read.")

  static let done = SettingsUIStrings.done
  static let cancel = RichChatStrings.value("rich_chat_cancel", "Cancel")

  static func label(for panel: RichChatSessionActionPanelKind) -> String {
    switch panel {
    case .reviseCommand: revise
    case .listRules: rules
    }
  }
}
