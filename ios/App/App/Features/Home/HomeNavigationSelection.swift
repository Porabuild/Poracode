import Observation

/// Window-owned UI intent. Connection work stays owned by AppSession; a newer
/// tap only retires presentation callbacks, not the selected host's connection.
@MainActor @Observable final class HomeNavigationSelection {
  private(set) var openingID: String?
  private var revision: UInt64 = 0
  private var recentThreads: [String] = []
  @ObservationIgnored private var recentCycle: [String] = []
  @ObservationIgnored private var expectedCycleThread: String?

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

  func viewThread(_ id: String?) {
    // A cross-host selection can clear the old page before presenting the
    // exact thread requested by the in-flight keyboard cycle.
    if id == nil, let openingID, openingID == expectedCycleThread { return }
    if id != expectedCycleThread {
      recentCycle = []
      expectedCycleThread = nil
    }
    guard let id, recentThreads.first != id else { return }
    recentThreads.removeAll { $0 == id }
    recentThreads.insert(id, at: 0)
  }

  func hasRecentThread(otherThan current: String, visible: Set<String>) -> Bool {
    visible.contains(current) && recentThreads.contains { $0 != current && visible.contains($0) }
  }

  func cycleRecentThread(from current: String, visible: Set<String>, direction: HomeThreadStep) -> String? {
    // Freeze recency while cycling so revisiting a thread does not move it past the cursor.
    if expectedCycleThread != current || !recentCycle.allSatisfy(visible.contains) {
      recentCycle = recentThreads.filter(visible.contains)
    }
    let target = direction.target(in: recentCycle, from: current)
    expectedCycleThread = target
    return target
  }
}

enum HomeThreadStep: Int {
  case next = 1
  case previous = -1

  func target<Item: Equatable>(in order: [Item], from current: Item) -> Item? {
    guard order.count > 1, let index = order.firstIndex(of: current) else { return nil }
    return order[(index + rawValue + order.count) % order.count]
  }
}

struct HomeThreadCompletion: Equatable {
  let id: CompositeRemoteID
  let isDone: Bool

  func becameDone(after previous: Self?) -> Bool {
    isDone && previous?.id == id && previous?.isDone == false
  }
}
