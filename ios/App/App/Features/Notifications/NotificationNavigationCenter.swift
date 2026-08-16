import Observation

@MainActor
@Observable
final class NotificationNavigationCenter {
  static let shared = NotificationNavigationCenter()
  private(set) var event: NotificationNavigationEvent?
  private var sequence: UInt64 = 0

  func publish(route: NotificationRoute, threadTitle: String) {
    sequence &+= 1
    event = NotificationNavigationEvent(id: sequence, route: route, threadTitle: threadTitle)
  }
}
