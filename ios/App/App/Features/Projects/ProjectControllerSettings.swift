import Foundation
import Observation

@MainActor
@Observable
final class ProjectControllerSettingsController {
  private(set) var session: ProjectControllerSession?
  private(set) var settingsByProject: [ProjectIdentity: ProjectSettings] = [:]
  private(set) var loadStateByProject: [ProjectIdentity: ProjectControllerLoadState] = [:]

  private let gateway: any ProjectSessionGateway
  private var requestRevisionByProject: [ProjectIdentity: UInt64] = [:]

  init(gateway: any ProjectSessionGateway) {
    self.gateway = gateway
  }

  func activate(_ session: ProjectControllerSession) {
    if self.session?.lease != session.lease {
      for identity in Array(requestRevisionByProject.keys) {
        requestRevisionByProject[identity, default: 0] &+= 1
        if loadStateByProject[identity] == .loading {
          loadStateByProject[identity] = .idle
        }
      }
    }
    self.session = session
  }

  func cachedSettings(for identity: ProjectIdentity) -> ProjectSettings? {
    settingsByProject[identity]
  }

  func load(_ identity: ProjectIdentity) async {
    guard let session, session.lease.connectionId == identity.connectionId else { return }
    if let failure = session.gate(.projectsManage) {
      loadStateByProject[identity] = .failed(failure)
      return
    }

    let revision = nextRevision(for: identity)
    let lease = session.lease
    loadStateByProject[identity] = .loading
    do {
      let settings = try await gateway.loadProjectSettings(for: identity, lease: lease)
      guard owns(identity, revision: revision, lease: lease) else { return }
      settingsByProject[identity] = settings
      loadStateByProject[identity] = .loaded
    } catch is CancellationError {
      guard owns(identity, revision: revision, lease: lease) else { return }
      loadStateByProject[identity] = .idle
    } catch {
      guard owns(identity, revision: revision, lease: lease) else { return }
      loadStateByProject[identity] = .failed(.map(error))
    }
  }

  /// Called only for an event carrying the same captured host lease.
  func projectsDidChange(for lease: ProjectControllerHostLease) {
    guard session?.lease == lease else { return }
    let identities = Set(settingsByProject.keys)
      .union(loadStateByProject.keys)
      .union(requestRevisionByProject.keys)
      .filter { $0.connectionId == lease.connectionId }
    for identity in identities {
      settingsByProject.removeValue(forKey: identity)
      loadStateByProject[identity] = .idle
      requestRevisionByProject[identity, default: 0] &+= 1
    }
  }

  private func nextRevision(for identity: ProjectIdentity) -> UInt64 {
    requestRevisionByProject[identity, default: 0] &+= 1
    return requestRevisionByProject[identity, default: 0]
  }

  private func owns(
    _ identity: ProjectIdentity,
    revision: UInt64,
    lease: ProjectControllerHostLease
  ) -> Bool {
    session?.lease == lease
      && identity.connectionId == lease.connectionId
      && requestRevisionByProject[identity] == revision
  }
}
