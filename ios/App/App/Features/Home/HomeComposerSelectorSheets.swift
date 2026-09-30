import PhotosUI
import SwiftUI
import UIKit

extension HomeQuickComposeView {
  @ViewBuilder
  func selectorSheet(_ destination: HomeComposerSelector) -> some View {
    NavigationStack {
      if destination == .model {
        selectorList(destination)
          .searchable(
            text: $modelSearch,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: Text(HomeStrings.searchModels)
          )
      } else {
        selectorList(destination)
      }
    }
  }

  private func selectorList(_ destination: HomeComposerSelector) -> some View {
    List {
      switch destination {
      case .project: projectRows
      case .model: modelRows
      case .add: addRows
      }
    }
    .poracodeDrawerListStyle()
    .environment(\.defaultMinListRowHeight, 56)
    .navigationTitle(destination.title)
    .navigationBarTitleDisplayMode(.inline)
  }

  @ViewBuilder
  var projectRows: some View {
    ForEach(projects) { project in
      Button {
        projectID = project.id
        selector = nil
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
    let models = availableAgents.flatMap { agent in modelOptions(for: agent) }.filter {
      $0.matches(modelSearch)
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
    }
  }

  func modelRow(_ model: HomeComposerModel) -> some View {
    Button {
      guard let agent = availableAgents.first(where: { $0.kind == model.agentKind }) else {
        return
      }
      selectedAgentKind = agent.kind
      selectedModel = model.modelID
      selectedEffort = defaultEffort(for: agent, modelID: model.modelID)
      fast = false
      configuredConfiguration = nil
      selector = nil
    } label: {
      HStack(spacing: 12) {
        HomeProviderIcon(kind: model.agentKind)
          .frame(width: 20, height: 20)
          .foregroundStyle(.secondary)
        VStack(alignment: .leading, spacing: 2) {
          Text(model.label).foregroundStyle(.primary)
          if let subProvider = model.subProviderLabel {
            Text(subProvider).font(.caption).foregroundStyle(.secondary)
          }
        }
        Spacer()
        if (selectedAgentKind ?? defaults?.agentKind) == model.agentKind,
          effectiveConfiguration?.model == model.modelID
        {
          Image(systemName: "checkmark").foregroundStyle(.tint)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .poracodeDrawerRowSurface()
  }

  @ViewBuilder
  var addRows: some View {
    Section(HomeStrings.add) {
      PhotosPicker(selection: $photoItem, matching: .images) {
        HomeComposerContextRow(title: HomeStrings.photos, icon: "photo")
      }
      .buttonStyle(.plain)
      .poracodeDrawerRowSurface()

      PhotosPicker(selection: $screenshotItem, matching: .screenshots) {
        HomeComposerContextRow(title: HomeStrings.screenshots, icon: "viewfinder")
      }
      .buttonStyle(.plain)
      .poracodeDrawerRowSurface()

      Button {
        guard HomeComposerCameraPicker.isAvailable else {
          failureMessage = HomeStrings.cameraUnavailable
          return
        }
        selector = nil
        DispatchQueue.main.async { showingCamera = true }
      } label: {
        HomeComposerContextRow(title: HomeStrings.camera, icon: "camera")
      }
      .buttonStyle(.plain)
      .poracodeDrawerRowSurface()

      Button {
        selector = nil
        DispatchQueue.main.async { showingImporter = true }
      } label: {
        HomeComposerContextRow(title: HomeStrings.files, icon: "folder")
      }
      .buttonStyle(.plain)
      .poracodeDrawerRowSurface()

      NavigationLink {
        mcpPicker
      } label: {
        HStack(spacing: 12) {
          Image(systemName: "paperclip.badge.ellipsis")
            .frame(width: 18)
            .foregroundStyle(.secondary)
          Text(HomeStrings.mcpServers).foregroundStyle(.primary)
          Spacer()
          if enabledMcpCount > 0 {
            Text("\(enabledMcpCount)").foregroundStyle(.secondary)
          }
        }
      }
      .poracodeDrawerRowSurface()

      if let skillPickerContext {
        NavigationLink {
          RichChatComposerSkillPicker(
            context: skillPickerContext,
            selection: $skills,
            embeddedInNavigationStack: true
          )
        } label: {
          HStack(spacing: 12) {
            Image(systemName: "wand.and.stars")
              .frame(width: 18)
              .foregroundStyle(.secondary)
            Text(SettingsIntegrationsStrings.skills).foregroundStyle(.primary)
            Spacer()
            if !skills.isEmpty {
              Text("\(skills.count)").foregroundStyle(.secondary)
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
            worktreeSelection = option
            if option == .branch, branchSelection?.reusesWorktree == true {
              branchSelection = nil
            }
          } label: {
            selectorRow(option.label, icon: option.icon, selected: worktreeSelection == option)
          }
          .buttonStyle(.plain)
          .poracodeDrawerRowSurface()
        }

        NavigationLink {
          branchPicker
        } label: {
          HStack(spacing: 12) {
            Image(
              systemName: branchSelection?.reusesWorktree == true
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

        if worktreeSelection != .branch, branchSelection?.reusesWorktree != true {
          TextField(GitOperationsStrings.branchName, text: $worktreeBranchName)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .poracodeDrawerRowSurface()
        }
      }
    }

    Section(HomeStrings.mode) {
      Button {
        presentationMode = .gui
        selector = nil
      } label: {
        selectorRow(HomeStrings.chat, icon: "bubble.left", selected: presentationMode == .gui)
      }
      .buttonStyle(.plain)
      .poracodeDrawerRowSurface()
      .disabled(!supportsPresentationMode(.gui))

      Button {
        presentationMode = .terminal
        selector = nil
      } label: {
        selectorRow(HomeStrings.cli, icon: "terminal", selected: presentationMode == .terminal)
      }
      .buttonStyle(.plain)
      .poracodeDrawerRowSurface()
      .disabled(!supportsPresentationMode(.terminal))
    }
  }

  var mcpPicker: some View {
    List {
      Section {
        ForEach(HomeComposerMCP.allCases) { option in
          Toggle(isOn: mcpBinding(option)) {
            Label {
              Text(option.label).foregroundStyle(.primary)
            } icon: {
              Image(systemName: option.icon).foregroundStyle(.secondary)
            }
          }
          .tint(.green)
          .poracodeDrawerRowSurface()
        }
      }
    }
    .poracodeDrawerListStyle()
    .environment(\.defaultMinListRowHeight, 56)
    .navigationTitle(HomeStrings.mcpServers)
    .navigationBarTitleDisplayMode(.inline)
  }

  var branchPicker: some View {
    List {
      if loadingBranches {
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
            branchRow(branch, worktree: worktreeOptions.first { $0.branch == branch.name })
          }
        }
      }
      if branchOptions.isEmpty, !worktreeOptions.isEmpty {
        Section(GitOperationsStrings.worktrees) {
          ForEach(worktreeOptions) { worktree in worktreeRow(worktree) }
        }
      }

      if let failureMessage {
        Text(failureMessage)
          .font(.caption)
          .foregroundStyle(.red)
          .poracodeDrawerRowSurface()
      }

      if worktreeSelection == .branch {
        Section {
          if creatingBranch {
            HStack {
              TextField(GitOperationsStrings.branchName, text: $newBranchName)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { Task { await createBranch() } }
              Button(GitOperationsStrings.createBranch) {
                Task { await createBranch() }
              }
              .disabled(newBranchName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .poracodeDrawerRowSurface()
          } else {
            Button {
              creatingBranch = true
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
    .searchable(text: $branchSearch)
    .task(id: projectID) { await loadBranches() }
  }

  func branchRow(_ branch: ProjectGitBranchInfo, worktree: ProjectGitWorktreeInfo?) -> some View {
    Button {
      Task { await selectBranch(branch, worktree: worktree) }
    } label: {
      HStack(spacing: 12) {
        if switchingBranch == branch.name {
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
    .disabled(switchingBranch != nil)
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
        if branchSelection?.worktreePath == worktree.path {
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

  func mcpBinding(_ option: HomeComposerMCP) -> Binding<Bool> {
    Binding(
      get: { mcpEnabled(option) },
      set: { enabled in
        switch option {
        case .browser: browserMcp = enabled
        case .crossagents: crossagentMcp = enabled
        case .chrome: chromeMcp = enabled
        case .computerUse: computerUse = enabled
        }
      }
    )
  }

  func mcpEnabled(_ option: HomeComposerMCP) -> Bool {
    switch option {
    case .browser: browserMcp ?? defaults?.configuration.browserMcp ?? false
    case .crossagents: crossagentMcp ?? defaults?.configuration.crossagentMcp ?? false
    case .chrome: chromeMcp ?? defaults?.configuration.chromeMcp ?? false
    case .computerUse: computerUse ?? defaults?.configuration.computerUse ?? false
    }
  }

  var selectedBranchLabel: String {
    branchSelection?.branch
      ?? branchOptions.first(where: \.current)?.name
      ?? currentBranch
      ?? HomeStrings.branch
  }

  var filteredBranchOptions: [ProjectGitBranchInfo] {
    let query = branchSearch.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return branchOptions }
    return branchOptions.filter { $0.name.localizedCaseInsensitiveContains(query) }
  }
}

extension HomeComposerSelector {
  var detents: Set<PresentationDetent> {
    switch self {
    case .project: [.fraction(0.56), .large]
    case .add, .model: [.large]
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
