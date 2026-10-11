import SwiftUI

struct SettingsGenerationView: View {
  let composition: SettingsComposition
  let agentStatuses: SettingsAgentStatuses?
  let refresh: () -> Void

  var body: some View {
    SettingsDocumentState(controller: composition.document, refresh: refresh) { document in
      SettingsGenerationEditor(
        document: document,
        composition: composition,
        agentStatuses: agentStatuses,
        refresh: refresh
      )
    }
  }
}

struct SettingsWorkspaceView: View {
  let composition: SettingsComposition
  let refresh: () -> Void

  var body: some View {
    SettingsDocumentState(controller: composition.document, refresh: refresh) { document in
      SettingsWorkspaceEditor(document: document, composition: composition)
    }
  }
}

struct SettingsGitView: View {
  let composition: SettingsComposition
  let refresh: () -> Void

  var body: some View {
    SettingsDocumentState(controller: composition.document, refresh: refresh) { document in
      SettingsGitEditor(document: document, composition: composition)
    }
  }
}

private struct SettingsGenerationEditor: View {
  let document: SettingsDocument
  let composition: SettingsComposition
  let agentStatuses: SettingsAgentStatuses?
  let refresh: () -> Void

  @State private var draft: SettingsDocumentDraft

  init(
    document: SettingsDocument,
    composition: SettingsComposition,
    agentStatuses: SettingsAgentStatuses?,
    refresh: @escaping () -> Void
  ) {
    self.document = document
    self.composition = composition
    self.agentStatuses = agentStatuses
    self.refresh = refresh
    _draft = State(initialValue: SettingsDocumentDraft(document))
  }

  var body: some View {
    Form {
      Section(SettingsUIStrings.windows) {
        SettingsGenerationGroup(
          title: SettingsUIStrings.titleGeneration,
          value: $draft.title,
          agents: windowsAgents,
          allowsDisabled: true
        )
        SettingsGenerationGroup(
          title: SettingsUIStrings.commitGeneration,
          value: $draft.commit,
          agents: windowsAgents
        )
        SettingsGenerationGroup(
          title: SettingsUIStrings.conflictResolution,
          value: $draft.conflict,
          agents: windowsAgents
        )
      }
      if !wslAgents.isEmpty {
        Section(SettingsUIStrings.wsl) {
          SettingsGenerationGroup(
            title: SettingsUIStrings.titleGeneration,
            value: $draft.wslTitle,
            agents: wslAgents,
            allowsDisabled: true
          )
          SettingsGenerationGroup(
            title: SettingsUIStrings.commitGeneration,
            value: $draft.wslCommit,
            agents: wslAgents
          )
          SettingsGenerationGroup(
            title: SettingsUIStrings.conflictResolution,
            value: $draft.wslConflict,
            agents: wslAgents
          )
        }
      }
    }
    .disabled(composition.gate(.sessionOperate) != nil || composition.isMutating)
    .refreshable { refresh() }
    .toolbar { saveButton }
    .onChange(of: document) { _, value in draft = SettingsDocumentDraft(value) }
  }

  @ToolbarContentBuilder
  private var saveButton: some ToolbarContent {
    if composition.gate(.sessionOperate) == nil {
      ToolbarItem(placement: .confirmationAction) {
        Button(SettingsUIStrings.save) {
          Task {
            await composition.writeSettings(draft.generationPatch(comparedTo: document))
            if let value = composition.document.document {
              draft = SettingsDocumentDraft(value)
            }
          }
        }
        .disabled(
          draft.generationPatch(comparedTo: document).values.isEmpty || composition.isMutating
        )
      }
    }
  }

  private var windowsAgents: [SettingsAgentStatus] {
    (agentStatuses?.windows ?? []).filter(\.installed)
  }

  private var wslAgents: [SettingsAgentStatus] {
    (agentStatuses?.wsl ?? []).filter(\.installed)
  }
}

private struct SettingsGenerationGroup: View {
  let title: String
  @Binding var value: SettingsGenerationDraft
  let agents: [SettingsAgentStatus]
  var allowsDisabled = false

