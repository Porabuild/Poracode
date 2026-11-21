import Observation

/// Keeps the workspace transport and its visible controllers on one exact
/// host/project/location generation. The gateway reads this source again after
/// every suspension, so a host switch or project relocation invalidates stale work.
@MainActor
@Observable
final class ProjectWorkspaceSelectionSource {
  @ObservationIgnored private weak var session: AppSession?
  private(set) var identity: ProjectIdentity
  private(set) var projectLocation: ProjectLocation
  private(set) var location: ProjectLocation
  private(set) var projectGeneration: UInt64 = 1

  init(
    session: AppSession,
    identity: ProjectIdentity,
    location: ProjectLocation,
    workspaceLocation: ProjectLocation? = nil
  ) {
    self.session = session
    self.identity = identity
    projectLocation = location
    self.location = workspaceLocation ?? location
  }

  func synchronize(
    identity: ProjectIdentity,
    location: ProjectLocation,
    workspaceLocation: ProjectLocation? = nil
  ) {
    let resolvedWorkspaceLocation = workspaceLocation ?? location
    guard
      self.identity != identity || projectLocation != location
        || self.location != resolvedWorkspaceLocation
    else { return }
    self.identity = identity
    projectLocation = location
    self.location = resolvedWorkspaceLocation
    projectGeneration &+= 1
    if projectGeneration == 0 { projectGeneration = 1 }
  }

  var context: ProjectWorkspaceContext? {
    guard let session,
      let controllerSession = session.currentProjectControllerSession,
      controllerSession.lease.connectionId == identity.connectionId,
      let currentProject = session.state.snapshot?.projects.first(where: {
        $0.id == identity.projectId
      }),
      currentProject.location == projectLocation
    else { return nil }

    return ProjectWorkspaceContext(
      session: controllerSession,
      lease: ProjectWorkspaceLease(
        hostLease: controllerSession.lease,
        project: identity,
        location: location,
        projectGeneration: projectGeneration
      )
    )
  }

  var selection: ProjectWorkspaceTransportSelection? {
    guard let session, let context,
      let client = (session.state.api as? RemoteAPIClientBox)?.client
    else { return nil }
    return ProjectWorkspaceTransportSelection(context: context, api: client)
  }

  /// Git mutations require the exact selected host record, foreground session,
  /// granted scopes, and authenticated production client in addition to the
  /// project/location lease used by the read-only workspace.
  var gitOperationsContext: ProjectWorkspaceContext? {
    guard let session, let base = context,
      let record = session.state.hosts.first(where: {
        $0.connectionId == identity.connectionId
      }),
      let profile = session.state.profile,
      profile.desktopId == record.desktopId,
      profile.httpBaseURL == record.httpBaseURL,
      profile.protocolVersion == record.protocolVersion
    else { return nil }

    let profileCapabilities = Set(
      profile.scopes.compactMap(ProjectControllerCapability.init(rawValue:))
    )
    let registryCapabilities = Set(
      record.scopes.compactMap(ProjectControllerCapability.init(rawValue:))
    )
    let isForeground = !session.state.liveLifecycle.isInBackground
    let access = ProjectControllerSession(
      lease: base.session.lease,
      isOnline: base.session.isOnline && isForeground,
      isReady: base.session.isReady && isForeground,
      capabilities: profileCapabilities.intersection(registryCapabilities)
    )
    return ProjectWorkspaceContext(session: access, lease: base.lease)
  }

  var gitOperationsSelection: GitOperationsTransportSelection? {
    guard let session, let context = gitOperationsContext,
      context.session.isOnline,
      context.session.isReady,
      session.state.selectedConnectionId == context.lease.hostLease.connectionId,
      UInt64(max(0, session.state.workGeneration)) == context.lease.hostLease.generation,
      let token = session.state.accessToken,
      !token.isEmpty,
      let client = (session.state.api as? RemoteAPIClientBox)?.client
    else { return nil }
    return GitOperationsTransportSelection(context: context, api: client)
  }

  /// Heavy-review ownership needs the exact selected host, both generations, the
  /// project identity, and a live readable session — nothing about the review
  /// bundle is derivable while offline or unpaired.
  var reviewContext: ProjectReviewContext? {
    guard let session, let base = context,
      session.state.selectedConnectionId == identity.connectionId
    else { return nil }
    return ProjectReviewContext(
      lease: ProjectReviewInterestLease(
        connectionId: identity.connectionId,
        hostGeneration: base.lease.hostLease.generation,
        projectId: identity.projectId,
        projectGeneration: projectGeneration
      ),
      isOnline: base.session.isOnline && !session.state.liveLifecycle.isInBackground,
      isReady: base.session.isReady,
      canRead: session.state.canRead
    )
  }

  /// GitHub ownership includes both stable host identities, host and project
  /// generations, the lossless project location, exact granted scopes, and live state.
  var gitHubOperationsContext: GitHubControllerContext? {
    guard let session, let base = context,
      session.state.selectedConnectionId == identity.connectionId,
      let record = session.state.hosts.first(where: {
        $0.connectionId == identity.connectionId
      }),
      let profile = session.state.profile,
      profile.desktopId == record.desktopId,
      profile.httpBaseURL == record.httpBaseURL,
      profile.protocolVersion == record.protocolVersion
    else { return nil }

    let foreground = !session.state.liveLifecycle.isInBackground
    return GitHubControllerContext(
      lease: GitHubProjectLease(
        clientConnectionId: identity.connectionId.uuid,
        desktopId: profile.desktopId,
        hostGeneration: base.lease.hostLease.generation,
        project: GitHubProjectIdentity(
          projectId: identity.projectId,
          location: GitHubProjectLocation(projectLocation)
        ),
        projectGeneration: projectGeneration
      ),
      grantedScopes: Set(profile.scopes).intersection(record.scopes),
      isOnline: base.session.isOnline,
      isReady: base.session.isReady,
      isForeground: foreground,
      cacheEndpoint: profile.httpBaseURL
    )
  }
}
