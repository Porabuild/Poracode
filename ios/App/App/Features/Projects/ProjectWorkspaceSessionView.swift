import SwiftUI

/// Production composition boundary for the project workspace. Controllers are
/// retained for the lifetime of this destination rather than recreated by view updates.
struct ProjectWorkspaceSessionView: View {
  @Environment(\.scenePhase) private var scenePhase

  @Bindable var session: AppSession
  let identity: ProjectIdentity
  let location: ProjectLocation
  let workspaceLocation: ProjectLocation
  let originThreadID: String?
  let entryPoint: ProjectWorkspaceEntryPoint
  let initialFile: ProjectWorkspaceFileTarget?
  let showsModePicker: Bool
  let externalMode: Binding<ProjectWorkspaceMode>?
  let closeFromKeyboard: (() -> Void)?

  @State private var source: ProjectWorkspaceSelectionSource
  @State private var fileController: ProjectFileWorkspaceController
  @State private var gitController: ProjectGitReadController
  @State private var gitOperationsController: GitOperationsController
  @State private var gitHubOperationsControllers: GitHubOperationsControllerSuite
  // The Actions page starts its read task only after the suite owns this context.
  @State private var activeGitHubContext: GitHubControllerContext?
  @State private var reviewController: ProjectReviewInterestController
  @State private var prGenerationSource: AdvancedOperationsSelectionSource
  @State private var lifetime = ProjectWorkspaceSessionLifetime()
  @State private var prGenerationComposition: AdvancedOperationsComposition
  @State private var prGenerationTransport: AdvancedOperationsExactHostTransportSource
  private let settingsGateway: any SettingsSessionGateway

  init(
    session: AppSession,
    identity: ProjectIdentity,
    location: ProjectLocation,
    workspaceLocation: ProjectLocation? = nil,
    originThreadID: String? = nil,
    entryPoint: ProjectWorkspaceEntryPoint = .workspace(.files),
    initialFile: ProjectWorkspaceFileTarget? = nil,
    showsModePicker: Bool = true,
    externalMode: Binding<ProjectWorkspaceMode>? = nil,
    closeFromKeyboard: (() -> Void)? = nil
  ) {
    self.session = session
    self.identity = identity
    self.location = location
    self.workspaceLocation = workspaceLocation ?? location
    self.originThreadID = originThreadID
    self.entryPoint = entryPoint
    self.initialFile = initialFile
    self.showsModePicker = showsModePicker
    self.externalMode = externalMode
    self.closeFromKeyboard = closeFromKeyboard

    let source = ProjectWorkspaceSelectionSource(
      session: session,
      identity: identity,
      location: location,
      workspaceLocation: workspaceLocation
    )
    let gateway = SelectedProjectWorkspaceGateway { @MainActor [weak source] in source?.selection }
    let gitOperationsGateway = SelectedGitOperationsGateway { @MainActor [weak source] in
      source?.gitOperationsSelection
    }
    let gitHubTransport = GitHubOperationsExactHostTransportSource(
      credentials: session.deps.hostCatalog,
      contextProvider: { @MainActor [weak source] in source?.gitHubOperationsContext }
    )
    let gitHubGateway = SelectedGitHubOperationsGateway { lease in
      try await gitHubTransport.selection(for: lease)
    }
    let prGenerationSource = session.makeAdvancedOperationsSelectionSource(
      surface: .project(identity, expectedLocation: location)
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
    _prGenerationSource = State(initialValue: prGenerationSource)
    _prGenerationComposition = State(
      initialValue: session.makeAdvancedOperationsComposition(source: prGenerationSource)
    )
    _prGenerationTransport = State(
      initialValue: session.makeAdvancedOperationsTransportSource(source: prGenerationSource)
    )
    settingsGateway = session.makeSettingsSessionGateway()
  }

  var body: some View {
    content
      .task(
        id: ProjectWorkspaceSessionID(
          identity: identity,
          projectLocation: location,
          workspaceLocation: workspaceLocation
        )
      ) {
        // .task reruns on every reappearance; tear down only for a new session.
        let id = ProjectWorkspaceSessionID(
          identity: identity, projectLocation: location, workspaceLocation: workspaceLocation)
        if lifetime.sessionID != id {
          if lifetime.sessionID != nil {
            gitOperationsController.deactivate()
            gitHubOperationsControllers.deactivate()
            activeGitHubContext = nil
            reviewController.release()
          }
          lifetime.sessionID = id
        }
        source.synchronize(
          identity: identity,
          location: location,
          workspaceLocation: workspaceLocation
        )
        synchronizeGitOperationsOwnership()
        synchronizeGitHubOperationsOwnership()
      }
      .task(id: ProjectWorkspaceActivationID(source.gitOperationsContext)) {
        synchronizeGitOperationsOwnership()
      }
      .task(id: GitHubOperationsActivationID(source.gitHubOperationsContext)) {
        synchronizeGitHubOperationsOwnership()
      }
      .task(id: prGenerationSource.ownerKey) {
        prGenerationSource.synchronize()
        await resolvePrGenerationHost()
      }
      .task(id: prGenerationSource.binding) { await resolvePrGenerationHost() }
      .onChange(of: scenePhase) { _, phase in
        switch phase {
        case .background:
          gitOperationsController.enterBackground()
          gitHubOperationsControllers.enterBackground()
          activeGitHubContext = nil
          reviewController.release()
          prGenerationSource.enterBackground()
        case .active:
          synchronizeGitOperationsOwnership()
          synchronizeGitHubOperationsOwnership()
          prGenerationSource.leaveBackground()
        case .inactive:
          break
        @unknown default:
          gitOperationsController.enterBackground()
          gitHubOperationsControllers.enterBackground()
          activeGitHubContext = nil
          reviewController.release()
          prGenerationSource.enterBackground()
        }
      }
      // Not onDisappear: it also fires while a pushed child (the Git, GitHub
      // or review panel) covers this view, and deactivating there tore down
      // the very controller that panel drives. Release only when this view's
      // state is destroyed, and resynchronize whenever it is visible again.
      .onAppear {
        lifetime.release = {
          [gitOperationsController, gitHubOperationsControllers, reviewController, prGenerationSource] in
          gitOperationsController.deactivate()
          gitHubOperationsControllers.deactivate()
          reviewController.release()
          prGenerationSource.enterBackground()
        }
        synchronizeGitOperationsOwnership()
        synchronizeGitHubOperationsOwnership()
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
        enqueueReviewComment: enqueueReviewComment,
        generatePullRequestSummary: generatePullRequestSummary,
        initialMode: initialMode,
        initialFile: initialFile,
        linkedSocketOnline: initialFile == nil ? nil : session.socketState == .online,
        showsModePicker: showsModePicker,
        externalMode: externalMode,
        closeFromKeyboard: closeFromKeyboard
      )
    case .gitHubActions:
      GitHubActionsPageView(
        context: activeGitHubContext == source.gitHubOperationsContext ? activeGitHubContext : nil,
        workflows: gitHubOperationsControllers.workflows,
        mutations: gitHubOperationsControllers.workflowMutations
      )
    case .pullRequest(let route):
      PullRequestReviewPageView(
        context: source.gitHubOperationsContext,
        route: route,
        controller: gitHubOperationsControllers.pullRequests,
        mutations: gitHubOperationsControllers.pullRequestMutations,
        forge: gitHubOperationsControllers.forgeReview,
        guideWriters: PullRequestGuideView.writers(from: session.state.replay, location: workspaceLocation)
      )
    }
  }

