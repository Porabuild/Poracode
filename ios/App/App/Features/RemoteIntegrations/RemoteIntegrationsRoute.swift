import Foundation

enum RemoteIntegrationsRoute: String, CaseIterable, Hashable, Identifiable, Sendable {
  case update
  case schedules
  case prWatches

  var id: Self { self }

  var readCapability: RemoteIntegrationsCapability {
    switch self {
    case .update: .projectsManage
    case .schedules, .prWatches: .sessionRead
    }
  }
}
