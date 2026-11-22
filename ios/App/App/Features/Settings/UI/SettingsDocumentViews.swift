import SwiftUI

struct SettingsGenerationView: View {
  let composition: SettingsComposition
  let agentStatuses: SettingsAgentStatuses?
  let refresh: () -> Void

  var body: some View {
    SettingsDocumentState(composition: composition, refresh: refresh) { document, lease in
      SettingsGenerationEditor(
        document: document,
        lease: lease,
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
  var showsWSL = true

  var body: some View {
    SettingsDocumentState(composition: composition, refresh: refresh) { document, lease in
      SettingsWorkspaceEditor(
        document: document, lease: lease, composition: composition, showsWSL: showsWSL
      )
    }
  }
}

struct SettingsGitView: View {
  let composition: SettingsComposition
  let refresh: () -> Void

  var body: some View {
    SettingsDocumentState(composition: composition, refresh: refresh) { document, lease in
      SettingsGitEditor(document: document, lease: lease, composition: composition)
    }
  }
}

struct SettingsMemoryView: View {
  let composition: SettingsComposition
  let agentStatuses: SettingsAgentStatuses?
  let refresh: () -> Void

  var body: some View {
    SettingsDocumentState(composition: composition, refresh: refresh) { document, lease in
      if let memory = document.memory {
        SettingsMemoryEditor(
          document: document,
          initialMemory: memory,
          lease: lease,
          composition: composition,
          agentStatuses: agentStatuses,
          refresh: refresh
        )
      } else {
        ContentUnavailableView(
          SettingsUIStrings.memoryTitle,
          systemImage: "brain",
          description: Text(SettingsUIStrings.memoryUnavailable)
        )
      }
    }
  }
}

private struct SettingsGenerationEditor: View {
  let document: SettingsDocument
  let lease: SettingsHostLease
  let composition: SettingsComposition
  let agentStatuses: SettingsAgentStatuses?
  let refresh: () -> Void

  @State private var draft: SettingsDocumentDraft

  init(
    document: SettingsDocument,
    lease: SettingsHostLease,
    composition: SettingsComposition,
    agentStatuses: SettingsAgentStatuses?,
    refresh: @escaping () -> Void
  ) {
    self.document = document
    self.lease = lease
    self.composition = composition
    self.agentStatuses = agentStatuses
    self.refresh = refresh
    _draft = State(initialValue: SettingsDocumentDraft(document))
  }

  var body: some View {
    Form {
      Section(composition.selection?.name ?? SettingsUIStrings.generationTitle) {
        SettingsGenerationGroup(
          title: SettingsUIStrings.titleGeneration,
          value: $draft.title,
          agents: windowsAgents,
          allowsDisabled: true,
          searchField: .titleGeneration
        )
        SettingsGenerationGroup(
          title: SettingsUIStrings.commitGeneration,
          value: $draft.commit,
          agents: windowsAgents,
          searchField: .commitGeneration
        )
        SettingsGenerationGroup(
          title: SettingsUIStrings.conflictResolution,
          value: $draft.conflict,
          agents: windowsAgents,
          searchField: .conflictResolution
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
    .poracodeReadableListMargins(740)
    .settingsSearchScroll()
    .disabled(composition.gate(.sessionOperate) != nil || composition.isMutating)
    .refreshable { refresh() }
    .toolbar {
      SettingsDocumentSaveButton(
        composition: composition, lease: lease, patch: draft.generationPatch(comparedTo: document)
      ) { draft = SettingsDocumentDraft($0) }
    }
    .onChange(of: document) { _, value in draft = SettingsDocumentDraft(value) }
  }

  private var windowsAgents: [SettingsAgentStatus] {
    (agentStatuses?.windows ?? []).filter(\.installed)
  }

  private var wslAgents: [SettingsAgentStatus] {
    (agentStatuses?.wsl ?? []).filter(\.installed)
  }
}

private struct SettingsGenerationGroup: View {
  @Environment(\.settingsSearchField) private var targetField
  @State private var isExpanded = false
  let title: String
  @Binding var value: SettingsGenerationDraft
  let agents: [SettingsAgentStatus]
  var allowsDisabled = false
  var searchField: SettingsSearchField? = nil

  var body: some View {
    let catalog = selectedAgent.map {
      SettingsGenerationModelCatalog(agent: $0, presentation: value.presentationMode)
    }
    let canEditFast = catalog?.canEditFast(value) == true
    DisclosureGroup(title, isExpanded: $isExpanded) {
      Picker(SettingsUIStrings.providerID, selection: providerSelection) {
        Text(SettingsUIStrings.automatic).tag("auto")
        if allowsDisabled {
          Text(SettingsUIStrings.disabled).tag("disabled")
        }
        ForEach(eligibleAgents, id: \.kind) { agent in
          Text(agent.label).tag(agent.kind)
        }
      }
      if let catalog {
        modelControls(catalog)
        if catalog.agent.supportsThinking(forModel: value.model) {
          Toggle(RichChatStrings.thinking, isOn: Binding(
            get: { value.configuration.thinking ?? false },
            set: { value.chooseThinking($0) }
          ))
          .poracodeSwitchStyle()
        }
        let contexts = catalog.agent.contextOptions(forModel: value.model)
        if !contexts.isEmpty {
          Picker(RichChatStrings.contextWindow, selection: Binding(
            get: { contexts.first { $0.id == value.configuration.contextSize }?.id },
            set: { value.chooseContextSize($0) }
          )) {
            Text(SettingsUIStrings.automatic).tag(nil as String?)
            ForEach(contexts) { context in
              Text(context.label).tag(Optional(context.id))
            }
          }
        }
      } else if value.provider == "auto", let automaticAgent = eligibleAgents.first {
        LabeledContent(SettingsUIStrings.providerID, value: automaticAgent.label)
        if let model = automaticAgent.models.first {
          LabeledContent(SettingsUIStrings.modelID, value: model.label)
        }
      }
      Toggle(SettingsUIStrings.fastMode, isOn: Binding(
        get: { catalog?.displayedFast(for: value) ?? false },
        set: { if let catalog { value.applyModelChoice(.fast($0), catalog: catalog) } }
      ))
        .disabled(!canEditFast)
        // A family edit can enable Fast while the same native form row remains visible.
        .id(canEditFast)
        .poracodeSwitchStyle()
      if value.presentationMode != nil {
        Picker(
          SettingsUIStrings.presentation,
          selection: Binding(
            get: { value.presentationMode ?? .terminal },
            set: { value.choosePresentation($0) }
          )
        ) {
          Text(SettingsUIStrings.terminal).tag(SettingsPresentationMode.terminal)
          Text(SettingsUIStrings.graphical).tag(SettingsPresentationMode.gui)
        }
      }
    }
    .settingsSearchAnchor(searchField)
    .onAppear {
      if let searchField, targetField == searchField { isExpanded = true }
    }
  }

  @ViewBuilder
  private func modelControls(_ catalog: SettingsGenerationModelCatalog) -> some View {
    let models = catalog.models
    let currentRow = catalog.rowRepresenting(value.model)
    Picker(SettingsUIStrings.modelID, selection: Binding(
      get: { catalog.rowRepresenting(value.model) },
      set: { value.chooseModelRow($0, catalog: catalog) }
    )) {
      if currentRow.isEmpty {
        Text(SettingsUIStrings.automatic).tag("")
      } else if !models.contains(where: { $0.id == currentRow }) {
        Text(value.model).tag(currentRow)
      }
      ForEach(models) { model in
        let unavailable = catalog.family(containing: model.id) != nil
          && catalog.patch(for: .family(model.id), in: value.configuration) == nil
        Text(model.label).tag(model.id).disabled(unavailable)
      }
    }
    if let family = catalog.family(containing: value.model),
      let member = family.members.first(where: { $0.model == value.model })
    {
      ForEach(family.selectors, id: \.id) { selector in
        if let label = ModelFamilies.localizedSelectorLabel(selector.labelKey),
          let selected = member.selections[selector.id]
        {
          let options = ModelFamilies.selectorOptions(
            catalog.capabilities, config: value.configuration, selectorID: selector.id
          )
          Picker(label, selection: Binding(
            get: { selected },
            set: { value.applyModelChoice(.selector(selectorID: selector.id, value: $0), catalog: catalog) }
          )) {
            ForEach(options, id: \.id) { Text($0.label).tag($0.id) }
          }
          .disabled(!options.contains { option in
            option.id != selected && catalog.patch(
              for: .selector(selectorID: selector.id, value: option.id), in: value.configuration
            ) != nil
          })
        }
      }
    }
    let efforts = catalog.effortOptions(for: value.configuration)
    if !efforts.isEmpty {
      let shown = catalog.displayedEffort(for: value)
      Picker(SettingsUIStrings.effort, selection: Binding(
        get: { catalog.displayedEffort(for: value) },
        set: { value.applyModelChoice(.effort($0), catalog: catalog) }
      )) {
        if !efforts.contains(shown) {
          Text(shown.isEmpty ? SettingsUIStrings.automatic : shown).tag(shown)
        }
        ForEach(efforts, id: \.self) { Text($0).tag($0) }
      }
      .disabled(!efforts.contains { $0 != shown && catalog.patch(
        for: .effort($0), in: value.configuration
      ) != nil })
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
        value.chooseProvider(provider, agent: eligibleAgents.first { $0.kind == provider })
      }
    )
  }
}

private struct SettingsWorkspaceEditor: View {
  let document: SettingsDocument
  let lease: SettingsHostLease
  let composition: SettingsComposition
  let showsWSL: Bool

  @State private var draft: SettingsDocumentDraft
  @State private var keyboardVisible = false

  init(document: SettingsDocument, lease: SettingsHostLease, composition: SettingsComposition, showsWSL: Bool) {
    self.document = document
    self.lease = lease
    self.composition = composition
    self.showsWSL = showsWSL
    _draft = State(initialValue: SettingsDocumentDraft(document))
  }

  var body: some View {
    Form {
      Section(SettingsUIStrings.worktreeSection) {
        Picker(SettingsUIStrings.storageMode, selection: $draft.worktreeStorageMode) {
          Text(SettingsUIStrings.globalStorage).tag(SettingsWorktreeStorageMode.global)
          Text(SettingsUIStrings.projectStorage).tag(SettingsWorktreeStorageMode.projectRelative)
        }
        .accessibilityIdentifier("native-e2e.settings.worktrees.storage")
        .settingsSearchAnchor(.worktreeStorage)
        if draft.worktreeStorageMode == .global {
          TextField(SettingsUIStrings.basePath, text: $draft.worktreeBasePath)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.done)
            .accessibilityIdentifier("native-e2e.settings.worktrees.base")
          if showsWSL {
            TextField(SettingsUIStrings.wslBasePath, text: $draft.wslWorktreeBasePath)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .submitLabel(.done)
              .accessibilityIdentifier("native-e2e.settings.worktrees.wsl-base")
          }
        }
      }
    }
    .poracodeReadableListMargins(740)
    .settingsSearchScroll()
    .disabled(composition.gate(.sessionOperate) != nil || composition.isMutating)
    .interactiveDismissDisabled(!patch.values.isEmpty || composition.isMutating)
    .refreshable { await refresh() }
    .poracodeComposerInset {
      if keyboardVisible {
        save.control.poracodeGlassButtonStyle()
          .frame(maxWidth: .infinity, alignment: .trailing)
          .padding(.horizontal, 16)
          .padding(.vertical, 6)
      }
    }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button(SettingsUIStrings.refresh, systemImage: "arrow.clockwise") { Task { await refresh() } }
          .disabled(composition.isMutating || composition.document.state == .loading)
          .accessibilityIdentifier("native-e2e.settings.worktrees.refresh")
      }
      if !keyboardVisible { save }
    }
    .poracodeAvoidKeyboard { keyboardVisible = $0 > 0 }
    .ignoresSafeArea(.keyboard, edges: .bottom)
    .onChange(of: document) { previous, current in draft.rebaseWorkspace(from: previous, to: current) }
  }

  private var patch: SettingsPatch { draft.workspacePatch(comparedTo: document, includesWSL: showsWSL) }

  private var save: SettingsDocumentSaveButton {
    SettingsDocumentSaveButton(composition: composition, lease: lease, patch: patch) {
      draft = SettingsDocumentDraft($0)
    }
  }

  private func refresh() async {
    guard composition.selection?.lease == lease, !composition.isMutating else { return }
    await composition.refresh(route: .workspace, query: SettingsProfileQuery())
  }
}

private struct SettingsGitEditor: View {
  let document: SettingsDocument
  let lease: SettingsHostLease
  let composition: SettingsComposition

  @State private var draft: SettingsDocumentDraft

  init(document: SettingsDocument, lease: SettingsHostLease, composition: SettingsComposition) {
    self.document = document
    self.lease = lease
    self.composition = composition
    _draft = State(initialValue: SettingsDocumentDraft(document))
  }

  var body: some View {
    Form {
      Section(SettingsUIStrings.automationSection) {
        Picker(SettingsUIStrings.defaultAction, selection: $draft.prAutomationDefault) {
          Text(SettingsUIStrings.off).tag(SettingsPRAutomationDefault.off)
          Text(SettingsUIStrings.fix).tag(SettingsPRAutomationDefault.fix)
          Text(SettingsUIStrings.merge).tag(SettingsPRAutomationDefault.merge)
        }
        .settingsSearchAnchor(.gitDefaultAction)
        Picker(SettingsUIStrings.mergeMethod, selection: $draft.prMergeMethod) {
          Text(SettingsUIStrings.merge).tag(SettingsPRMergeMethod.merge)
          Text(SettingsUIStrings.squash).tag(SettingsPRMergeMethod.squash)
          Text(SettingsUIStrings.rebase).tag(SettingsPRMergeMethod.rebase)
        }
        .accessibilityIdentifier("native-e2e.settings.git.merge-method")
        .settingsSearchAnchor(.gitMergeMethod)
      }
    }
    .poracodeReadableListMargins(740)
    .settingsSearchScroll()
    .disabled(composition.gate(.sessionOperate) != nil || composition.isMutating)
    .refreshable {
      guard composition.selection?.lease == lease else { return }
      await composition.refresh(route: .workspace, query: SettingsProfileQuery())
    }
    .toolbar {
      SettingsDocumentSaveButton(
        composition: composition, lease: lease, patch: draft.gitPatch(comparedTo: document)
      ) { draft = SettingsDocumentDraft($0) }
    }
    .onChange(of: document) { _, value in draft = SettingsDocumentDraft(value) }
  }
}

private struct SettingsMemoryEditor: View {
  let document: SettingsDocument
  let lease: SettingsHostLease
  let composition: SettingsComposition
  let agentStatuses: SettingsAgentStatuses?
  let refresh: () -> Void

  @State private var draft: SettingsDocumentDraft

  init(
    document: SettingsDocument,
    initialMemory: SettingsMemoryPreferences,
    lease: SettingsHostLease,
    composition: SettingsComposition,
    agentStatuses: SettingsAgentStatuses?,
    refresh: @escaping () -> Void
  ) {
    self.document = document
    self.lease = lease
    self.composition = composition
    self.agentStatuses = agentStatuses
    self.refresh = refresh
    var initial = SettingsDocumentDraft(document)
    initial.memory = initialMemory
    _draft = State(initialValue: initial)
  }

  var body: some View {
    if let memory = draft.memory {
      let enabled = memory.enabled
      Form {
        Section {
          Toggle(SettingsUIStrings.memoryUseMemory, isOn: memoryBinding(\.enabled))
            .poracodeSwitchStyle()
            .settingsSearchAnchor(.memoryEnabled)
          Toggle(SettingsUIStrings.memoryLearnFromChats, isOn: memoryBinding(\.learning))
            .poracodeSwitchStyle()
            .disabled(!enabled)
        } header: {
          Text(composition.selection?.name ?? SettingsUIStrings.memoryTitle)
        } footer: {
          Text(SettingsUIStrings.memoryDescription)
        }

        if !eligibleAgents.isEmpty {
          Section(SettingsUIStrings.memoryModelsSection) {
            SettingsMemoryModelGroup(
              title: SettingsUIStrings.memoryCaptureModel,
              provider: memoryBinding(\.captureProvider),
              model: memoryBinding(\.captureModel),
              effort: memoryBinding(\.captureEffort),
              fast: memoryBinding(\.captureFast),
              agents: eligibleAgents
            )
            SettingsMemoryModelGroup(
              title: SettingsUIStrings.memoryDreamModel,
              provider: memoryBinding(\.dreamProvider),
              model: memoryBinding(\.dreamModel),
              effort: memoryBinding(\.dreamEffort),
              fast: memoryBinding(\.dreamFast),
              agents: eligibleAgents
            )
          }
          .disabled(!enabled)
        }

        Section(SettingsUIStrings.memoryCaptureAndDreamSection) {
          Picker(SettingsUIStrings.memoryWhenToCapture, selection: memoryBinding(\.captureTiming)) {
            Text(SettingsUIStrings.memoryCaptureSettle2m).tag(SettingsMemoryCaptureTiming.settle2m)
            Text(SettingsUIStrings.memoryCaptureSettle90s).tag(SettingsMemoryCaptureTiming.settle90s)
            Text(SettingsUIStrings.memoryCaptureCustom).tag(SettingsMemoryCaptureTiming.custom)
            Text(SettingsUIStrings.memoryCaptureLifecycle).tag(SettingsMemoryCaptureTiming.lifecycle)
          }
          if memory.captureTiming == .custom {
            Stepper(
              value: memoryBinding(\.captureCustomMinutes),
              in: 1...240
            ) {
              HStack {
                Text(SettingsUIStrings.memoryCustomIdleMinutes)
                Spacer()
                Text("\(memory.captureCustomMinutes)")
                  .foregroundStyle(.secondary)
                  .monospacedDigit()
              }
            }
          }
          Picker(SettingsUIStrings.memoryWhenDeleted, selection: memoryBinding(\.deletePolicy)) {
            Text(SettingsUIStrings.memoryDeleteSpool).tag(SettingsMemoryDeletePolicy.spool)
            Text(SettingsUIStrings.memoryDeleteLifecycle).tag(SettingsMemoryDeletePolicy.lifecycle)
            Text(SettingsUIStrings.memoryDeleteNever).tag(SettingsMemoryDeletePolicy.never)
          }
          Picker(SettingsUIStrings.memoryDreamSchedule, selection: memoryBinding(\.dreamCadence)) {
            Text(SettingsUIStrings.memoryDreamDaily).tag(SettingsMemoryDreamCadence.daily)
            Text(SettingsUIStrings.memoryDream3d).tag(SettingsMemoryDreamCadence.threeDays)
            Text(SettingsUIStrings.memoryDreamWeekly).tag(SettingsMemoryDreamCadence.weekly)
            Text(SettingsUIStrings.memoryDreamManual).tag(SettingsMemoryDreamCadence.manual)
          }
        }
        .disabled(!enabled)

        Section(SettingsUIStrings.memoryBehaviorSection) {
          Toggle(SettingsUIStrings.memorySuggestSkills, isOn: memoryBinding(\.suggestSkills))
            .poracodeSwitchStyle()
          Toggle(SettingsUIStrings.memoryPreferPoracode, isOn: memoryBinding(\.suppressNative))
            .poracodeSwitchStyle()
          Toggle(SettingsUIStrings.memorySyncAcrossEnvironments, isOn: memoryBinding(\.syncEnabled))
            .poracodeSwitchStyle()
            .settingsSearchAnchor(.memorySync)
        }
        .disabled(!enabled)
      }
      .poracodeReadableListMargins(740)
      .settingsSearchScroll()
      .disabled(composition.gate(.sessionOperate) != nil || composition.isMutating)
      .refreshable { refresh() }
      .toolbar {
        SettingsDocumentSaveButton(
          composition: composition, lease: lease, patch: draft.memoryPatch(comparedTo: document)
        ) { draft = SettingsDocumentDraft($0) }
      }
      .onChange(of: document) { _, value in draft = SettingsDocumentDraft(value) }
    }
  }

  private func memoryBinding<Value>(
    _ keyPath: WritableKeyPath<SettingsMemoryPreferences, Value>
  ) -> Binding<Value> {
    Binding(
      get: { (draft.memory ?? document.memory)![keyPath: keyPath] },
      set: { newValue in
        guard var current = draft.memory ?? document.memory else { return }
        current[keyPath: keyPath] = newValue
        draft.memory = current
      }
    )
  }

  private var eligibleAgents: [SettingsAgentStatus] {
    let disabled = Set(document.disabledAgents)
    let isEligible: (SettingsAgentStatus) -> Bool = { agent in
      agent.installed
        && agent.authState != .missing
        && !disabled.contains(agent.kind)
        && agent.supportsOneShot
        && !agent.models.isEmpty
    }
    let host = (agentStatuses?.windows ?? []).filter(isEligible)
    return host.isEmpty ? (agentStatuses?.wsl ?? []).filter(isEligible) : host
  }
}

private struct SettingsMemoryModelGroup: View {
  @State private var isExpanded = false
  let title: String
  @Binding var provider: String
  @Binding var model: String
  @Binding var effort: String
  @Binding var fast: Bool
  let agents: [SettingsAgentStatus]

  var body: some View {
    DisclosureGroup(title, isExpanded: $isExpanded) {
      Picker(SettingsUIStrings.providerID, selection: providerSelection) {
        Text(SettingsUIStrings.automatic).tag("auto")
        ForEach(agents, id: \.kind) { agent in
          Text(agent.label).tag(agent.kind)
        }
      }
      if let selectedAgent {
        let models = selectedAgent.models
        if !models.isEmpty {
          Picker(SettingsUIStrings.modelID, selection: modelSelection(for: selectedAgent)) {
            ForEach(models, id: \.id) { entry in
              Text(entry.label).tag(entry.id)
            }
          }
        }
        let efforts = selectedAgent.efforts(forModel: model)
        if efforts.count > 1 {
          Picker(SettingsUIStrings.effort, selection: $effort) {
            Text(SettingsUIStrings.memoryEffortDefault).tag("")
            ForEach(efforts, id: \.self) { choice in
              Text(choice).tag(choice)
            }
          }
        }
      }
    }
  }

  private var selectedAgent: SettingsAgentStatus? {
    guard provider != "auto" else { return nil }
    return agents.first { $0.kind == provider }
  }

  private var providerSelection: Binding<String> {
    Binding(
      get: { provider },
      set: { next in
        guard next != provider else { return }
        provider = next
        if next == "auto" {
          model = ""
          effort = ""
          fast = false
        } else if let agent = agents.first(where: { $0.kind == next }) {
          model = agent.models.first?.id ?? ""
          effort = ""
          fast = false
        }
      }
    )
  }

  private func modelSelection(for agent: SettingsAgentStatus) -> Binding<String> {
    Binding(
      get: { model.isEmpty ? (agent.models.first?.id ?? "") : model },
      set: { next in
        guard next != model else { return }
        model = next
        effort = ""
        fast = false
      }
    )
  }
}

private struct SettingsDocumentSaveButton: ToolbarContent {
  let composition: SettingsComposition
  let lease: SettingsHostLease
  let patch: SettingsPatch
  let didSave: (SettingsDocument) -> Void

  private var isAvailable: Bool {
    composition.selection?.lease == lease && composition.gate(.sessionOperate) == nil
  }

  var body: some ToolbarContent {
    if isAvailable {
      ToolbarItem(placement: .confirmationAction) { button }
    }
  }

  @ViewBuilder var control: some View {
    if isAvailable { button }
  }

  private var button: some View {
    Button(SettingsUIStrings.save, systemImage: "checkmark") {
      Task {
        guard await composition.writeSettings(patch, lease: lease),
          composition.document.lease == lease, let document = composition.document.document
        else { return }
        didSave(document)
      }
    }
    .disabled(patch.values.isEmpty || composition.isMutating)
    .accessibilityIdentifier("native-e2e.settings.document.save")
  }
}

private struct SettingsDocumentState<Content: View>: View {
  let composition: SettingsComposition
  let refresh: () -> Void
  @ViewBuilder let content: (SettingsDocument, SettingsHostLease) -> Content

  var body: some View {
    let controller = composition.document
    if let document = controller.document, let lease = controller.lease {
      content(document, lease)
        .id(lease)
        .overlay(alignment: .bottom) {
          if composition.mutationNotice == nil, composition.mutationFailure == nil,
            let failure = controller.refreshFailure {
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
