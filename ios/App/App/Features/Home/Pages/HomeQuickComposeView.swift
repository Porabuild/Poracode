import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct HomeQuickComposeView: View {
  @Bindable var session: AppSession
  @Binding var isExpanded: Bool
  let onStarted: (String) -> Void
  let launchSeed: HomeThreadLaunchSeed?

  @State var lifecycle: ThreadLifecycleController
  @State var mediaSuite: RichChatControllerSuite
  @State var fileMentionController: RichChatFileMentionController
  @State var projectID: String
  @State var threadID = UUID().uuidString.lowercased()
  @State var prompt = ""
  @State var selectedAgentKind: String?
  @State var selectedModel: String?
  @State var selectedEffort: String?
  @State var fast = false
  @State var browserMcp: Bool?
  @State var crossagentMcp: Bool?
  @State var computerUse: Bool?
  @State var chromeMcp: Bool?
  @State var permissionMode = HomeComposerPermission.auto
  @State var configuredConfiguration: ThreadLaunchConfiguration?
  @State var controlsConfiguration = ThreadConfig.empty
  @State var showingComposerControls = false
  @State var presentationMode = ThreadPresentationMode.gui
  @State var worktreeSelection = HomeComposerWorktree.branch
  @State var worktreeBranchName =
    "poracode/mobile-\(String(UUID().uuidString.lowercased().prefix(6)))"
  @State var branchSelection: HomeComposerBranchSelection?
  @State var branchProjectID: String?
  @State var branchOptions: [ProjectGitBranchInfo] = []
  @State var worktreeOptions: [ProjectGitWorktreeInfo] = []
  @State var loadingBranches = false
  @State var switchingBranch: String?
  @State var branchSearch = ""
  @State var creatingBranch = false
  @State var newBranchName = ""
  @State var modelSearch = ""
  @State var photoItem: PhotosPickerItem?
  @State var screenshotItem: PhotosPickerItem?
  @State var showingCamera = false
  @State var attachments: [RichChatUploadedAttachment] = []
  @State var skills: [RichChatSelectedSkill] = []
  @State var fileMentions: [String] = []
  @State var mentionedMCPs: [RichChatSelectedMCP] = []
  @State var selector: HomeComposerSelector?
  @State var showingImporter = false
  @State var importing = false
  @State var preparingWorktree = false
  @State var failureMessage: String?
  @FocusState var promptFocused: Bool

  init(
    session: AppSession,
    isExpanded: Binding<Bool>,
    initialProjectID: String? = nil,
    initialWorktree: HomeComposerBranchSelection? = nil,
    launchSeed: HomeThreadLaunchSeed? = nil,
    onStarted: @escaping (String) -> Void
  ) {
    self.session = session
    _isExpanded = isExpanded
    self.onStarted = onStarted
    self.launchSeed = launchSeed
    _lifecycle = State(initialValue: session.makeThreadLifecycleController())
    _mediaSuite = State(initialValue: session.makeRichChatControllerSuite())
    _fileMentionController = State(initialValue: RichChatFileMentionController(session: session))
    let latestProjectID = (session.state.snapshot?.threads ?? [])
      .filter { !$0.isArchived && ThreadPresentationFilter.isVisibleInNativeList($0) }
      .max(by: { $0.updatedAt < $1.updatedAt })?.projectId
    _projectID = State(
      initialValue: launchSeed?.fixedProjectID ?? initialProjectID ?? latestProjectID
        ?? session.projects.first?.id ?? ""
    )
    let seededWorktree = launchSeed?.initialWorktree ?? initialWorktree
    _worktreeSelection = State(initialValue: seededWorktree == nil ? .branch : .worktree)
    _branchSelection = State(initialValue: seededWorktree)
    _selectedAgentKind = State(initialValue: launchSeed?.initialAgentKind)
    _selectedModel = State(initialValue: launchSeed?.initialModelID)
    _prompt = State(initialValue: launchSeed?.initialPrompt ?? "")
    let initialPresentationMode =
      launchSeed?.presentationMode
      ?? HomeComposerCatalog.preferredPresentationMode(
        from: session.state.replay.agentStatuses.ordered
      )
    _presentationMode = State(initialValue: initialPresentationMode)
  }

  var projects: [RemoteProject] {
    session.projects.filter { $0.disabled != true && launchDefaults(for: $0) != nil }
  }

  var selectedProject: RemoteProject? {
    projects.first { $0.id == projectID } ?? projects.first
  }

  var selectedHostLabel: String {
    guard let connectionID = session.state.selectedConnectionId else { return "" }
    let label = session.state.hosts.first { $0.connectionId == connectionID }?.label ?? ""
    return HomeDeviceName.display(label)
  }

  var agentStatusRevision: UInt64 {
    session.state.replay.agentStatusRevision
  }

  var defaults: HomeThreadLaunchDefaults? {
    selectedProject.flatMap(launchDefaults)
  }

  var selectedAgent: AgentStatusRecord? {
    let kind = selectedAgentKind ?? (launchSeed == nil ? defaults?.agentKind : nil)
    return availableAgents.first { $0.kind == kind } ?? availableAgents.first
  }

  var effectiveConfiguration: ThreadLaunchConfiguration? {
    guard var configuration = targetConfiguration else { return nil }
    switch permissionMode {
    case .auto:
      configuration.approvalPolicy = nil
      configuration.approvalsReviewer = nil
      configuration.sandboxMode = nil
    case .bypass:
      configuration.approvalPolicy = "never"
      configuration.approvalsReviewer = nil
      configuration.sandboxMode = "danger-full-access"
    case .configured:
      break
    }
    return configuration
  }

  var body: some View {
    composerSurface
      .onAppear {
        normalizePresentationMode()
        normalizeProject()
        activateMedia()
        synchronizeFileMentions()
      }
      .onChange(of: session.currentRichChatAccess?.lease) { activateMedia() }
      .onChange(of: agentStatusRevision) {
        normalizePresentationMode()
        normalizeProject()
      }
      .onChange(of: isExpanded) { _, expanded in
        if expanded {
          DispatchQueue.main.async { promptFocused = true }
        } else {
          promptFocused = false
        }
      }
      .onChange(of: projectID) {
        selectedAgentKind = nil
        selectedModel = nil
        selectedEffort = nil
        fast = false
        browserMcp = nil
        crossagentMcp = nil
        computerUse = nil
        chromeMcp = nil
        configuredConfiguration = nil
        worktreeSelection = .branch
        branchSelection = nil
        branchProjectID = nil
        branchOptions = []
        worktreeOptions = []
        branchSearch = ""
        creatingBranch = false
        newBranchName = ""
        attachments = []
        skills = []
        fileMentions = []
        mentionedMCPs = []
        synchronizeFileMentions()
      }
      .onChange(of: selectedAgentKind) {
        skills = []
        configuredConfiguration = nil
      }
      .onChange(of: presentationMode) {
        let agent = availableAgents.first { $0.kind == selectedAgentKind } ?? availableAgents.first
        selectedAgentKind = agent?.kind
        selectedModel = agent.flatMap { modelOptions(for: $0).first?.modelID }
        selectedEffort = agent.flatMap { candidate in
          selectedModel.flatMap { defaultEffort(for: candidate, modelID: $0) }
        }
        fast = false
        configuredConfiguration = nil
      }
      .onChange(of: selector) { _, destination in
        if destination != .model { modelSearch = "" }
      }
      .onChange(of: photoItem) { _, item in
        guard let item else { return }
        Task {
          await upload(item, kind: .photo)
          photoItem = nil
        }
      }
      .onChange(of: screenshotItem) { _, item in
        guard let item else { return }
        Task {
          await upload(item, kind: .screenshot)
          screenshotItem = nil
        }
      }
      .onDisappear {
        resignPromptFocus()
        lifecycle.deactivate()
        mediaSuite.deselect()
      }
      .fileImporter(
        isPresented: $showingImporter,
        allowedContentTypes: [.data],
        allowsMultipleSelection: false
      ) { result in
        if case .success(let urls) = result, let url = urls.first {
          Task { await upload(url) }
        }
      }
      .fullScreenCover(isPresented: $showingCamera) {
        HomeComposerCameraPicker(isPresented: $showingCamera) { data in
          Task { await uploadCapturedPhoto(data) }
        }
        .ignoresSafeArea()
      }
      .sheet(item: $selector) { destination in
        selectorSheet(destination)
          .presentationDetents(destination.detents)
          .presentationDragIndicator(.visible)
          .presentationCornerRadius(28)
      }
      .sheet(isPresented: $showingComposerControls) {
        RichChatComposerControlsSheet(
          configuration: composerControlsBinding,
          agentStatus: selectedAgent,
          presentationMode: presentationMode
        )
      }
  }

  var composerControlsBinding: Binding<ThreadConfig> {
    Binding(
      get: { controlsConfiguration },
      set: { configuration in
        controlsConfiguration = configuration
        applyComposerControls(configuration)
      }
    )
  }

  var hasSendableContent: Bool {
    !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      || launchSeed?.defaultPrompt != nil
      || !fileMentions.isEmpty
      || !mentionedMCPs.isEmpty
  }

  var compactPrompt: String {
    let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    let mentions = fileMentions.map { "@\($0)" } + mentionedMCPs.map { "@\($0.name)" }
    return text.isEmpty ? mentions.joined(separator: " ") : text
  }

  var canStart: Bool {
    guard !lifecycle.isBusy, !preparingWorktree, hasSendableContent, selectedProject != nil,
      effectiveConfiguration != nil, let access = session.currentThreadSessionAccess
    else { return false }
    return access.isOnline && access.isReady && access.isForeground
      && access.scopes.contains("session:operate")
  }

  var skillPickerContext: RichChatSkillPickerContext? {
    guard let project = selectedProject,
      let connectionID = session.state.selectedConnectionId,
      let agentKind = selectedAgentKind ?? defaults?.agentKind
    else { return nil }
    return RichChatSkillPickerContext(
      session: session,
      projectIdentity: project.identity(on: connectionID),
      agentKind: agentKind
    )
  }

  var modelLabel: String {
    guard let agent = selectedAgent, let modelID = effectiveConfiguration?.model else {
      return HomeStrings.model
    }
    return modelOptions(for: agent).first(where: { $0.modelID == modelID })?.label
      ?? HomeComposerCatalog.normalizedLabel(
        agentKind: agent.kind, modelID: modelID, advertisedLabel: modelID)
  }

}