  private var enqueueReviewComment: ((RichPromptSegment) -> Void)? {
    guard identity.connectionId == session.selectedConnectionId else { return nil }
    let expectedWorktreePath = workspaceLocation == location ? nil : workspaceLocation.displayPath
    guard
      let thread = ProjectReviewCommentThreadResolver.resolve(
        threads: session.snapshot?.threads ?? [],
        projectID: identity.projectId,
        worktreePath: expectedWorktreePath,
        originThreadID: originThreadID
      )
    else { return nil }
    let key = RichChatComposerDraftKey(
      connectionID: identity.connectionId,
      threadID: thread.id
    )
    return { segment in session.richChatComposerDrafts.enqueue(segment, for: key) }
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
      activeGitHubContext = nil
      return
    }
    gitHubOperationsControllers.leaveBackground(context)
    activeGitHubContext = context
  }

  private func resolvePrGenerationHost() async {
    prGenerationSource.invalidateHost()
    guard scenePhase != .background else { return }
    do {
      let resolved = try await prGenerationTransport.resolve()
      guard !Task.isCancelled else { return }
      prGenerationSource.adoptResolvedHost(resolved)
    } catch is CancellationError {
      return
    } catch {
      prGenerationSource.adoptResolvedHost(nil)
    }
  }

  private func generatePullRequestSummary(
    branch: String,
    baseBranch: String,
    lease: GitHubProjectLease
  ) async throws -> AdvancedGeneratedPrSummary {
    guard source.gitHubOperationsContext?.lease == lease else { throw CancellationError() }
    guard let access = prGenerationComposition.access(.generatePrSummary),
      access.isUsable,
      access.permits(.sessionOperate),
      case .projectLocation(let projectLocation) = access.lease.owner,
      let settingsSelection = session.currentSettingsHostSelection,
      settingsSelection.lease.connectionID == access.lease.host.connectionID,
      settingsSelection.lease.generation == access.lease.sessionGeneration
    else { throw AdvancedOperationFailure.invalidRequest }

    async let settingsResponse = settingsGateway.readSettings(lease: settingsSelection.lease)
    async let statusesResponse = settingsGateway.agentStatuses(lease: settingsSelection.lease)
    let (settingsEnvelope, statuses) = try await (settingsResponse, statusesResponse)
    guard source.gitHubOperationsContext?.lease == lease else { throw CancellationError() }
    let settings = settingsEnvelope.settings
    let candidates: [SettingsAgentStatus]
    if case .wsl = projectLocation {
      candidates = statuses.wsl
    } else {
      candidates = statuses.windows
    }
    let usable = candidates.filter { $0.installed && $0.authState == .authenticated }
    let requested = settings.commitGenProvider
    let agentKind =
      requested != "auto" && usable.contains(where: { $0.kind == requested })
      ? requested
      : usable.first?.kind
    guard let agentKind else { throw AdvancedOperationFailure.invalidRequest }

    let rawModel = settings.commitGenModel.trimmingCharacters(in: .whitespacesAndNewlines)
    let rawEffort = settings.commitGenEffort.trimmingCharacters(in: .whitespacesAndNewlines)
    let model = rawModel.isEmpty ? nil : rawModel
    let effort = rawEffort.isEmpty ? nil : rawEffort
    let selection =
      model != nil || effort != nil
      ? AdvancedModelSelection(model: model ?? "", effort: effort)
      : nil
    let request = AdvancedOperationRequest.generatePrSummary(
      .init(
        projectLocation: projectLocation,
        agentKind: agentKind,
        branch: branch,
        baseBranch: baseBranch,
        selection: selection,
        language: AIContentLanguagePreference.stored().modelLanguageName()
      )
    )
    let result = try await prGenerationComposition.gateway.call(request, lease: access.lease)
    guard case .generatedPrSummary(let summary) = result,
      !summary.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { throw AdvancedOperationFailure.invalidResponse }
    return summary
  }
}