  var body: some View {
    DisclosureGroup(title) {
      Picker(SettingsUIStrings.providerID, selection: providerSelection) {
        Text(SettingsUIStrings.automatic).tag("auto")
        if allowsDisabled {
          Text(SettingsUIStrings.disabled).tag("disabled")
        }
        ForEach(eligibleAgents, id: \.kind) { agent in
          Text(agent.label).tag(agent.kind)
        }
      }
      if let selectedAgent {
        Picker(SettingsUIStrings.modelID, selection: $value.model) {
          if !selectedAgent.models.contains(where: { $0.id == value.model }), !value.model.isEmpty {
            Text(value.model).tag(value.model)
          }
          ForEach(selectedAgent.models) { model in
            Text(model.label).tag(model.id)
          }
        }
        if !selectedAgent.efforts.isEmpty {
          Picker(SettingsUIStrings.effort, selection: $value.effort) {
            ForEach(selectedAgent.efforts, id: \.self) { effort in
              Text(effort).tag(effort)
            }
          }
        }
      } else if value.provider == "auto", let automaticAgent = eligibleAgents.first {
        LabeledContent(SettingsUIStrings.providerID, value: automaticAgent.label)
        if let model = automaticAgent.models.first {
          LabeledContent(SettingsUIStrings.modelID, value: model.label)
        }
      }
      Toggle(SettingsUIStrings.fastMode, isOn: $value.fast)
        .disabled(selectedAgent?.fastModels.contains(value.model) != true)
      if value.presentationMode != nil {
        Picker(
          SettingsUIStrings.presentation,
          selection: Binding(
            get: { value.presentationMode ?? .terminal },
            set: { value.presentationMode = $0 }
          )
        ) {
          Text(SettingsUIStrings.terminal).tag(SettingsPresentationMode.terminal)
          Text(SettingsUIStrings.graphical).tag(SettingsPresentationMode.gui)
        }
      }
    }
  }

  private var eligibleAgents: [SettingsAgentStatus] {
    agents.filter { $0.supportsOneShot || value.presentationMode != nil }
  }

  private var selectedAgent: SettingsAgentStatus? {
    guard value.provider != "auto", value.provider != "disabled" else { return nil }
    return eligibleAgents.first { $0.kind == value.provider }
  }

  private var providerSelection: Binding<String> {
    Binding(
      get: { value.provider },
      set: { provider in
        value.provider = provider
        guard let agent = eligibleAgents.first(where: { $0.kind == provider }) else {
          value.model = ""
          value.effort = ""
          value.fast = false
          return
        }
        value.model = agent.models.first?.id ?? ""
        value.effort = agent.efforts.first ?? ""
        value.fast = false
      }
    )
  }
}

private struct SettingsWorkspaceEditor: View {
  let document: SettingsDocument
  let composition: SettingsComposition

  @State private var draft: SettingsDocumentDraft

  init(document: SettingsDocument, composition: SettingsComposition) {
    self.document = document
    self.composition = composition
    _draft = State(initialValue: SettingsDocumentDraft(document))
  }

  var body: some View {
    Form {
      Section(SettingsUIStrings.worktreeSection) {
        Picker(SettingsUIStrings.storageMode, selection: $draft.worktreeStorageMode) {
          Text(SettingsUIStrings.globalStorage).tag(SettingsWorktreeStorageMode.global)
          Text(SettingsUIStrings.projectStorage).tag(SettingsWorktreeStorageMode.projectRelative)
        }
        TextField(SettingsUIStrings.basePath, text: $draft.worktreeBasePath)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        TextField(SettingsUIStrings.wslBasePath, text: $draft.wslWorktreeBasePath)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
      }
      Section(SettingsUIStrings.automationSection) {
        Picker(SettingsUIStrings.defaultAction, selection: $draft.prAutomationDefault) {
          Text(SettingsUIStrings.off).tag(SettingsPRAutomationDefault.off)
          Text(SettingsUIStrings.fix).tag(SettingsPRAutomationDefault.fix)
          Text(SettingsUIStrings.merge).tag(SettingsPRAutomationDefault.merge)
        }
        Picker(SettingsUIStrings.mergeMethod, selection: $draft.prMergeMethod) {
          Text(SettingsUIStrings.merge).tag(SettingsPRMergeMethod.merge)
          Text(SettingsUIStrings.squash).tag(SettingsPRMergeMethod.squash)
          Text(SettingsUIStrings.rebase).tag(SettingsPRMergeMethod.rebase)
        }
      }
    }
    .disabled(composition.gate(.sessionOperate) != nil || composition.isMutating)
    .refreshable { await composition.document.load() }
    .toolbar { saveButton }
    .onChange(of: document) { _, value in draft = SettingsDocumentDraft(value) }
  }

