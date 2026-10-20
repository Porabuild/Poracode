import Foundation

enum RichChatMessageActionStrings {
  static let forkAction = localized("rich.fork.action", "Fork from here")
  static let forkTitle = localized("rich.fork.title", "Fork thread")
  static let forkCreate = localized("rich.fork.create", "Create fork")
  static let forkExplanation = localized("rich.fork.explanation", "Creates an independent conversation through a completed turn. Files stay in the same checkout.")
  static let forkName = localized("rich.fork.name", "Thread name")
  static let forkBoundary = localized("rich.fork.boundary", "Inherited history ends here")
  static let sourceUnavailable = localized("rich.fork.sourceUnavailable", "The source conversation is unavailable.")
  private static let forkSourceFormat = localized("rich.fork.source", "Forked from %@")
  static func forkSource(_ title: String) -> String {
    String(format: forkSourceFormat, locale: .current, title)
  }
  static let copy = localized("rich.message.copy", "Copy Message")
  static let copyImage = localized("rich.image.copy", "Copy Image")
  static let shareImage = localized("rich.image.share", "Share Image")
  static let imagePreview = localized("rich.image.preview", "Image Preview")
  static let openImagePreview = localized(
    "rich.image.preview.open",
    "Open Image Preview"
  )
  static let closeImagePreview = localized(
    "rich.image.preview.close",
    "Close Image Preview"
  )
  private static let workedForFormat = localized("rich.turn.workedFor", "Worked for %@")
  static let revertAction = localized(
    "rich.message.revert.action",
    "Revert to This Checkpoint"
  )
  static let revertTitle = localized("rich.message.revert.title", "Revert to checkpoint?")
  static let revertMessage = localized(
    "rich.message.revert.message",
    "This removes later messages and restores files when a checkpoint snapshot is available."
  )
  static let noFileCheckpoint = localized(
    "rich.message.revert.noFiles",
    "No file checkpoint is stored for this message."
  )
  static let sharedTreeOne = localized(
    "rich.message.revert.shared.one",
    "Another chat uses this same tree. File restore could overwrite that chat's changes."
  )
  private static let sharedTreeMany = localized(
    "rich.message.revert.shared.many",
    "%lld other chats use this same tree. File restore could overwrite their changes."
  )
  static let revert = localized("rich.message.revert.confirm", "Revert")

  static func sharedTreeWarning(_ count: Int) -> String {
    guard count != 1 else { return sharedTreeOne }
    return String(format: sharedTreeMany, locale: .current, Int64(count))
  }

  static func workedFor(_ duration: String) -> String {
    String(format: workedForFormat, locale: .current, duration)
  }

  private static func localized(_ key: String, _ fallback: String) -> String {
    Bundle.main.localizedString(forKey: key, value: fallback, table: "RichChatMessageActions")
  }
}
