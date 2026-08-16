import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct HomeQuickComposeView: View {
  @Bindable var session: AppSession
  @Binding var isExpanded: Bool
  let onStarted: (String) -> Void

  @State var lifecycle: ThreadLifecycleController
  @State var mediaSuite: RichChatControllerSuite
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
  @State var selector: HomeComposerSelector?
  @State var showingImporter = false
  @State var importing = false
  @State var preparingWorktree = false
  @State var failureMessage: String?
  @FocusState private var promptFocused: Bool

  init(
    session: AppSession,
    isExpanded: Binding<Bool>,
    onStarted: @escaping (String) -> Void
  ) {
    self.session = session
    _isExpanded = isExpanded
    self.onStarted = onStarted
    _lifecycle = State(initialValue: session.makeThreadLifecycleController())
    _mediaSuite = State(initialValue: session.makeRichChatControllerSuite())
    let latestProjectID = (session.state.snapshot?.threads ?? [])
      .filter { !$0.isArchived && ThreadPresentationFilter.isVisibleInGUIList($0) }
      .max(by: { $0.updatedAt < $1.updatedAt })?.projectId
    _projectID = State(initialValue: latestProjectID ?? session.projects.first?.id ?? "")
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

  var defaults: HomeThreadLaunchDefaults? {
    selectedProject.flatMap(launchDefaults)
  }

  var selectedAgent: AgentStatusRecord? {
    let kind = selectedAgentKind ?? defaults?.agentKind
    return session.state.replay.agentStatuses.ordered.first { $0.kind == kind }
  }

  var effectiveConfiguration: ThreadLaunchConfiguration? {
    guard var configuration = defaults?.configuration else { return nil }
    if let selectedModel { configuration.model = selectedModel }
    configuration.effort = selectedEffort ?? configuration.effort
    configuration.fast = fast
    configuration.browserMcp = browserMcp ?? configuration.browserMcp
    configuration.crossagentMcp = crossagentMcp ?? configuration.crossagentMcp
    configuration.computerUse = computerUse ?? configuration.computerUse
    configuration.chromeMcp = chromeMcp ?? configuration.chromeMcp
    switch permissionMode {
    case .auto:
      configuration.approvalPolicy = nil
      configuration.approvalsReviewer = nil
      configuration.sandboxMode = nil
    case .bypass:
      configuration.approvalPolicy = "never"
      configuration.approvalsReviewer = nil
      configuration.sandboxMode = "danger-full-access"
    }
    return configuration
  }

  var body: some View {
    Group {
      if isExpanded { expandedSurface } else { compactSurface }
    }
    .frame(maxWidth: .infinity)
    .background(.regularMaterial, in: surfaceShape)
    .overlay(surfaceShape.stroke(Color.primary.opacity(0.1), lineWidth: 0.5))
    .shadow(color: .black.opacity(0.16), radius: isExpanded ? 18 : 10, y: isExpanded ? 8 : 4)
    .animation(.snappy(duration: 0.25), value: isExpanded)
    .onAppear {
      normalizeProject()
      activateMedia()
    }
    .onChange(of: session.currentRichChatAccess?.lease) { activateMedia() }
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
      worktreeSelection = .branch
      branchSelection = nil
      branchProjectID = nil
      branchOptions = []
      worktreeOptions = []
      branchSearch = ""
      creatingBranch = false
      newBranchName = ""
      attachments = []
    }
    .onChange(of: presentationMode) {
      selectedModel = nil
      selectedEffort = nil
      fast = false
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
  }

  private var compactSurface: some View {
    HStack(spacing: 8) {
      Button {
        guard !projects.isEmpty, session.canOperate else { return }
        withAnimation(.snappy(duration: 0.25)) { isExpanded = true }
      } label: {
        Text(hasSendableContent ? compactPrompt : HomeStrings.quickComposePrompt)
          .foregroundStyle(hasSendableContent ? .primary : .secondary)
          .lineLimit(1)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .buttonStyle(.plain)
      .disabled(projects.isEmpty || !session.canOperate)
      .accessibilityLabel(HomeStrings.newThread)
      .accessibilityIdentifier("native-e2e.new-thread")

      if hasSendableContent {
        startButton
          .transition(.scale.combined(with: .opacity))
      }
    }
    .padding(.leading, 16)
    .padding(.trailing, hasSendableContent ? 5 : 16)
    .frame(minHeight: 46)
  }

  private var expandedSurface: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        projectButton
        Spacer(minLength: 8)
        presentationButton
      }

      if !attachments.isEmpty {
        attachmentChips
      }

      TextField(
        "",
        text: $prompt,
        prompt: Text(HomeStrings.quickComposePrompt).foregroundStyle(Color.primary.opacity(0.5)),
        axis: .vertical
      )
      .lineLimit(4...7)
      .textFieldStyle(.plain)
      .foregroundStyle(.primary)
      .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
      .focused($promptFocused)
      .accessibilityIdentifier("native-e2e.new-thread-prompt")

      Button {
        selector = .add
      } label: {
        HStack(spacing: 7) {
          Label(worktreeSelection.label, systemImage: worktreeSelection.icon)
            .foregroundStyle(.primary)
          if worktreeSelection == .branch, let branch = currentBranch {
            Text(branch).foregroundStyle(.secondary).lineLimit(1)
          } else if worktreeSelection != .branch {
            Text(worktreeBranchName).foregroundStyle(.secondary).lineLimit(1)
          }
          Spacer(minLength: 4)
        }
        .font(.caption2)
      }
      .buttonStyle(.plain)

      if let failureMessage {
        Text(failureMessage)
          .font(.caption)
          .foregroundStyle(.red)
          .lineLimit(2)
      }

      HStack(spacing: 9) {
        Button {
          selector = .add
        } label: {
          if importing {
            ProgressView().controlSize(.small)
          } else {
            Image(systemName: "plus")
          }
        }
        .composerCircleButton()
        .accessibilityLabel(HomeStrings.add)

        modelButton

        if !effortOptions.isEmpty { effortMenu }
        if supportsFast { fastButton }
        permissionMenu

        Spacer(minLength: 0)

        reservedStartButton
      }
      .frame(minHeight: 38)
    }
    .padding(14)
    .frame(minHeight: 218, alignment: .top)
  }

  private var projectButton: some View {
    Button {
      selector = .project
    } label: {
      HStack(spacing: 6) {
        HomeServerStatusIcon(online: session.socketState == .online)
        Text(selectedProject?.name ?? HomeStrings.project)
          .font(.caption.weight(.medium))
          .lineLimit(1)
        Text(selectedHostLabel)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(1)
        Image(systemName: "chevron.up.chevron.down")
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(.secondary)
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(HomeStrings.project)
  }

  private var modelButton: some View {
    Button {
      selector = .model
    } label: {
      HStack(spacing: 5) {
        HomeProviderIcon(kind: selectedAgent?.kind ?? defaults?.agentKind ?? "")
          .frame(width: 14, height: 14)
          .foregroundStyle(.secondary)
        Text(modelLabel)
          .font(.caption)
          .foregroundStyle(.primary)
          .lineLimit(1)
        Image(systemName: "chevron.down")
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(.secondary)
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(HomeStrings.model)
  }

  private var presentationButton: some View {
    Button {
      selector = .add
    } label: {
      Label(
        presentationMode == .gui ? HomeStrings.chat : HomeStrings.cli,
        systemImage: presentationMode == .gui ? "bubble.left" : "terminal"
      )
      .font(.caption)
      .foregroundStyle(.primary)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(HomeStrings.mode)
  }

  private var effortMenu: some View {
    Menu {
      ForEach(effortOptions, id: \.self) { effort in
        Button {
          selectedEffort = effort
        } label: {
          if effectiveConfiguration?.effort == effort {
            Label(effort.capitalized, systemImage: "checkmark")
          } else {
            Text(effort.capitalized)
          }
        }
      }
    } label: {
      Image(systemName: "chart.bar.fill")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .accessibilityLabel(HomeStrings.effort)
  }

  private var fastButton: some View {
    Button {
      fast.toggle()
    } label: {
      Image(systemName: fast ? "bolt.fill" : "bolt")
        .font(.caption)
        .foregroundStyle(fast ? Color.yellow : Color.secondary)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(HomeStrings.fast)
  }

  private var permissionMenu: some View {
    Menu {
      ForEach(HomeComposerPermission.allCases) { option in
        Button {
          permissionMode = option
        } label: {
          if permissionMode == option {
            Label(option.label, systemImage: "checkmark")
          } else {
            Text(option.label)
          }
        }
      }
    } label: {
      Image(systemName: permissionMode == .auto ? "shield" : "shield.slash")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .accessibilityLabel(HomeStrings.permissions)
  }

  private var startButton: some View {
    Button {
      start()
    } label: {
      ZStack {
        Circle().fill(canStart ? Color.accentColor : Color.secondary.opacity(0.15))
        if lifecycle.isBusy || preparingWorktree {
          ProgressView().controlSize(.small).tint(.white)
        } else {
          Image(systemName: "arrow.up")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(canStart ? Color.white : Color.secondary)
        }
      }
      .frame(width: 38, height: 38)
    }
    .buttonStyle(.plain)
    .disabled(!canStart)
    .accessibilityLabel(HomeStrings.start)
    .accessibilityIdentifier("native-e2e.new-thread-start")
  }

  private var reservedStartButton: some View {
    startButton
      .opacity(hasSendableContent ? 1 : 0)
      .allowsHitTesting(hasSendableContent)
      .accessibilityHidden(!hasSendableContent)
  }

  private var attachmentChips: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        ForEach(attachments) { attachment in
          Button {
            attachments.removeAll { $0.id == attachment.id }
          } label: {
            Label(attachment.name, systemImage: "xmark.circle.fill")
              .font(.caption2)
          }
          .buttonStyle(.bordered)
          .controlSize(.small)
          .accessibilityLabel("\(RichChatStrings.removeAttachment): \(attachment.name)")
        }
      }
    }
  }

  private var surfaceShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: isExpanded ? 24 : 23, style: .continuous)
  }

  private var hasSendableContent: Bool {
    !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private var compactPrompt: String {
    prompt.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private var canStart: Bool {
    guard !lifecycle.isBusy, !preparingWorktree, hasSendableContent, selectedProject != nil,
      effectiveConfiguration != nil, let access = session.currentThreadSessionAccess
    else { return false }
    return access.isOnline && access.isReady && access.isForeground
      && access.scopes.contains("session:operate")
  }

  private var modelLabel: String {
    guard let agent = selectedAgent, let modelID = effectiveConfiguration?.model else {
      return HomeStrings.model
    }
    return modelOptions(for: agent).first(where: { $0.modelID == modelID })?.label
      ?? HomeComposerCatalog.normalizedLabel(
        agentKind: agent.kind, modelID: modelID, advertisedLabel: modelID)
  }

}

struct HomeServerStatusIcon: View {
  let online: Bool

  var body: some View {
    Image(systemName: "server.rack")
      .font(.caption)
      .overlay(alignment: .bottomTrailing) {
        Circle()
          .fill(online ? Color.green : Color.secondary)
          .frame(width: 5, height: 5)
          .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 0.75))
      }
      .frame(width: 16, height: 16)
  }
}

extension View {
  fileprivate func composerCircleButton() -> some View {
    buttonStyle(.plain)
      .frame(width: 34, height: 34)
      .background(Color.primary.opacity(0.08), in: Circle())
  }
}
