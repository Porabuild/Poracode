import Foundation

enum ArchivedThreadsStrings {
  static let title = localized("archived.threads.title", "Archived Threads")
  static let description = localized(
    "archived.threads.description",
    "Restore or permanently delete archived threads."
  )
  static let empty = localized("archived.threads.empty", "No archived threads.")

  private static func localized(_ key: String, _ fallback: String) -> String {
    Bundle.main.localizedString(forKey: key, value: fallback, table: "ArchivedThreads")
  }
}
