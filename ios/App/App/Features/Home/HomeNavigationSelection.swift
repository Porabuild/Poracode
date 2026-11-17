import Observation

/// Window-owned UI intent. Connection work stays owned by AppSession; a newer
/// tap only retires presentation callbacks, not the selected host's connection.
@MainActor @Observable final class HomeNavigationSelection {
  private(set) var openingID: String?
  private var revision: UInt64 = 0

  func begin(_ id: String) -> UInt64 {
    revision &+= 1
    openingID = id
    return revision
  }

  func accept(_ ticket: UInt64) -> Bool {
    guard isCurrent(ticket) else { return false }
    openingID = nil
    return true
  }

  func isCurrent(_ ticket: UInt64) -> Bool { ticket == revision }

  func finish(_ ticket: UInt64) {
    guard ticket == revision else { return }
    openingID = nil
  }

  func invalidate() {
    revision &+= 1
    openingID = nil
  }
}
