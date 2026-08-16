import SwiftUI

struct RemoteIntegrationsPRWatchesView: View {
  let selection: RemoteIntegrationsHostSelection?
  let projects: [RemoteIntegrationsProjectOption]
  let composition: RemoteIntegrationsComposition
  let isPresentationActive: Bool

  @State private var projectID: String
  @State private var prNumber = 1
  @State private var editor: RemoteIntegrationsPRWatchEditorTarget?
  @State private var confirmation: RemoteIntegrationsPRWatchConfirmation?

  init(
    selection: RemoteIntegrationsHostSelection?,
    projects: [RemoteIntegrationsProjectOption],
    composition: RemoteIntegrationsComposition,
    isPresentationActive: Bool
  ) {
    self.selection = selection
    self.projects = projects
    self.composition = composition
    self.isPresentationActive = isPresentationActive
    _projectID = State(initialValue: projects.first?.id ?? "")
  }

  var body: some View {
    Group {
      if let failure = composition.gate(.sessionRead) {
        RemoteIntegrationsUnavailableView(failure: failure)
      } else {
        watchList
      }
    }
    .navigationTitle(RemoteIntegrationsStrings.prWatches)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: loadIdentity) {
      guard isPresentationActive else { return }
      composition.activate(selection)
    }
    .sheet(item: $editor) { target in
      RemoteIntegrationsPRWatchEditor(
        target: target,
        projects: projects,
        controller: composition.prWatch
      )
    }
    .alert(item: $confirmation) { confirmation in
      alert(confirmation)
    }
    .overlay(alignment: .bottom) {
      RemoteIntegrationsMutationBanner(
        notice: composition.prWatch.notice,
        failure: composition.prWatch.mutationFailure,
        dismiss: composition.prWatch.clearFeedback
      )
      .padding()
    }
  }

  private var loadIdentity: RemoteIntegrationsLoadIdentity {
    RemoteIntegrationsLoadIdentity(
      lease: selection?.lease,
      lifecycleGeneration: composition.lifecycleGeneration,
      isPresentationActive: isPresentationActive
    )
  }

  private var watchList: some View {
    List {
      targetSection
      switch composition.prWatch.state {
      case .idle:
        unavailableSection(
          title: RemoteIntegrationsStrings.selectPR,
          description: RemoteIntegrationsStrings.selectPRDescription,
          systemImage: "arrow.triangle.branch"
        )
      case .loading:
        Section {
          HStack {
            Spacer()
            ProgressView(RemoteIntegrationsStrings.loading)
            Spacer()
          }
        }
      case .failed(let failure):
        Section {
          Label(
            RemoteIntegrationsStrings.failure(failure),
            systemImage: "exclamationmark.triangle"
          )
          Button(RemoteIntegrationsStrings.retry) { loadTarget() }
        }
      case .loaded:
        if let watch = composition.prWatch.watch {
          watchSections(watch)
        } else {
          unavailableSection(
            title: RemoteIntegrationsStrings.noPRWatch,
            description: RemoteIntegrationsStrings.noPRWatchDescription,
            systemImage: "eye.slash"
          )
          if !mutationDisabled, let key = targetKey {
            Section {
              Button(RemoteIntegrationsStrings.createPRWatch, systemImage: "plus") {
                editor = .create(key)
              }
            }
          }
        }
      }
      if composition.gate(.sessionOperate) != nil {
        Section { RemoteIntegrationsReadOnlyNotice() }
      }
    }
    .listStyle(.insetGrouped)
    .refreshable {
      if let targetKey { await composition.prWatch.load(targetKey) }
    }
  }

  private var targetSection: some View {
    Section(RemoteIntegrationsStrings.target) {
      if projects.isEmpty {
        TextField(RemoteIntegrationsStrings.projectID, text: $projectID)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .privacySensitive()
      } else {
        Picker(RemoteIntegrationsStrings.project, selection: $projectID) {
          ForEach(projects) { project in
            Text(project.name).tag(project.id)
          }
        }
      }
      Stepper(value: $prNumber, in: 1...RemoteIntegrationsPRWatchDraft.maximumPRNumber) {
        LabeledContent(RemoteIntegrationsStrings.prNumber) {
          Text(prNumber, format: .number)
            .monospacedDigit()
        }
      }
      Button(RemoteIntegrationsStrings.lookUp, systemImage: "magnifyingglass") {
        loadTarget()
      }
      .disabled(targetKey == nil)
    }
  }

  @ViewBuilder
  private func watchSections(_ watch: RemoteIntegrationsPRWatch) -> some View {
    Section(RemoteIntegrationsStrings.pullRequest) {
      LabeledContent(RemoteIntegrationsStrings.prNumber) {
        Text(watch.prNumber, format: .number)
          .monospacedDigit()
      }
      LabeledContent(RemoteIntegrationsStrings.headBranch) {
        Text(watch.headBranch)
          .privacySensitive()
      }
      Toggle(RemoteIntegrationsStrings.watchEnabled, isOn: .constant(watch.watchEnabled))
        .disabled(true)
      Toggle(RemoteIntegrationsStrings.autoMerge, isOn: .constant(watch.autoMerge))
        .disabled(true)
      if watch.hasLastError {
        Label(RemoteIntegrationsStrings.lastCheckFailed, systemImage: "exclamationmark.triangle")
          .foregroundStyle(.secondary)
      }
    }
    Section {
      Button(RemoteIntegrationsStrings.edit, systemImage: "pencil") {
        editor = .edit(watch)
      }
      Button(RemoteIntegrationsStrings.checkNow, systemImage: "arrow.clockwise") {
        confirmation = .check
      }
      Button(RemoteIntegrationsStrings.delete, systemImage: "trash", role: .destructive) {
        confirmation = .delete
      }
    }
    .disabled(mutationDisabled)
  }

  private func unavailableSection(
    title: String,
    description: String,
    systemImage: String
  ) -> some View {
    Section {
      ContentUnavailableView {
        Label(title, systemImage: systemImage)
      } description: {
        Text(description)
      }
    }
  }

  private var targetKey: RemoteIntegrationsPRWatchKey? {
    let clean = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !clean.isEmpty, prNumber >= 1 else { return nil }
    return RemoteIntegrationsPRWatchKey(projectId: clean, prNumber: prNumber)
  }

  private var mutationDisabled: Bool {
    composition.gate(.sessionOperate) != nil || composition.prWatch.isMutating
  }

  private func loadTarget() {
    guard let targetKey else { return }
    Task { await composition.prWatch.load(targetKey) }
  }

  private func alert(_ confirmation: RemoteIntegrationsPRWatchConfirmation) -> Alert {
    switch confirmation {
    case .check:
      Alert(
        title: Text(RemoteIntegrationsStrings.confirmCheckPRWatch),
        primaryButton: .default(Text(RemoteIntegrationsStrings.checkNow)) {
          Task { await composition.prWatch.check() }
        },
        secondaryButton: .cancel(Text(RemoteIntegrationsStrings.cancel))
      )
    case .delete:
      Alert(
        title: Text(RemoteIntegrationsStrings.confirmDeletePRWatch),
        message: Text(RemoteIntegrationsStrings.deletePRWatchMessage),
        primaryButton: .destructive(Text(RemoteIntegrationsStrings.delete)) {
          Task { await composition.prWatch.delete() }
        },
        secondaryButton: .cancel(Text(RemoteIntegrationsStrings.cancel))
      )
    }
  }
}

struct RemoteIntegrationsLoadIdentity: Hashable {
  let lease: RemoteIntegrationsHostLease?
  let lifecycleGeneration: UInt64
  let isPresentationActive: Bool
}

enum RemoteIntegrationsPRWatchEditorTarget: Identifiable {
  case create(RemoteIntegrationsPRWatchKey)
  case edit(RemoteIntegrationsPRWatch)

  var id: String {
    switch self {
    case .create(let key): "create:\(key.projectId):\(key.prNumber)"
    case .edit(let watch): "edit:\(watch.projectId):\(watch.prNumber)"
    }
  }
}

enum RemoteIntegrationsPRWatchConfirmation: String, Identifiable {
  case check
  case delete

  var id: Self { self }
}
