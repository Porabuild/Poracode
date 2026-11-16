import Foundation

/// The one modal the home surface can be showing.
///
/// Separate booleans allowed two presentations to be requested in the same
/// update, which SwiftUI resolves by dropping one of them. A single
/// identifiable destination makes the presentation state exclusive by
/// construction, so adding entries cannot reintroduce that race.
enum HomeSheetDestination: Identifiable, Hashable, Sendable {
  case search
  case more
  case connections
  case workspaces
  case pullRequests
  case githubActions
  case schedules
  case projectManagement
  case terminal
  case usage
  case settings
  case remoteIntegrations
  case browserMirror
  /// Carries the lease that was current when the entry was tapped, so the
  /// presentation binds to that exact host rather than re-reading selection.
  case portForwarding(lease: PortForwardingHostLease)

  var id: String {
    switch self {
    case .search: "search"
    case .more: "more"
    case .connections: "connections"
    case .workspaces: "workspaces"
    case .pullRequests: "pullRequests"
    case .githubActions: "githubActions"
    case .schedules: "schedules"
    case .projectManagement: "projectManagement"
    case .terminal: "terminal"
    case .usage: "usage"
    case .settings: "settings"
    case .remoteIntegrations: "remoteIntegrations"
    case .browserMirror: "browserMirror"
    case .portForwarding(let lease):
      "portForwarding:\(lease.connectionID.rawValue):\(lease.connectionGeneration)"
    }
  }
}
