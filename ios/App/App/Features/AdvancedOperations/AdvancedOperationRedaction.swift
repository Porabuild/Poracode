import Foundation

/// Shared redaction rules for anything the feature is allowed to display.
///
/// Nothing here ever formats a server body, an error description, or file
/// content that was not the explicitly requested result.
enum AdvancedOperationRedaction {
  static let maximumPathLength = 96
  static let maximumPreviewLength = 240
  static let maximumListedPaths = 20
  static let shortCommitLength = 12

  /// Keeps the trailing components of a location and marks the elision.
  /// POSIX, Windows, and WSL separators are all preserved as written.
  static func path(_ value: String) -> String {
    guard value.count > maximumPathLength else { return value }
    let separator: Character = value.contains("\\") && !value.contains("/") ? "\\" : "/"
    let components = value.split(separator: separator, omittingEmptySubsequences: false)
    if components.count > 2 {
      let tail = components.suffix(2).joined(separator: String(separator))
      if tail.count <= maximumPathLength {
        return AdvancedOperationsStrings.elision + String(separator) + tail
      }
    }
    return AdvancedOperationsStrings.elision + String(value.suffix(maximumPathLength))
  }

  /// Bounded preview of content the user explicitly asked to read.
  static func preview(_ value: String) -> String {
    guard value.count > maximumPreviewLength else { return value }
    return String(value.prefix(maximumPreviewLength)) + AdvancedOperationsStrings.elision
  }

  static func commit(_ value: String) -> String {
    String(value.prefix(shortCommitLength))
  }

  static func timestamp(_ milliseconds: Double) -> String {
    guard milliseconds.isFinite, milliseconds >= 0 else { return AdvancedOperationsStrings.unknown }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    return formatter.string(from: Date(timeIntervalSince1970: milliseconds / 1000))
  }

  static func count(_ value: Int) -> String {
    String(value)
  }

  static func count(_ value: Int64?) -> String {
    value.map(String.init) ?? AdvancedOperationsStrings.unknown
  }

  /// Describes a location without leaking its full path.
  static func location(_ value: ProjectLocation) -> String {
    switch value {
    case .posix: AdvancedOperationsStrings.locationPosix(path(value.displayPath))
    case .windows: AdvancedOperationsStrings.locationWindows(path(value.displayPath))
    case .wsl(let distro, let linuxPath, _, _):
      AdvancedOperationsStrings.locationWSL(distro, path(linuxPath))
    }
  }
}
