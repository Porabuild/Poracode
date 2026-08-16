import SwiftUI

struct SettingsGenerationView: View {
  let composition: SettingsComposition
  let refresh: () -> Void

  var body: some View {
    SettingsDocumentState(controller: composition.document, refresh: refresh) { document in
      SettingsGenerationEditor(document: document, composition: composition)
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

private struct SettingsGenerationEditor: View {
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
      Section(SettingsUIStrings.windows) {
        SettingsGenerationGroup(
          title: SettingsUIStrings.titleGeneration,
          value: $draft.title
        )
        SettingsGenerationGroup(
          title: SettingsUIStrings.commitGeneration,
          value: $draft.commit
        )
        SettingsGenerationGroup(
          title: SettingsUIStrings.conflictResolution,
          value: $draft.conflict
        )
      }
      Section(SettingsUIStrings.wsl) {
        SettingsGenerationGroup(
          title: SettingsUIStrings.titleGeneration,
          value: $draft.wslTitle
        )
        SettingsGenerationGroup(
          title: SettingsUIStrings.commitGeneration,
          value: $draft.wslCommit
        )
        SettingsGenerationGroup(
          title: SettingsUIStrings.conflictResolution,
          value: $draft.wslConflict
        )
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
}

private struct SettingsGenerationGroup: View {
  let title: String
  @Binding var value: SettingsGenerationDraft

  var body: some View {
    DisclosureGroup(title) {
      TextField(SettingsUIStrings.providerID, text: $value.provider)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
      TextField(SettingsUIStrings.modelID, text: $value.model)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
      TextField(SettingsUIStrings.effort, text: $value.effort)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
      Toggle(SettingsUIStrings.fastMode, isOn: $value.fast)
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
