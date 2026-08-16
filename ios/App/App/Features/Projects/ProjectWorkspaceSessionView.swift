import Observation
import SwiftUI

/// Keeps the workspace transport and its visible controllers on one exact
/// host/project/location generation. The gateway reads this source again after
/// every suspension, so a host switch or project relocation invalidates stale work.
@MainActor
@Observable
final class ProjectWorkspaceSelectionSource {
  @ObservationIgnored private weak var session: AppSession?
  private(set) var identity: ProjectIdentity
  private(set) var location: ProjectLocation
  private(set) var projectGeneration: UInt64 = 1

  init(session: AppSession, identity: ProjectIdentity, location: ProjectLocation) {
    self.session = session
    self.identity = identity
    self.location = location
  }

  func synchronize(identity: ProjectIdentity, location: ProjectLocation) {
    guard self.identity != identity || self.location != location else { return }
    self.identity = identity
    self.location = location
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
      currentProject.location == location
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

    let location = GitHubProjectLocation(self.location)
    let foreground = !session.state.liveLifecycle.isInBackground
    return GitHubControllerContext(
      lease: GitHubProjectLease(
        clientConnectionId: identity.connectionId.uuid,
        desktopId: profile.desktopId,
        hostGeneration: base.lease.hostLease.generation,
        project: GitHubProjectIdentity(projectId: identity.projectId, location: location),
        projectGeneration: projectGeneration
      ),
      grantedScopes: Set(profile.scopes).intersection(record.scopes),
      isOnline: base.session.isOnline,
      isReady: base.session.isReady,
      isForeground: foreground
    )
  }
}

private struct ProjectWorkspaceSessionID: Hashable {
  let identity: ProjectIdentity
  let location: ProjectLocation
}

enum ProjectWorkspaceEntryPoint: Hashable, Sendable {
  case workspace(ProjectWorkspaceMode)
  case gitHubActions
}

/// Production composition boundary for the project workspace. Controllers are
/// retained for the lifetime of this destination rather than recreated by view updates.
struct ProjectWorkspaceSessionView: View {
  @Environment(\.scenePhase) private var scenePhase

  @Bindable var session: AppSession
  let identity: ProjectIdentity
  let location: ProjectLocation
  let entryPoint: ProjectWorkspaceEntryPoint

  @State private var source: ProjectWorkspaceSelectionSource
  @State private var fileController: ProjectFileWorkspaceController
  @State private var gitController: ProjectGitReadController
  @State private var gitOperationsController: GitOperationsController
  @State private var gitHubOperationsControllers: GitHubOperationsControllerSuite
  @State private var reviewController: ProjectReviewInterestController

  init(
    session: AppSession,
    identity: ProjectIdentity,
    location: ProjectLocation,
    entryPoint: ProjectWorkspaceEntryPoint = .workspace(.files)
  ) {
    self.session = session
    self.identity = identity
    self.location = location
    self.entryPoint = entryPoint

    let source = ProjectWorkspaceSelectionSource(
      session: session,
      identity: identity,
      location: location
    )
    let gateway = SelectedProjectWorkspaceGateway { @MainActor [weak source] in
      source?.selection
    }
    let gitOperationsGateway = SelectedGitOperationsGateway { @MainActor [weak source] in
      source?.gitOperationsSelection
    }
    let gitHubTransport = GitHubOperationsExactHostTransportSource(
      credentials: session.deps.hostCatalog,
      contextProvider: { @MainActor [weak source] in
        source?.gitHubOperationsContext
      }
    )
    let gitHubGateway = SelectedGitHubOperationsGateway(
      selectionResolver: { lease in
        try await gitHubTransport.selection(for: lease)
      }
    )
    _source = State(initialValue: source)
    _fileController = State(initialValue: ProjectFileWorkspaceController(gateway: gateway))
    _gitController = State(initialValue: ProjectGitReadController(gateway: gateway))
    _gitOperationsController = State(
      initialValue: GitOperationsController(gateway: gitOperationsGateway)
    )
    _gitHubOperationsControllers = State(
      initialValue: GitHubOperationsControllerSuite(gateway: gitHubGateway)
    )
    _reviewController = State(
      initialValue: ProjectReviewInterestController(
        session: session,
        contextProvider: { @MainActor [weak source] in source?.reviewContext }
      )
    )
  }

  var body: some View {
    content
      .task(id: ProjectWorkspaceSessionID(identity: identity, location: location)) {
        gitOperationsController.deactivate()
        gitHubOperationsControllers.deactivate()
        reviewController.release()
        source.synchronize(identity: identity, location: location)
        synchronizeGitOperationsOwnership()
        synchronizeGitHubOperationsOwnership()
      }
      .task(id: ProjectWorkspaceActivationID(source.gitOperationsContext)) {
        synchronizeGitOperationsOwnership()
      }
      .task(id: GitHubOperationsActivationID(source.gitHubOperationsContext)) {
        synchronizeGitHubOperationsOwnership()
      }
      .onChange(of: scenePhase) { _, phase in
        switch phase {
        case .background:
          gitOperationsController.enterBackground()
          gitHubOperationsControllers.enterBackground()
          reviewController.release()
        case .active:
          synchronizeGitOperationsOwnership()
          synchronizeGitHubOperationsOwnership()
        case .inactive:
          break
        @unknown default:
          gitOperationsController.enterBackground()
          gitHubOperationsControllers.enterBackground()
          reviewController.release()
        }
      }
      .onDisappear {
        gitOperationsController.deactivate()
        gitHubOperationsControllers.deactivate()
        reviewController.release()
      }
  }

  @ViewBuilder
  private var content: some View {
    switch entryPoint {
    case .workspace(let initialMode):
      ProjectWorkspaceView(
        context: source.context,
        fileController: fileController,
        gitController: gitController,
        gitOperationsContext: source.gitOperationsContext,
        gitOperationsController: gitOperationsController,
        gitHubOperationsContext: source.gitHubOperationsContext,
        gitHubOperationsControllers: gitHubOperationsControllers,
        reviewDestination: reviewDestination,
        initialMode: initialMode
      )
    case .gitHubActions:
      GitHubOperationsPanel(
        context: source.gitHubOperationsContext,
        controllers: gitHubOperationsControllers
      )
    }
  }

  /// The review surface is offered only for a consistent host/project lease; the
  /// pushed view then owns its own claim and release.
  private var reviewDestination: ProjectReviewDetailsView? {
    guard source.reviewContext != nil else { return nil }
    return ProjectReviewDetailsView(
      session: session,
      controller: reviewController,
      projectId: identity.projectId
    )
  }

  private func synchronizeGitOperationsOwnership() {
    guard scenePhase != .background, let context = source.gitOperationsContext else {
      gitOperationsController.deactivate()
      return
    }
    if gitOperationsController.state.context?.lease == context.lease {
      gitOperationsController.leaveBackground(context)
    } else {
      gitOperationsController.activate(context)
    }
  }

  private func synchronizeGitHubOperationsOwnership() {
    guard scenePhase != .background, let context = source.gitHubOperationsContext,
      context.isUsable
    else {
      gitHubOperationsControllers.deactivate()
      return
    }
    gitHubOperationsControllers.leaveBackground(context)
  }
}
