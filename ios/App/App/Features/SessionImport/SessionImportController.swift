import Foundation
import Observation

@MainActor @Observable
final class SessionImportController {
  private(set) var lease: SettingsHostLease?
  private(set) var listing: SessionImportListing?
  private(set) var isLoading = false
  private(set) var isImporting = false
  private(set) var failure: SessionImportFailure?
  private(set) var completed = false
  var selected = Set<String>()
  private(set) var importedThreadIDs: [String: String] = [:]
  @ObservationIgnored private let gateway: any SessionImportGateway
  @ObservationIgnored private let claims: SessionImportClaims
  @ObservationIgnored private var revision: UInt64 = 0

  init(gateway: any SessionImportGateway, claims: SessionImportClaims) {
    self.gateway = gateway
    self.claims = claims
  }

  func activate(_ lease: SettingsHostLease?) {
    guard self.lease != lease else { return }
    revision &+= 1
    self.lease = lease
    listing = nil
    isLoading = false
    isImporting = false
    failure = nil
    completed = false
    selected.removeAll()
    importedThreadIDs.removeAll()
  }

  func load(_ filter: SessionImportFilter) async {
    guard let lease else { return }
    revision &+= 1
    let request = revision
    isLoading = true
    failure = nil
    do {
      let result = try await gateway.list(filter.normalized, lease: lease)
      try Task.checkCancellation()
      guard self.lease == lease, revision == request else { return }
      if result.superseded != true {
        listing = result
        selected.formIntersection(result.sessions.map(\.id))
      } else { failure = .unavailable(.notReady) }
    } catch is CancellationError {
    } catch {
      guard self.lease == lease, revision == request else { return }
      failure = Self.failure(error)
    }
    if self.lease == lease, revision == request { isLoading = false }
  }

  func importSelected(projects: [RemoteProject], fallbackProjectID: String,
    threads: [RemoteThread], agents: [AgentStatusRecord],
    refresh: @escaping @MainActor () async -> Void
  ) async {
    guard !isImporting, let lease, let listing else { return }
    let chosen = listing.sessions.filter { selected.contains($0.id) }
    guard !chosen.isEmpty else { return }
    isImporting = true
    failure = nil
    completed = false
    var successes: [String: String] = [:]
    var lastFailure: SessionImportFailure?
    for item in chosen {
      guard self.lease == lease else { break }
      if let existing = SessionImportPresentation.importedThread(item, threads: threads) ?? importedThreadIDs[item.id] {
        successes[item.id] = existing
        continue
      }
      let project = projects.first { item.cwdExists && $0.location.hostPath == item.cwd }
        ?? projects.first { $0.id == fallbackProjectID && $0.id != RemoteProject.homeScopeID }
      guard (item.cwdExists && SessionImportPresentation.nonEmpty(item.cwd) != nil) || project != nil else {
        lastFailure = .missingProject
        continue
      }
      guard let model = SessionImportPresentation.model(item, project: project, agents: agents) else {
        lastFailure = .missingModel
        continue
      }
      do {
        let gateway = gateway
        let threadID = try await claims.run(key: .init(connectionID: lease.connectionID, path: item.path)) { id in
          var projectID = project?.id
          if item.cwdExists, let cwd = SessionImportPresentation.nonEmpty(item.cwd) {
            projectID = try await gateway.register(path: cwd, lease: lease).id
          }
          guard let projectID else { throw SessionImportFailure.missingProject }
          let command = SessionImportCommand(projectId: projectID, agentKind: item.agentKind,
            model: model, title: SessionImportPresentation.title(item), path: item.path,
            providerSessionId: item.providerSessionId)
          try await gateway.importSession(command, threadID: id, lease: lease)
        }
        successes[item.id] = threadID
      } catch is CancellationError { break }
      catch { lastFailure = Self.failure(error) }
    }
    if !successes.isEmpty { await refresh() }
    guard self.lease == lease else { return }
    importedThreadIDs.merge(successes) { _, current in current }
    selected.subtract(successes.keys)
    isImporting = false
    failure = lastFailure
    completed = !successes.isEmpty && lastFailure == nil
  }

  private static func failure(_ error: any Error) -> SessionImportFailure {
    if let failure = error as? SessionImportFailure { return failure }
    if error is ProjectRemoteMutationError { return .ambiguousOutcome }
    return .unavailable(.transport)
  }
}
