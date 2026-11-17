import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct HomeQuickComposeView: View {
  @Environment(\.homeWorkspace) var workspace
  @Environment(\.verticalSizeClass) var verticalSizeClass
  @Environment(\.poracodeSplitDetailContext) var splitDetailContext
  @Bindable var session: AppSession
  @Binding var isExpanded: Bool
  let showsContextHeader: Bool
  let onStarted: (String) -> Void
  let onNewsAction: ((HomeNewsCardAction) -> Void)?
  @Environment(\.locale) var newsLocale
  @AppStorage(HomeNewsPreferences.enabledKey) var newsEnabled = true
  @AppStorage(HomeNewsPreferences.activityKey) var newsActivity = true
  var newsHostData: HomeNewsHostData { draft.newsHostData }
  var newsVisit: HomeNewsVisit { draft.newsVisit }
  var launchSeed: HomeThreadLaunchSeed? { draft.launchSeed }

  @Bindable var draft: HomeQuickComposeState
  @State var presentationID = UUID()
  @State private var composerAvailableHeight: CGFloat = 0
  @State private var restorePromptAfterSelector = false

  init(session: AppSession, isExpanded: Binding<Bool>, draft: HomeQuickComposeState, showsContextHeader: Bool = true,
    onNewsAction: ((HomeNewsCardAction) -> Void)?, onStarted: @escaping (String) -> Void
  ) {
    self.session = session
    _isExpanded = isExpanded
    _draft = Bindable(wrappedValue: draft)
    self.showsContextHeader = showsContextHeader
    self.onStarted = onStarted
    self.onNewsAction = onNewsAction
  }

  var selectedProject: RemoteProject? {
    projects.first { $0.id == draft.projectID } ?? projects.first
  }

  var selectedHostLabel: String {
    guard let connectionID = draft.connectionID else { return "" }
    let label = session.state.hosts.first { $0.connectionId == connectionID }?.label ?? ""
    return HomeDeviceName.display(label)
  }

  var agentStatusRevision: UInt64 {
    session.state.replay.agentStatusRevision
  }

  var ownsCurrentConnection: Bool { draft.connectionID == session.selectedConnectionId }
  var isCurrentPresentation: Bool { draft.isPresented(presentationID) }
  var isCompactHeight: Bool { splitDetailContext.isCompactHeight || verticalSizeClass == .compact || (composerAvailableHeight > 0 && composerAvailableHeight < 380) }

  var defaults: HomeThreadLaunchDefaults? {
    selectedProject.flatMap(launchDefaults)
  }

  var selectedAgent: AgentStatusRecord? {
    guard ownsCurrentConnection else { return nil }
    if let kind = draft.selectedAgentKind {
      guard kind != launchSeed?.excludedAgentKind else { return nil }
      return ComposerProviderCatalog.selected(kind, pinnedKind: launchSeed?.initialAgentKind,
        agents: environmentAgents, presentation: draft.presentationMode,
        settings: draft.visibilityDocument.document)
    }
    let kind = launchSeed == nil ? defaults?.agentKind : nil
    return availableAgents.first { $0.kind == kind } ?? availableAgents.first
  }

  var effectiveConfiguration: ThreadLaunchConfiguration? {
    guard let configuration = targetConfiguration else { return nil }
    if draft.configuredConfiguration != nil || launchSeed?.initialConfiguration != nil || launchSeed == nil {
      return ThreadLaunchConfiguration(ModelSelectionBindings.validated(ThreadConfig(configuration), owner: composerSelectionOwner))
    }
    let capabilities = selectedAgent.map {
      HomeComposerCatalog.capabilities(for: $0, presentationMode: draft.presentationMode)
    } ?? [:]
    let saved = draft.restoredSelection != nil
      || selectedProject?.lastDraftConfig?.objectValue?["agentKind"]?.stringValue == selectedAgent?.kind
    let resolved = HomeQuickComposePermissionDefaults.resolve(configuration, saved: saved, capabilities: capabilities)
    return ThreadLaunchConfiguration(ModelSelectionBindings.validated(ThreadConfig(resolved), owner: composerSelectionOwner))
  }

  var body: some View {
    composerSurface
      .modifier(NativeComposerCommands(ownerID: presentationID, configuration: composerControlsBinding, catalog: composerControlsCatalog,
        enabled: ownsCurrentConnection && isCurrentPresentation && session.canOperate && selectedAgent != nil
          && !draft.lifecycle.isBusy && !draft.preparingWorktree,
        chooseModel: { restorePromptAfterSelector = true; draft.selector = .model }, stateOwnerID: ObjectIdentifier(draft)))
      .modifier(ComposerVoiceHost(session: session))
      // Home already owns a bottom inset. Translate its editor without
      // growing that inset again when the keyboard covers it.
      .poracodeAvoidKeyboard(isActive: draft.promptFocused, reservesSpace: false) { composerAvailableHeight = $0 }
      .onAppear {
        draft.beginPresentation(presentationID)
        normalizePresentationMode()
        normalizeProject()
        reconcileProjectPreferences()
        activateMedia()
        synchronizeFileMentions()
      }
      .task(id: settingsRefreshKey) { await reloadComposerSettings() }
      .task(id: newsRefreshKey) { await refreshNews() }
      .onChange(of: draft.prompt) { _, _ in newsVisit.noteTyping() }
      .onChange(of: canStart) { _, ready in
        if ready, launchSeed?.autoStart == true, !draft.didAutoStart {
          draft.didAutoStart = true
          start()
        }
      }
      .onChange(of: session.currentRichChatAccess?.lease) { activateMedia() }
      .onChange(of: agentStatusRevision) {
        normalizePresentationMode()
        normalizeProject()
      }
      .onChange(of: isExpanded, initial: true) { _, expanded in
        if expanded {
          DispatchQueue.main.async {
            guard isExpanded, isCurrentPresentation, ownsCurrentConnection, draft.selector == nil else { return }
            draft.promptFocused = true
          }
        } else {
          draft.promptFocused = false
        }
      }
      .onChange(of: draft.projectID) { synchronizeFileMentions(); reconcileProjectPreferences() }
      .onChange(of: session.state.catalogMutationsSupported) { reconcileProjectPreferences() }
      .onChange(of: draft.presentationMode) {
        guard isCurrentPresentation, ownsCurrentConnection else { return }
        let agent = availableAgents.first { $0.kind == draft.selectedAgentKind } ?? availableAgents.first
        draft.selectAgent(agent?.kind)
        draft.configuredConfiguration = nil
      }
      .onChange(of: draft.selector) { previous, destination in
        if destination != nil { draft.promptFocused = false }
        if destination != .model { draft.modelSearch = "" }
        if destination == .add { Task { await loadComposerTools(servers: true) } }
        if destination == .model || destination == .crew { Task { await reloadComposerSettings() } }
        if previous == .crew && destination == nil { draft.crewRoster = nil }
      }
      .onChange(of: draft.photoItem) { _, item in
        guard isCurrentPresentation, ownsCurrentConnection, let item else { return }
        Task {
          await upload(item, kind: .photo)
          draft.photoItem = nil
        }
      }
      .onChange(of: draft.screenshotItem) { _, item in
        guard isCurrentPresentation, ownsCurrentConnection, let item else { return }
        Task {
          await upload(item, kind: .screenshot)
          draft.screenshotItem = nil
        }
      }
      .onDisappear { draft.endPresentation(presentationID) }
      .fileImporter(
        isPresented: $draft.showingImporter,
        allowedContentTypes: [.data],
        allowsMultipleSelection: false
      ) { result in
        if case .success(let urls) = result, let url = urls.first {
          Task { await upload(url) }
        }
      }
      .fullScreenCover(isPresented: $draft.showingCamera) {
        HomeComposerCameraPicker(isPresented: $draft.showingCamera) { data in
          Task { await uploadCapturedPhoto(data) }
        }
        .ignoresSafeArea()
      }
      .sheet(item: $draft.selector, onDismiss: {
        guard restorePromptAfterSelector else { return }
        restorePromptAfterSelector = false
        if isCurrentPresentation && ownsCurrentConnection && isExpanded && session.canOperate {
          draft.promptFocused = true
        }
      }) { destination in
        selectorSheet(destination)
          .nativeCommands(identity: "home-composer-selector:\(destination)", blocksParentActions: true)
          .poracodeFormSheetSizing()
          .presentationDetents(destination.detents)
          .presentationDragIndicator(.visible)
          .presentationCornerRadius(28)
      }
      .id(ObjectIdentifier(draft))
  }

  private func reconcileProjectPreferences() {
    draft.reconcileProjectPreferenceAuthority(worktreeMode:
      selectedProject?.lastDraftConfig?.objectValue?["worktreeMode"]?.boolValue == true)
  }

  var composerControlsBinding: Binding<ThreadConfig> {
    Binding(
      get: { effectiveConfiguration.map { ThreadConfig($0) }
        ?? draft.configuredConfiguration.map { ThreadConfig($0) } ?? draft.restoredSelection?.configuration ?? .empty },
      set: { configuration in
        guard ownsCurrentConnection else { return }
        applyComposerControls(configuration)
      }
    )
  }

  var hasSendableContent: Bool {
    !draft.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      || launchSeed?.defaultPrompt != nil
      || !draft.fileMentions.isEmpty
      || !draft.mentionedMCPs.isEmpty
      || !draft.skills.isEmpty
      || !draft.attachments.isEmpty
      || !draft.additionalSegments.isEmpty
  }

  var compactPrompt: String {
    let text = draft.prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    let mentions = draft.fileMentions.map { "@\($0)" } + draft.mentionedMCPs.map { "@\($0.name)" } + draft.skills.map(\.invocation) + draft.additionalSegments.compactMap(\.promptText)
    if !text.isEmpty { return text }
    if !mentions.isEmpty { return mentions.joined(separator: " ") }
    return draft.attachments.map(\.name).joined(separator: " ")
  }

  var canStart: Bool {
    guard ownsCurrentConnection, !draft.lifecycle.isBusy, !draft.preparingWorktree, hasSendableContent, selectedProject != nil,
      effectiveConfiguration != nil, draft.tools.document.document != nil, !draft.tools.isMutating,
      let access = session.currentThreadSessionAccess
    else { return false }
    return access.isOnline && access.isReady && access.isForeground
      && access.scopes.contains("session:operate")
  }

  var skillPickerContext: RichChatSkillPickerContext? {
    guard let project = selectedProject,
      let connectionID = session.state.selectedConnectionId,
      let agentKind = draft.selectedAgentKind ?? defaults?.agentKind
    else { return nil }
    return RichChatSkillPickerContext(
      session: session,
      projectIdentity: project.identity(on: connectionID),
      agentKind: agentKind
    )
  }

}
