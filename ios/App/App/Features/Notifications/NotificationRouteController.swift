import Foundation
import Observation

/// The session surface the route controller needs. Narrow seam so routing
/// policy stays deterministically testable without an AppSession composition.
@MainActor
protocol NotificationRouteSession: AnyObject {
  var selectedConnectionId: ClientConnectionID? { get }
  var hosts: [HostRecord] { get }
  var profile: ConnectionProfile? { get }
  var snapshot: RemoteShellSnapshot? { get }
  func switchHost(_ connectionId: ClientConnectionID) async
  func refreshSnapshot() async
}

extension AppSession: NotificationRouteSession {}

/// A cross-host tap awaiting explicit user confirmation. Carries only the
/// safe host display label — never endpoints, tokens, or raw identifiers.
struct NotificationHostSwitchRequest: Equatable, Sendable {
  var route: NotificationRoute
  var hostLabel: String
  var generation: UInt64
}

@MainActor
@Observable
final class NotificationRouteController {
  static let shared = NotificationRouteController()

  private weak var session: (any NotificationRouteSession)?
  private let navigation: NotificationNavigationCenter
  private var supersession = NotificationRouteSupersession()
  private var task: Task<Void, Never>?

  /// The cross-host tap awaiting explicit confirmation, if any. The route is
  /// retained here — never dropped — until it is confirmed, cancelled,
  /// superseded by a newer tap, or rejected by the background policy.
  private(set) var pendingHostSwitch: NotificationHostSwitchRequest?

  /// The currently selected host, or nil while no session is attached.
  var selectedConnectionId: ClientConnectionID? { session?.selectedConnectionId }

  init(navigation: NotificationNavigationCenter = .shared) {
    self.navigation = navigation
  }

  func attach(session: any NotificationRouteSession) {
    self.session = session
    if let pending = supersession.attach() {
      start(pending.route, generation: pending.generation)
    }
  }

  func submit(userInfo: [AnyHashable: Any]) {
    guard let route = NotificationPayloadParser.parse(userInfo: userInfo) else { return }
    submit(route)
  }

  func submit(url: URL) -> Bool {
    guard let route = NotificationPayloadParser.parse(url: url) else { return false }
    submit(route)
    return true
  }

  func submit(_ route: NotificationRoute) {
    let submittedGeneration = supersession.submit(route, attached: session != nil)
    task?.cancel()
    guard session != nil else {
      return
    }
    start(route, generation: submittedGeneration)
  }

  /// The user confirmed the pending cross-host tap. Re-validates the target
  /// (it may have been removed while the confirmation was visible) and only
  /// then switches hosts and opens the thread.
  func confirmPendingHostSwitch() {
    guard let pending = pendingHostSwitch, isCurrent(pending.generation) else { return }
    pendingHostSwitch = nil
    guard let session,
      session.hosts.contains(where: {
        $0.connectionId == pending.route.clientConnectionId
          && $0.desktopId == pending.route.desktopId
      })
    else { return }
    task?.cancel()
    task = Task { [weak self] in
      await self?.openOnRoutedHost(pending.route, generation: pending.generation)
    }
  }

  /// The user declined the pending cross-host tap. The route is dropped.
  func cancelPendingHostSwitch() {
    pendingHostSwitch = nil
  }

  /// Foreground policy mirrors the rest of the session: backgrounding is a
  /// cancellation. A confirmation left unanswered must never resume into a
  /// silent host switch later.
  func setForeground(_ foreground: Bool) {
    guard !foreground else { return }
    pendingHostSwitch = nil
  }

  /// Joins in-flight route work. Test hook only.
  func settleForTests() async {
    await task?.value
  }

  private func start(_ route: NotificationRoute, generation submittedGeneration: UInt64) {
    task = Task { [weak self] in
      await self?.resolve(route, generation: submittedGeneration)
    }
  }

  private func resolve(_ route: NotificationRoute, generation submittedGeneration: UInt64) async {
    pendingHostSwitch = nil
    guard let session,
      isCurrent(submittedGeneration),
      let host = session.hosts.first(where: { $0.connectionId == route.clientConnectionId }),
      host.desktopId == route.desktopId
    else { return }

    guard session.selectedConnectionId == route.clientConnectionId else {
      // Cross-host taps must be confirmed explicitly before switching hosts.
      pendingHostSwitch = NotificationHostSwitchRequest(
        route: route, hostLabel: host.label, generation: submittedGeneration)
      return
    }

    await openOnRoutedHost(route, generation: submittedGeneration)
  }

  private func openOnRoutedHost(
    _ route: NotificationRoute, generation submittedGeneration: UInt64
  ) async {
    guard let session else { return }
    if session.selectedConnectionId != route.clientConnectionId {
      await session.switchHost(route.clientConnectionId)
    }
    guard isCurrent(submittedGeneration), !Task.isCancelled,
      session.selectedConnectionId == route.clientConnectionId,
      session.profile?.desktopId == route.desktopId
    else { return }

    await session.refreshSnapshot()
    guard isCurrent(submittedGeneration), !Task.isCancelled,
      session.selectedConnectionId == route.clientConnectionId,
      let thread = session.snapshot?.threads.first(where: { $0.id == route.threadId })
    else { return }

    guard isCurrent(submittedGeneration), !Task.isCancelled else { return }
    navigation.publish(route: route, threadTitle: thread.title)
  }

  private func isCurrent(_ submittedGeneration: UInt64) -> Bool {
    supersession.isCurrent(submittedGeneration)
  }
}

struct NotificationRouteSupersession {
  private(set) var generation: UInt64 = 0
  private var pending: NotificationRoute?

  mutating func submit(_ route: NotificationRoute, attached: Bool) -> UInt64 {
    generation &+= 1
    pending = attached ? nil : route
    return generation
  }

  mutating func attach() -> (route: NotificationRoute, generation: UInt64)? {
    guard let pending else { return nil }
    self.pending = nil
    return (pending, generation)
  }

  func isCurrent(_ candidate: UInt64) -> Bool { candidate == generation }
}
