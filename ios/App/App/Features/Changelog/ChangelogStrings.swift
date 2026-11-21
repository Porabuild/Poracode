import Foundation

enum ChangelogStrings {
  static var title: String { String(localized: "Changelog", table: "Changelog") }
  static var description: String { String(localized: "What's new in Poracode, newest first.", table: "Changelog") }
  static var loading: String { String(localized: "Loading release notes", table: "Changelog") }
  static var empty: String { String(localized: "Couldn't load the changelog.", table: "Changelog") }
  static var emptyBody: String { String(localized: "Check your connection, or view releases on GitHub.", table: "Changelog") }
  static var cached: String { String(localized: "Couldn't refresh. Showing saved release notes.", table: "Changelog") }
  static var allReleases: String { String(localized: "View all releases on GitHub", table: "Changelog") }

  static func kind(_ kind: ChangelogChange.Kind) -> String {
    switch kind {
    case .added: String(localized: "New", table: "Changelog")
    case .improved: String(localized: "Improved", table: "Changelog")
    case .fixed: String(localized: "Fixed", table: "Changelog")
    }
  }
}
