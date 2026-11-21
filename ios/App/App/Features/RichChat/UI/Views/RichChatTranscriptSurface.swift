import SwiftUI

typealias RichChatProjectFileOpener = @MainActor @Sendable (ProjectWorkspaceFileTarget) -> Void

private struct RichChatProjectLinkLocationKey: EnvironmentKey {
  static let defaultValue: ProjectLocation? = nil
}

private struct RichChatOpenProjectFileKey: EnvironmentKey {
  static let defaultValue: RichChatProjectFileOpener? = nil
}

extension EnvironmentValues {
  var richChatProjectLinkLocation: ProjectLocation? {
    get { self[RichChatProjectLinkLocationKey.self] }
    set { self[RichChatProjectLinkLocationKey.self] = newValue }
  }

  var richChatOpenProjectFile: RichChatProjectFileOpener? {
    get { self[RichChatOpenProjectFileKey.self] }
    set { self[RichChatOpenProjectFileKey.self] = newValue }
  }
}

struct RichChatSourceFileDestination: Identifiable, Hashable {
  let target: ProjectWorkspaceFileTarget
  let owner: ProjectIdentity
  let location: ProjectLocation
  let workspaceLocation: ProjectLocation
  var id: Self { self }
}

struct RichChatSourceFilePresentation: ViewModifier {
  let session: AppSession
  let threadID: String
  @Binding var destination: RichChatSourceFileDestination?

  func body(content: Content) -> some View {
    content
      .fullScreenCover(item: $destination) { file in
        NavigationStack {
          ProjectWorkspaceSessionView(
            session: session, identity: file.owner, location: file.location,
            workspaceLocation: file.workspaceLocation, originThreadID: threadID,
            initialFile: file.target, showsModePicker: false,
            closeFromKeyboard: { destination = nil }
          )
        }
        .modifier(PoracodeRetainNavigationWhilePresented())
      }
      .modifier(PoracodeRetainNavigationWhilePresented(isPresented: destination != nil))
  }
}

extension RichChatThreadPageState {
  var attachmentBasenameResolver: RichChatWorkspaceBasenameResolver? {
    guard let connectionID = owningConnectionID, let project,
      project.id != RemoteProject.homeScopeID, let workspaceLocation = projectLocation
    else { return nil }
    let identity = project.identity(on: connectionID)
    let projectLocation = project.location
    return { [weak self] filename, target in
      guard let self, target.lease.connectionID == connectionID else { throw CancellationError() }
      let source = ProjectWorkspaceSelectionSource(session: session, identity: identity,
        location: projectLocation, workspaceLocation: workspaceLocation)
      let select: SelectedProjectWorkspaceGateway.SelectionProvider = { @MainActor [weak self] in
        guard let self, self.suite.media.state.target == target,
          self.project?.id == identity.projectId, self.projectLocation == workspaceLocation,
          !self.session.state.liveLifecycle.isInBackground else { return nil }
        return source.selection
      }
      guard let lease = select()?.context.lease else { throw CancellationError() }
      let gateway = SelectedProjectWorkspaceGateway(selectionProvider: select)
      let path = try await gateway.resolveBareFilename(filename, lease: lease)
      try Task.checkCancellation()
      guard select()?.context.lease == lease else { throw CancellationError() }
      return path
    }
  }

  func projectFileOpener(
    present: @escaping @MainActor @Sendable (RichChatSourceFileDestination) -> Void
  ) -> RichChatProjectFileOpener? {
    guard !isAuxiliary, let connectionID = owningConnectionID,
      connectionID == session.selectedConnectionId, let project,
      project.id != RemoteProject.homeScopeID, let workspaceLocation = projectLocation
    else { return nil }
    let owner = project.identity(on: connectionID)
    return { target in
      guard self.session.selectedConnectionId == connectionID, self.project?.id == owner.projectId
      else { return }
      present(.init(target: target, owner: owner, location: project.location, workspaceLocation: workspaceLocation))
    }
  }
}

