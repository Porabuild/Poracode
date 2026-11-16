import Foundation

enum WorkflowActivityReadFailure: Error { case unavailable, staleOwner, invalidResponse }

/// Uses the existing authenticated workflow read. Every run resolves its own
/// connection; switching the selected desktop never reroutes a background read.
@MainActor final class WorkflowActivityGateway {
  typealias RichAPIFactory = @Sendable (String, String, RemoteEnvironmentContext?) throws -> any RichChatRemoteAPI
  private weak var session: AppSession?
  private let credentials: any AdvancedOperationsCredentialRepository
  private let makeAPI: AdvancedOperationsExactHostTransportSource.APIFactory
  private let makeRichAPI: RichAPIFactory

  init(session: AppSession, credentials: any AdvancedOperationsCredentialRepository,
    makeAPI: @escaping AdvancedOperationsExactHostTransportSource.APIFactory,
    makeRichAPI: @escaping RichAPIFactory = WorkflowActivityGateway.productionRichAPIFactory()) {
    self.session = session; self.credentials = credentials; self.makeAPI = makeAPI
    self.makeRichAPI = makeRichAPI
  }

  nonisolated static func productionRichAPIFactory() -> RichAPIFactory {
    { endpoint, credential, environment in
      GeneratedRichChatRemoteAPI(
        json: RemoteAPIClient(endpoint: endpoint, accessToken: credential, environment: environment),
        raw: RichChatRawHTTPClient(endpoint: endpoint, accessToken: credential,
          environmentAuthority: environment?.parentAuthorizationToken))
    }
  }

  func richSelection(owner: WorkflowActivityOwner) async throws -> RichChatTransportSelection? {
    let source = transportSource(owner: owner)
    guard let result = try await source.resolve(using: makeRichAPI), result.grantedScopes.contains(.sessionRead),
      session?.workflowBinding(for: owner) == result.binding else { return nil }
    return .init(access: .init(lease: .init(connectionID: owner.thread.connectionID,
      generation: result.binding.sessionGeneration), isOnline: true, isReady: true, capabilities: [.sessionRead]), api: result.api)
  }

  private func transportSource(owner: WorkflowActivityOwner) -> AdvancedOperationsExactHostTransportSource {
    .init(credentials: credentials,
      bindingProvider: { @MainActor [weak session] in session?.workflowBinding(for: owner) }, makeAPI: makeAPI)
  }

  func read(owner: WorkflowActivityOwner, reference: WorkflowRunReference, includeAgentChats: Bool = false) async throws -> AdvancedWorkflowGetRunResult {
    let response = try await call(owner: owner, request: .workflowGetRun(.init(
      manifestPath: reference.manifestPath, location: owner.location,
      includeAgentChats: includeAgentChats, transcriptDir: reference.transcriptDirectory)))
    guard case .workflowGetRun(let result) = response else { throw WorkflowActivityReadFailure.invalidResponse }
    return result
  }

  func readAgentChat(owner: WorkflowActivityOwner, reference: WorkflowRunReference,
    agentID: String, threadID: String, finished: Bool) async throws -> AdvancedWorkflowAgentChatResult {
    let response = try await call(owner: owner, request: .workflowAgentChat(.init(
      threadId: threadID, transcriptDir: reference.transcriptDirectory, agentId: agentID,
      agentFinished: finished, location: owner.location)))
    guard case .workflowAgentChat(let result) = response else { throw WorkflowActivityReadFailure.invalidResponse }
    return result
  }

  private func call(owner: WorkflowActivityOwner, request: AdvancedOperationRequest) async throws -> AdvancedOperationResult {
    let source = transportSource(owner: owner)
    guard let resolved = try await source.resolve(), resolved.grantedScopes.contains(.sessionRead) else {
      throw WorkflowActivityReadFailure.unavailable
    }
    let response = try await resolved.api.remoteCall(request)
    try Task.checkCancellation()
    guard session?.workflowBinding(for: owner) == resolved.binding else { throw WorkflowActivityReadFailure.staleOwner }
    return response
  }
}

/// Default testing seam. Pure session/view tests never open a real workflow
/// transport; explicit gateway tests provide their URLProtocol-backed factory.
struct UnavailableWorkflowRemoteAPI: AdvancedOperationsRemoteAPI {
  func remoteCall(_ request: AdvancedOperationRequest) async throws -> AdvancedOperationResult {
    throw WorkflowActivityReadFailure.unavailable
  }
}

