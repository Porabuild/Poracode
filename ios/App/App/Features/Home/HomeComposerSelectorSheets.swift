import PhotosUI
import SwiftUI
import UIKit

extension HomeQuickComposeView {
  @ViewBuilder
  func selectorSheet(_ destination: HomeComposerSelector) -> some View {
    if destination == .crew {
      crewRosterSheet
    } else {
    NavigationStack(path: $draft.selectorPath) {
      Group {
        if destination == .model {
          selectorList(destination)
            .searchable(
              text: $draft.modelSearch,
              placement: .navigationBarDrawer(displayMode: .always),
              prompt: Text(HomeStrings.searchModels)
            )
        } else {
          selectorList(destination)
        }
      }
      .navigationDestination(for: HomeComposerDestination.self, destination: selectorDestination)
    }
    }
  }

  private func selectorList(_ destination: HomeComposerSelector) -> some View {
    List {
      switch destination {
      case .project: projectRows
      case .model: modelRows
      case .add: addRows
      case .controls: configurationRows
      case .crew: EmptyView()
      }
    }
    .poracodeDrawerListStyle()
    .environment(\.defaultMinListRowHeight, 56)
    .navigationTitle(destination.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button(RichChatStrings.done) { draft.selector = nil }
      }
    }
  }

  @ViewBuilder
  var projectRows: some View {
    ForEach(projects) { project in
      Button {
        draft.projectID = project.id
        draft.selector = nil
      } label: {
        HStack(spacing: 12) {
          HomeServerStatusIcon(online: session.socketState == .online)
          VStack(alignment: .leading, spacing: 2) {
            Text(project.name).foregroundStyle(.primary)
            Text(selectedHostLabel).font(.caption).foregroundStyle(.secondary)
          }
          Spacer()
          if project.id == selectedProject?.id {
            Image(systemName: "checkmark").foregroundStyle(.tint)
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .poracodeDrawerRowSurface()
    }
  }

  @ViewBuilder
  var modelRows: some View {
    crewPickerRows
    let agents = ComposerProviderCatalog.ordered(availableAgents,
      providerOrder: effectiveProviderOrder(draft.visibilityDocument.document?.providerOrder ?? []))
    let models = agents.flatMap { agent in modelOptions(for: agent) }.filter {
      $0.matches(draft.modelSearch)
    }
    if models.isEmpty, let defaults,
      defaults.agentKind != launchSeed?.excludedAgentKind
    {
      let label = HomeComposerCatalog.normalizedLabel(
        agentKind: defaults.agentKind,
        modelID: defaults.configuration.model,
        advertisedLabel: defaults.configuration.model
      )
      modelRow(
        HomeComposerModel(
          agentKind: defaults.agentKind,
          modelID: defaults.configuration.model,
          label: label
        )
      )
    } else {
      ForEach(models) { model in modelRow(model) }
      if models.isEmpty {
        ContentUnavailableView(ProviderSelectionStrings.noAgents, systemImage: "person.crop.circle.badge.exclamationmark",
          description: Text(ProviderSelectionStrings.manageAgentsHint))
          .accessibilityIdentifier("native-e2e.new-thread-no-agents")
      }
    }
  }

  func modelRow(_ model: HomeComposerModel) -> some View {
    Button {
      selectModel(model)
    } label: {
      HStack(spacing: 12) {
        HomeProviderIcon(kind: model.agentKind)
          .frame(width: 20, height: 20)
          .foregroundStyle(.secondary)
        VStack(alignment: .leading, spacing: 2) {
          Text(model.label).foregroundStyle(.primary)
          // Provider-content pricing and the sub-provider hint share the
          // muted caption line, joined like the desktop row hints.
          let hints = [model.subProviderLabel, model.modelDescription].compactMap(\.self)
          if !hints.isEmpty {
            Text(hints.joined(separator: " · "))
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
        Spacer()
        if (draft.selectedAgentKind ?? defaults?.agentKind) == model.agentKind,
          effectiveModelIsRepresentedByRow(model)
        {
          Image(systemName: "checkmark").foregroundStyle(.tint)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .poracodeDrawerRowSurface()
    .accessibilityIdentifier("native-e2e.new-thread-model.\(model.agentKind).\(model.modelID)")
  }

  func selectModel(_ model: HomeComposerModel, preservingCrew: Bool = false, persist: Bool = true, dismiss: Bool = true) {
    let previousCrew = effectiveConfiguration?.crew ?? draft.configuredConfiguration?.crew
      ?? draft.restoredSelection?.configuration.crew
    let clearsCrew = !preservingCrew && ThreadCrewBinding(wire: previousCrew) != nil
    guard ownsCurrentConnection,
      let agent = availableAgents.first(where: { $0.kind == model.agentKind }) else { return }
    if selectedAgent?.kind == agent.kind, let current = effectiveConfiguration {
      var next = ThreadConfig(current)
      let catalog = composerControlsCatalog
      // Pinning an implicit default provider is not a provider change. A
      // same-provider model edit must retain permissions, context and skills.
      if catalog.isProjectedFamilyRow(model.modelID) {
        catalog.applyFamilyRowSelection(model.modelID, to: &next)
      } else {
        catalog.applyExactModelSelection(model.modelID, to: &next)
      }
      draft.selectAgent(agent.kind, preservingContext: true)
      applyComposerControls(next, persist: false)
    } else {
      let instanceID = agent.kind == defaults?.agentKind ? defaults?.agentInstanceID : nil
      let owner = ModelSelectionOwner(agentKind: agent.kind, agentInstanceID: instanceID, presentationMode: draft.presentationMode)
      let preferences = draft.preferences.modelPreferences(for: owner)
      let capabilities = HomeComposerCatalog.capabilities(for: agent, presentationMode: draft.presentationMode)
      let provider = draft.projectID == RemoteProject.homeScopeID ? nil : draft.preferences.providerConfiguration(for: owner)
      let saved = ComposerPreferenceResolution.saved(project: nil, provider: provider,
        preferences: preferences, capabilities: capabilities)
      let base = saved.map(ThreadLaunchConfiguration.init) ?? ThreadLaunchConfiguration(model: "")
      var configuration = ThreadConfig(HomeQuickComposePermissionDefaults.resolve(base, saved: saved != nil,
        capabilities: capabilities))
      let catalog = RichChatComposerControlCatalog(agentStatus: agent, presentationMode: draft.presentationMode,
        configuration: configuration, hiddenModels: draft.hiddenModels,
        agentInstanceID: instanceID,
        modelPreferences: preferences)
      if catalog.isProjectedFamilyRow(model.modelID) { catalog.applyFamilyRowSelection(model.modelID, to: &configuration) }
      else { catalog.applyExactModelSelection(model.modelID, to: &configuration) }
      guard !configuration.model.isEmpty else { return }
      draft.selectAgent(agent.kind)
      draft.configuredConfiguration = ThreadLaunchConfiguration(configuration)
    }
    if clearsCrew, let current = draft.configuredConfiguration {
      var next = current
      next.crew = .null
      draft.configuredConfiguration = next
    }
    if persist && !preservingCrew { rememberComposerSelection() }
    if dismiss { draft.selector = nil }
  }

  /// Whether the effective model is the row's own id or a member the row
  /// represents (a family row stands in for every one of its exact members).
  private func effectiveModelIsRepresentedByRow(_ model: HomeComposerModel) -> Bool {
    guard let effectiveModel = effectiveConfiguration?.model else { return false }
    if effectiveModel == model.modelID { return true }
    guard let agent = availableAgents.first(where: { $0.kind == model.agentKind }) else {
      return false
    }
    let capabilities = HomeComposerCatalog.capabilities(
      for: agent, presentationMode: draft.presentationMode)
    return ModelFamilies.family(for: effectiveModel, in: capabilities)?.model == model.modelID
  }

  @ViewBuilder
  var addRows: some View {
    Section(HomeStrings.add) {
      Button {
        draft.selector = nil
        DispatchQueue.main.async { draft.showingImporter = true }
      } label: {
        HomeComposerContextRow(title: HomeStrings.files, icon: "paperclip")
      }
      .buttonStyle(.plain)
      .poracodeDrawerRowSurface()

      NavigationLink(value: HomeComposerDestination.photos) {
        HomeComposerContextRow(title: HomeStrings.photos, icon: "photo")
      }
      .poracodeDrawerRowSurface()
      .accessibilityIdentifier("native-e2e.new-thread-photos")
    }

    if canTogglePlan {
      Section {
        Button { togglePlan() } label: {
          selectorRow(RichChatStrings.plan, icon: "list.bullet.clipboard",
            selected: composerControlsBinding.wrappedValue.mode == "plan")
        }
        .buttonStyle(.plain)
        .poracodeDrawerRowSurface()
        .accessibilityAddTraits(composerControlsBinding.wrappedValue.mode == "plan" ? .isSelected : [])
        .accessibilityIdentifier("native-e2e.new-thread-plan")
      }
    }

    Section(HomeStrings.context) {
      NavigationLink(value: HomeComposerDestination.plugins) {
        toolsRow(title: RichChatStrings.plugins, icon: "puzzlepiece.extension", count: enabledPluginCount)
      }
      .poracodeDrawerRowSurface()
      .accessibilityIdentifier("native-e2e.new-thread-plugins")
      NavigationLink(value: HomeComposerDestination.mcp) {
        toolsRow(title: HomeStrings.mcpServers, icon: "server.rack", count: draft.tools.rows.filter(\.server.enabled).count)
      }
      .poracodeDrawerRowSurface()
      .accessibilityIdentifier("native-e2e.new-thread-mcp")

      if skillPickerContext != nil {
        NavigationLink(value: HomeComposerDestination.skills) {
          HStack(spacing: 12) {
            Image(systemName: "wand.and.stars")
              .frame(width: 18)
              .foregroundStyle(.secondary)
            Text(SettingsIntegrationsStrings.skills).foregroundStyle(.primary)
            Spacer()
            if !draft.skills.isEmpty {
              Text("\(draft.skills.count)").foregroundStyle(.secondary)
            }
          }
        }
        .poracodeDrawerRowSurface()
      }

      Button {
        openComposerControls()
      } label: {
        HomeComposerContextRow(
          title: RichChatStrings.composerControls,
          icon: "slider.horizontal.3"
        )
      }
      .buttonStyle(.plain)
      .poracodeDrawerRowSurface()
    }

    if launchSeed == nil {
      Section(HomeStrings.worktreeMode) {
        ForEach(HomeComposerWorktree.allCases) { option in
          Button {
            draft.worktreeSelection = option
            if option == .branch, draft.branchSelection?.reusesWorktree == true {
              draft.branchSelection = nil
            }
            rememberComposerSelection()
          } label: {
            selectorRow(option.label, icon: option.icon, selected: draft.worktreeSelection == option)
          }
          .buttonStyle(.plain)
          .poracodeDrawerRowSurface()
        }

        NavigationLink(value: HomeComposerDestination.branches) {
          HStack(spacing: 12) {
            Image(
              systemName: draft.branchSelection?.reusesWorktree == true
                ? "arrow.triangle.branch" : "point.3.connected.trianglepath.dotted"
            )
            .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
              Text(HomeStrings.branch).foregroundStyle(.primary)
              Text(selectedBranchLabel).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
          }
        }
        .poracodeDrawerRowSurface()

        if draft.worktreeSelection != .branch, draft.branchSelection?.reusesWorktree != true {
          TextField(GitOperationsStrings.branchName, text: $draft.worktreeBranchName)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .poracodeDrawerRowSurface()
        }
      }
    }

    if launchSeed?.locksPresentationMode != true { Section(HomeStrings.mode) {
      Button {
        choosePresentation(.gui)
        draft.selector = nil
      } label: {
        selectorRow(HomeStrings.chat, icon: "bubble.left", selected: draft.presentationMode == .gui)
      }
      .buttonStyle(.plain)
      .poracodeDrawerRowSurface()
      .disabled(!supportsPresentationMode(.gui))

      Button {
        choosePresentation(.terminal)
        draft.selector = nil
      } label: {
        selectorRow(HomeStrings.cli, icon: "terminal", selected: draft.presentationMode == .terminal)
      }
      .buttonStyle(.plain)
      .poracodeDrawerRowSurface()
      .disabled(!supportsPresentationMode(.terminal))
    }
    }
  }

  @ViewBuilder
  var photoRows: some View {
    PhotosPicker(selection: $draft.photoItem, matching: .images) {
      HomeComposerContextRow(title: HomeStrings.photos, icon: "photo")
    }
    .buttonStyle(.plain)
    .poracodeDrawerRowSurface()
    .accessibilityIdentifier("native-e2e.new-thread-photo-picker")

    PhotosPicker(selection: $draft.screenshotItem, matching: .screenshots) {
      HomeComposerContextRow(title: HomeStrings.screenshots, icon: "viewfinder")
    }
    .buttonStyle(.plain)
    .poracodeDrawerRowSurface()
    .accessibilityIdentifier("native-e2e.new-thread-screenshot-picker")

    Button {
      guard HomeComposerCameraPicker.isAvailable else {
        draft.failureMessage = HomeStrings.cameraUnavailable
        return
      }
      draft.selector = nil
      DispatchQueue.main.async { draft.showingCamera = true }
    } label: {
      HomeComposerContextRow(title: HomeStrings.camera, icon: "camera")
    }
    .buttonStyle(.plain)
    .poracodeDrawerRowSurface()
    .disabled(!HomeComposerCameraPicker.isAvailable)
    .accessibilityIdentifier("native-e2e.new-thread-camera")
  }


  var branchPicker: some View {
    List {
      if draft.loadingBranches {
        HStack {
          Spacer()
          ProgressView()
          Spacer()
        }
        .poracodeDrawerRowSurface()
      }

      if !filteredBranchOptions.isEmpty {
        Section(GitOperationsStrings.branches) {
          ForEach(filteredBranchOptions) { branch in
            branchRow(branch, worktree: draft.worktreeOptions.first { $0.branch == branch.name })
          }
        }
      }
      if draft.branchOptions.isEmpty, !draft.worktreeOptions.isEmpty {
        Section(GitOperationsStrings.worktrees) {
          ForEach(draft.worktreeOptions) { worktree in worktreeRow(worktree) }
        }
      }

      if let failure = draft.failureMessage {
        Text(failure)
          .font(.caption)
          .foregroundStyle(.red)
          .poracodeDrawerRowSurface()
      }

      if draft.worktreeSelection == .branch {
        Section {
          if draft.creatingBranch {
            HStack {
              TextField(GitOperationsStrings.branchName, text: $draft.newBranchName)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { Task { await createBranch() } }
              Button(GitOperationsStrings.createBranch) {
                Task { await createBranch() }
              }
              .disabled(draft.newBranchName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .poracodeDrawerRowSurface()
          } else {
            Button {
              draft.creatingBranch = true
            } label: {
              Label(GitOperationsStrings.createBranch, systemImage: "plus")
                .foregroundStyle(.primary)
            }
            .buttonStyle(.plain)
            .poracodeDrawerRowSurface()
          }
        }
      }
    }
    .poracodeDrawerListStyle()
    .environment(\.defaultMinListRowHeight, 56)
    .navigationTitle(HomeStrings.branch)
    .navigationBarTitleDisplayMode(.inline)
    .searchable(text: $draft.branchSearch)
    .task(id: draft.projectID) { await loadBranches() }
  }

  func branchRow(_ branch: ProjectGitBranchInfo, worktree: ProjectGitWorktreeInfo?) -> some View {
    Button {
      Task { await selectBranch(branch, worktree: worktree) }
    } label: {
      HStack(spacing: 12) {
        if draft.switchingBranch == branch.name {
          ProgressView().controlSize(.small).frame(width: 18, height: 18)
        } else {
          Image(
            systemName: worktree == nil
              ? (branch.isRemote ? "globe" : "point.3.connected.trianglepath.dotted")
              : "arrow.triangle.branch"
          )
          .frame(width: 18)
          .foregroundStyle(.secondary)
        }
        Text(branch.name).foregroundStyle(.primary).lineLimit(1)
        Spacer()
        if selectedBranchLabel == branch.name {
          Image(systemName: "checkmark").foregroundStyle(.tint)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(draft.switchingBranch != nil)
    .poracodeDrawerRowSurface()
  }

  func worktreeRow(_ worktree: ProjectGitWorktreeInfo) -> some View {
    Button {
      selectWorktree(worktree)
    } label: {
      HStack(spacing: 12) {
        Image(systemName: "arrow.triangle.branch")
          .frame(width: 18)
          .foregroundStyle(.secondary)
        Text(worktree.branch).foregroundStyle(.primary).lineLimit(1)
        Spacer()
        if draft.branchSelection?.worktreePath == worktree.path {
          Image(systemName: "checkmark").foregroundStyle(.tint)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .poracodeDrawerRowSurface()
  }

  func selectorRow(_ title: String, icon: String, selected: Bool) -> some View {
    HStack(spacing: 12) {
      Image(systemName: icon).frame(width: 18).foregroundStyle(.secondary)
      Text(title).foregroundStyle(.primary)
      Spacer()
      if selected { Image(systemName: "checkmark").foregroundStyle(.tint) }
    }
    .contentShape(Rectangle())
  }

  var enabledMcpCount: Int {
    HomeComposerMCP.allCases.filter(mcpEnabled).count
  }

  private var enabledPluginCount: Int {
    guard let agent = selectedAgent, let project = selectedProject else { return 0 }
    return ComposerPluginCatalog.rows(document: draft.tools.document.document, agentKind: agent.kind,
      capabilities: HomeComposerCatalog.capabilities(for: agent, presentationMode: draft.presentationMode),
      presentation: draft.presentationMode, location: project.location).filter(\.enabled).count
  }

  private func toolsRow(title: String, icon: String, count: Int) -> some View {
    HStack(spacing: 12) {
      Image(systemName: icon).frame(width: 18).foregroundStyle(.secondary)
      Text(title).foregroundStyle(.primary)
      Spacer()
      if count > 0 { Text("\(count)").foregroundStyle(.secondary) }
    }
  }

  func mcpBinding(_ option: HomeComposerMCP) -> Binding<Bool> {
    Binding(
      get: { mcpEnabled(option) },
      set: { setMCP(option, enabled: $0) }
    )
  }

  func setMCP(_ option: HomeComposerMCP, enabled: Bool) {
    guard ownsCurrentConnection, effectiveConfiguration != nil else { return }
    var configuration = composerControlsBinding.wrappedValue
    switch option {
    case .browser: configuration.browserMcp = enabled
    case .crossagents: configuration.crossagentMcp = enabled
    case .chrome: configuration.chromeMcp = enabled
    case .computerUse: configuration.computerUse = enabled
    }
    composerControlsBinding.wrappedValue = configuration
  }

  func mcpEnabled(_ option: HomeComposerMCP) -> Bool {
    let configuration = effectiveConfiguration
    return switch option {
    case .browser: configuration?.browserMcp ?? false
    case .crossagents: configuration?.crossagentMcp ?? false
    case .chrome: configuration?.chromeMcp ?? false
    case .computerUse: configuration?.computerUse ?? false
    }
  }

  var selectedBranchLabel: String {
    draft.branchSelection?.branch
      ?? draft.branchOptions.first(where: \.current)?.name
      ?? currentBranch
      ?? HomeStrings.branch
  }

  var filteredBranchOptions: [ProjectGitBranchInfo] {
    let query = draft.branchSearch.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return draft.branchOptions }
    return draft.branchOptions.filter { $0.name.localizedCaseInsensitiveContains(query) }
  }
}

extension HomeComposerSelector {
  var detents: Set<PresentationDetent> {
    switch self {
    case .project: [.fraction(0.56), .large]
    case .add, .model, .controls, .crew: [.large]
    }
  }
}

private struct HomeComposerContextRow: View {
  let title: String
  let icon: String

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: icon).frame(width: 18).foregroundStyle(.secondary)
      Text(title).foregroundStyle(.primary)
      Spacer()
    }
    .contentShape(Rectangle())
  }
}