/// State projection for a thread transcript. The page supplies domain inputs;
/// this view owns loading, empty, failure, and loaded presentation branches.
struct RichChatTranscriptSurface: View {
  let controller: RichChatTranscriptController
  let notice: RichChatNoticeController
  let mediaController: RichChatMediaController
  let conversation: RichChatConversationController
  let checkpointController: RichChatCheckpointController
  let projectLocation: ProjectLocation?
  let config: [String: RichJSON]
  let sharedTreeThreadCount: Int
  let allowsCheckpointRevert: Bool
  let canOperate: Bool
  let retry: () -> Void
  var requestFork: ((String) -> Void)? = nil
  var forkBoundaryItemID: String? = nil
  var forkSource: (title: String, open: () -> Void)? = nil
  var fallbackCompletedTurn: RichCompletedTurn? = nil
  var askInSideChat: ((String) -> Void)? = nil
  var recordRevertedPrompt: (@MainActor @Sendable (RichChatRevertedPrompt, RichChatThreadTarget) -> Void)? = nil
  var openProjectFile: RichChatProjectFileOpener? = nil
  var resolveAttachmentBasename: RichChatWorkspaceBasenameResolver? = nil
  var isConnectingHost = false
  let find: RichChatFindState
  let showsHistory: Bool
  let allowsThreadToolbar: Bool

  var body: some View {
    let showsFindBar = find.isPresented && showsHistory && !isConnectingHost
    VStack(spacing: 0) {
      // The durable notice is persistent state, not a transcript row: it stays
      // above the surface across pagination, live appends, resets and
      // reconnects, and is never rendered as a timeline item.
      RichChatNoticeBanner(notice: notice)
      if let forkSource {
        Button(action: forkSource.open) {
          Label(forkSource.title, systemImage: "arrow.triangle.branch")
            .font(.caption)
            .lineLimit(1)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.poracodeSecondaryLabel)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
      }
      if showsFindBar {
        RichChatFindBar(find: find)
      }
      content
    }
    .poracodeAvoidKeyboard(isActive: showsFindBar)
    .environment(\.richChatProjectLinkLocation, openProjectFile == nil ? nil : projectLocation)
    .environment(\.richChatOpenProjectFile, openProjectFile)
    .environment(\.openURL, OpenURLAction { url in
      if let projectLocation, let openProjectFile,
        let target = RichChatProjectFileLink.target(from: url, in: projectLocation)
      {
        openProjectFile(target)
        return .handled
      }
      return RichChatProjectFileLink.isExternal(url) ? .systemAction : .discarded
    })
    .environment(
      \.richChatFileDownloads,
      projectLocation.map {
        RichChatFileDownloadContext(controller: mediaController, location: $0,
          resolveWorkspaceBasename: resolveAttachmentBasename)
      }
    )
  }

  @ViewBuilder
  private var content: some View {
    if isConnectingHost {
      LoadingStateView(message: ProjectWorkspaceStrings.connecting)
        .accessibilityIdentifier("native-e2e.thread-connecting")
    } else if showsHistory {
      RichChatTimelineView(
        controller: controller,
        mediaController: mediaController,
        conversation: conversation,
        checkpointController: checkpointController,
        projectLocation: projectLocation,
        config: config,
        sharedTreeThreadCount: sharedTreeThreadCount,
        allowsCheckpointRevert: allowsCheckpointRevert,
        canOperate: canOperate,
        isRefreshing: controller.state.loadState == .loading,
        requestFork: requestFork,
        forkBoundaryItemID: forkBoundaryItemID,
        fallbackCompletedTurn: fallbackCompletedTurn,
        askInSideChat: askInSideChat, recordRevertedPrompt: recordRevertedPrompt,
        find: find, allowsThreadToolbar: allowsThreadToolbar
      )
    } else {
      switch controller.state.loadState {
      case .idle, .loading, .loaded:
        LoadingStateView(message: RichChatStrings.loadingTranscript)
      case .empty:
        ContentUnavailableView {
          Label(RichChatStrings.emptyTranscript, systemImage: "text.bubble")
        } description: {
          Text(RichChatStrings.emptyTranscriptMessage)
        }
      case .failed(let failure):
        ErrorStateView(
          message: RichChatStrings.failure(failure),
          retryTitle: RichChatStrings.retry,
          retry: retry
        )
      }
    }
  }
}