  @ToolbarContentBuilder
  private var saveButton: some ToolbarContent {
    if composition.gate(.sessionOperate) == nil {
      ToolbarItem(placement: .confirmationAction) {
        Button(SettingsUIStrings.save) {
          Task {
            await composition.writeSettings(draft.workspacePatch(comparedTo: document))
            if let value = composition.document.document {
              draft = SettingsDocumentDraft(value)
            }
          }
        }
        .disabled(
          draft.workspacePatch(comparedTo: document).values.isEmpty || composition.isMutating
        )
      }
    }
  }
}

private struct SettingsGitEditor: View {
  let document: SettingsDocument
  let composition: SettingsComposition

  @State private var draft: SettingsDocumentDraft
  @AppStorage(GitHubPullRequestCreationMode.storageKey) private var createPRMode =
    GitHubPullRequestCreationMode.dialog.rawValue

  init(document: SettingsDocument, composition: SettingsComposition) {
    self.document = document
    self.composition = composition
    _draft = State(initialValue: SettingsDocumentDraft(document))
  }

  var body: some View {
    Form {
      Section {
        Picker(SettingsUIStrings.defaultCreatePRAction, selection: $createPRMode) {
          Text(SettingsUIStrings.openDialog).tag(GitHubPullRequestCreationMode.dialog.rawValue)
          Text(SettingsUIStrings.autoGenerate).tag(GitHubPullRequestCreationMode.auto.rawValue)
        }
      }
      Section(SettingsUIStrings.automationSection) {
        Picker(SettingsUIStrings.defaultAction, selection: $draft.prAutomationDefault) {
          Text(SettingsUIStrings.off).tag(SettingsPRAutomationDefault.off)
          Text(SettingsUIStrings.fix).tag(SettingsPRAutomationDefault.fix)
          Text(SettingsUIStrings.merge).tag(SettingsPRAutomationDefault.merge)
        }
        Picker(SettingsUIStrings.mergeMethod, selection: $draft.prMergeMethod) {
          Text(SettingsUIStrings.merge).tag(SettingsPRMergeMethod.merge)
          Text(SettingsUIStrings.squash).tag(SettingsPRMergeMethod.squash)
          Text(SettingsUIStrings.rebase).tag(SettingsPRMergeMethod.rebase)
        }
      }
    }
    .disabled(composition.gate(.sessionOperate) != nil || composition.isMutating)
    .refreshable { await composition.document.load() }
    .toolbar { saveButton }
    .onChange(of: document) { _, value in draft = SettingsDocumentDraft(value) }
  }

  @ToolbarContentBuilder
  private var saveButton: some ToolbarContent {
    if composition.gate(.sessionOperate) == nil {
      ToolbarItem(placement: .confirmationAction) {
        Button(SettingsUIStrings.save) {
          Task {
            await composition.writeSettings(draft.gitPatch(comparedTo: document))
            if let value = composition.document.document {
              draft = SettingsDocumentDraft(value)
            }
          }
        }
        .disabled(draft.gitPatch(comparedTo: document).values.isEmpty || composition.isMutating)
      }
    }
  }
}

private struct SettingsDocumentState<Content: View>: View {
  @Bindable var controller: SettingsDocumentController
  let refresh: () -> Void
  @ViewBuilder let content: (SettingsDocument) -> Content

  var body: some View {
    if let document = controller.document {
      content(document)
        .overlay(alignment: .bottom) {
          if case .failed(let failure) = controller.state {
            SettingsRefreshFailureBanner(failure: failure, retry: refresh)
              .padding()
          }
        }
    } else {
      switch controller.state {
      case .idle, .loading, .loaded:
        SettingsLoadingView()
      case .failed(let failure):
        SettingsUnavailableView(failure: failure, retry: refresh)
      }
    }
  }
}