extension AppSession {
  func workflowRichAccess(for owner: WorkflowActivityOwner) -> RichChatSessionAccess? {
    guard let binding = workflowBinding(for: owner), binding.profileScopes.contains(AdvancedOperationScope.sessionRead.rawValue) else { return nil }
    return .init(lease: .init(connectionID: owner.thread.connectionID, generation: binding.sessionGeneration),
      isOnline: true, isReady: true, capabilities: [.sessionRead])
  }

  func makeWorkflowRichGateway(owner: WorkflowActivityOwner) -> SelectedRichChatSessionGateway {
    let gateway = makeWorkflowViewerGateway()
    return SelectedRichChatSessionGateway { try? await gateway.richSelection(owner: owner) }
  }

  func makeWorkflowViewerGateway() -> WorkflowActivityGateway {
    WorkflowActivityGateway(session: self, credentials: deps.hostCatalog, makeAPI: deps.makeWorkflowAPI)
  }

  var workflowActivity: WorkflowActivityStore {
    if let workflowActivityStore { return workflowActivityStore }
    let gateway = WorkflowActivityGateway(session: self, credentials: deps.hostCatalog,
      makeAPI: deps.makeWorkflowAPI)
    let store = WorkflowActivityStore(isCurrent: { [weak self] in self?.workflowOwnerIsCurrent($0) == true },
      read: { owner, reference in try await gateway.read(owner: owner, reference: reference) })
    if state.liveLifecycle.isInBackground { store.pause() }
    workflowActivityStore = store
    return store
  }

  func workflowOwner(connectionID: ClientConnectionID, threadID: String, location: ProjectLocation) -> WorkflowActivityOwner? {
    guard let record = state.hosts.first(where: { $0.connectionId == connectionID }) else { return nil }
    let owner = WorkflowActivityOwner(thread: .init(connectionID: connectionID, threadID: threadID),
      authorityID: workflowAuthorityID(record), location: location)
    return workflowOwnerIsCurrent(owner) ? owner : nil
  }

  func workflowOwnerIsCurrent(_ owner: WorkflowActivityOwner) -> Bool {
    guard let record = state.hosts.first(where: { $0.connectionId == owner.thread.connectionID }) else { return false }
    return record.protocolVersion == ProtocolConstants.remoteProtocolVersion
      && record.scopes.contains(AdvancedOperationScope.sessionRead.rawValue)
      && workflowAuthorityID(record) == owner.authorityID
  }

  func workflowBinding(for owner: WorkflowActivityOwner) -> AdvancedOperationsHostBinding? {
    guard !state.liveLifecycle.isInBackground, workflowOwnerIsCurrent(owner),
      let record = state.hosts.first(where: { $0.connectionId == owner.thread.connectionID }),
      let lease = sessionPool.lease(for: .host(record.connectionId)), sessionPool.isValid(lease) else { return nil }
    let online = state.selectedConnectionId == record.connectionId
      ? (state.phase == .ready && state.socketState == .online)
      : state.hostSocketStates[record.connectionId] == .online
    guard online else { return nil }
    var scopes = Set(record.scopes)
    if state.selectedConnectionId == record.connectionId {
      guard let profile = state.profile, profile.desktopId == record.desktopId,
        profile.httpBaseURL == record.httpBaseURL, profile.protocolVersion == record.protocolVersion else { return nil }
      scopes.formIntersection(profile.scopes)
    }
    return .init(host: .init(connectionID: record.connectionId, desktopID: record.desktopId),
      sessionID: AdvancedOperationsSessionIdentity.make(connectionID: record.connectionId,
        desktopID: record.desktopId, endpoint: record.httpBaseURL,
        protocolVersion: record.protocolVersion, generation: lease.generation),
      sessionGeneration: lease.generation, endpoint: record.httpBaseURL,
      protocolVersion: record.protocolVersion, profileScopes: scopes)
  }

  private func workflowAuthorityID(_ record: HostRecord) -> UUID {
    AdvancedOperationsSessionIdentity.make(connectionID: record.connectionId, desktopID: record.desktopId,
      endpoint: record.httpBaseURL, protocolVersion: record.protocolVersion, generation: 0)
  }
}
