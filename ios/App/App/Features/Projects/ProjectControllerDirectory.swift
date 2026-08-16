import Foundation
import Observation

struct ProjectControllerDirectoryState: Equatable, Sendable {
  var lease: ProjectControllerHostLease?
  var requestedPath = ""
  var listing: BrowseHostDirectoryResult?
  var isLoading = false
  var failure: ProjectOperationFailure?
}

@MainActor
@Observable
final class ProjectControllerDirectoryController {
  private(set) var state = ProjectControllerDirectoryState()

  private let gateway: any ProjectSessionGateway
  private var session: ProjectControllerSession?
  private var navigationRevision: UInt64 = 0

  init(gateway: any ProjectSessionGateway) {
    self.gateway = gateway
  }

  func activate(_ session: ProjectControllerSession) {
    navigationRevision &+= 1
    self.session = session
    state = ProjectControllerDirectoryState(lease: session.lease)
  }

  func updateAccess(_ session: ProjectControllerSession) {
    guard self.session?.lease == session.lease else {
      activate(session)
      return
    }
    self.session = session
  }

  func navigate(to path: String) async {
    // Clear synchronously so a previous directory is never shown under a new path.
    state.requestedPath = path
    state.listing = nil
    state.failure = nil
    state.isLoading = false

    guard let session else { return }
    if let failure = session.gate(.projectsManage) {
      state.failure = failure
      return
    }

    navigationRevision &+= 1
    let revision = navigationRevision
    let lease = session.lease
    state.isLoading = true
    do {
      let result = try await gateway.browseHostDirectory(path: path, lease: lease)
      guard owns(revision: revision, lease: lease) else { return }
      // Host order, Unicode and the ::drives:: sentinel stay untouched.
      state.listing = result
      state.isLoading = false
    } catch is CancellationError {
      guard owns(revision: revision, lease: lease) else { return }
      state.isLoading = false
    } catch {
      guard owns(revision: revision, lease: lease) else { return }
      state.isLoading = false
      state.failure = .map(error)
      // Intentionally keep listing nil after a failed navigation.
    }
  }

  private func owns(revision: UInt64, lease: ProjectControllerHostLease) -> Bool {
    revision == navigationRevision && session?.lease == lease
  }
}
