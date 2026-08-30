import SwiftUI

enum ProjectIgnoreFilesChoice: String, CaseIterable, Hashable, Identifiable {
  case inherit
  case enabled
  case disabled

  var id: Self { self }

  init(_ value: Bool?) {
    switch value {
    case true: self = .enabled
    case false: self = .disabled
    case nil: self = .inherit
    }
  }

  var value: Bool? {
    switch self {
    case .inherit: nil
    case .enabled: true
    case .disabled: false
    }
  }
}

struct ProjectSearchSettingsView: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var session: AppSession
  let project: RemoteProject
  @Bindable var commandController: ProjectControllerCommandController

  @State private var settingsComposition: SettingsComposition
  @State private var ignoreFiles: ProjectIgnoreFilesChoice
  @State private var patterns: [String: Bool]
  @State private var newPattern = ""

  init(
    session: AppSession,
    project: RemoteProject,
    commandController: ProjectControllerCommandController
  ) {
    self.session = session
    self.project = project
    self.commandController = commandController
    _settingsComposition = State(
      initialValue: SettingsComposition(gateway: session.makeSettingsSessionGateway())
    )
    _ignoreFiles = State(
      initialValue: ProjectIgnoreFilesChoice(project.searchSettings?.useIgnoreFiles)
    )
    _patterns = State(initialValue: project.searchSettings?.exclude ?? [:])
  }

  var body: some View {
    Form {
      Section {
        Picker(ProjectSettingsStrings.useIgnoreFiles, selection: $ignoreFiles) {
          ForEach(ProjectIgnoreFilesChoice.allCases) { choice in
            Text(ProjectSettingsStrings.ignoreFilesChoice(choice)).tag(choice)
          }
        }
        if ignoreFiles == .inherit {
          LabeledContent(
            ProjectSettingsStrings.defaultValue,
            value: globalUseIgnoreFiles
              ? ProjectSettingsStrings.enabled : ProjectSettingsStrings.disabled
          )
          .foregroundStyle(.secondary)
        }
      } footer: {
        Text(ProjectSettingsStrings.searchDescription)
      }

      Section {
        if rows.isEmpty {
          Text(ProjectSettingsStrings.noPatterns)
            .foregroundStyle(.secondary)
        } else {
          ForEach(rows) { row in
            HStack {
              Text(verbatim: row.pattern)
                .font(.body.monospaced())
              Spacer()
              if row.inherited {
                Text(ProjectSettingsStrings.inherited)
                  .font(.caption2)
                  .textCase(.uppercase)
                  .foregroundStyle(.secondary)
              }
              if row.locked {
                Image(systemName: "lock")
                  .foregroundStyle(.secondary)
                  .accessibilityLabel(ProjectSettingsStrings.alwaysExcluded)
              }
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
              if !row.locked {
                Button(role: .destructive) {
                  remove(row.pattern)
                } label: {
                  Label(ProjectManagementStrings.remove, systemImage: "trash")
                }
              }
            }
          }
        }
      } header: {
        Text(ProjectSettingsStrings.excludePatterns)
      } footer: {
        Text(ProjectSettingsStrings.excludePatternsDescription)
      }

      Section(ProjectSettingsStrings.addPattern) {
        TextField(ProjectSettingsStrings.addPattern, text: $newPattern)
          .font(.body.monospaced())
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .onSubmit(addPattern)
        Button(ProjectSettingsStrings.addPattern, systemImage: "plus") {
          addPattern()
        }
        .disabled(normalizedNewPattern == nil)
      }
    }
    .navigationTitle(ProjectSettingsStrings.search)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button(ProjectManagementStrings.save) { save() }
          .disabled(commandController.state.isExecuting || !hasChanges)
      }
    }
    .refreshable { await settingsComposition.document.load() }
    .task(id: session.currentSettingsHostSelection?.lease) {
      settingsComposition.activate(session.currentSettingsHostSelection)
      await settingsComposition.document.load()
    }
  }

  private var globalUseIgnoreFiles: Bool {
    settingsComposition.document.document?.searchUseIgnoreFiles ?? true
  }

  private var baseline: [String: Bool] {
    ProjectSearchSettingsPresentation.baseline(
      global: settingsComposition.document.document?.searchExclude
    )
  }

  private var rows: [ProjectSearchPatternRow] {
    ProjectSearchSettingsPresentation.rows(baseline: baseline, overrides: patterns)
  }

  private var normalizedNewPattern: String? {
    let value = newPattern.trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }

  private var nextSettings: ProjectSearchSettings? {
    let exclude = patterns.isEmpty ? nil : patterns
    guard ignoreFiles.value != nil || exclude != nil else { return nil }
    return ProjectSearchSettings(useIgnoreFiles: ignoreFiles.value, exclude: exclude)
  }

  private var hasChanges: Bool {
    nextSettings != normalized(project.searchSettings)
  }

  private func normalized(_ settings: ProjectSearchSettings?) -> ProjectSearchSettings? {
    guard let settings else { return nil }
    let exclude = settings.exclude?.isEmpty == false ? settings.exclude : nil
    guard settings.useIgnoreFiles != nil || exclude != nil else { return nil }
    return ProjectSearchSettings(useIgnoreFiles: settings.useIgnoreFiles, exclude: exclude)
  }

  private func addPattern() {
    guard let pattern = normalizedNewPattern else { return }
    patterns[pattern] = true
    newPattern = ""
  }

  private func remove(_ pattern: String) {
    guard pattern != ProjectSearchSettingsPresentation.lockedPattern else { return }
    if baseline[pattern] == true, patterns[pattern] == nil {
      patterns[pattern] = false
    } else {
      patterns.removeValue(forKey: pattern)
    }
  }

  private func save() {
    let patch: PatchValue<ProjectSearchSettings> = nextSettings.map(PatchValue.set) ?? .clear
    Task {
      await commandController.perform(
        .update(
          projectId: project.id,
          patch: ProjectPatch(searchSettings: patch)
        ),
        detectSetup: false
      )
      if commandController.state.failure == nil { dismiss() }
    }
  }
}

struct ProjectSearchPatternRow: Equatable, Identifiable {
  let pattern: String
  let inherited: Bool
  let locked: Bool

  var id: String { pattern }
}

enum ProjectSearchSettingsPresentation {
  static let lockedPattern = "**/.git"

  static let defaultExclude: [String: Bool] = [
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.next": true,
    "**/.turbo": true,
    "**/.venv": true,
    "**/__pycache__": true,
    "**/coverage": true,
    "**/.DS_Store": true,
  ]

  static func baseline(global: [String: Bool]?) -> [String: Bool] {
    defaultExclude.merging(global ?? [:]) { _, globalValue in globalValue }
  }

  static func rows(
    baseline: [String: Bool],
    overrides: [String: Bool]
  ) -> [ProjectSearchPatternRow] {
    var rows = [
      ProjectSearchPatternRow(pattern: lockedPattern, inherited: true, locked: true)
    ]
    var seen = Set([lockedPattern])

    for pattern in baseline.keys.sorted() where baseline[pattern] == true && !seen.contains(pattern)
    {
      seen.insert(pattern)
      guard overrides[pattern] != false else { continue }
      rows.append(
        ProjectSearchPatternRow(
          pattern: pattern,
          inherited: overrides[pattern] == nil,
          locked: false
        )
      )
    }

    for pattern in overrides.keys.sorted()
    where overrides[pattern] == true && !seen.contains(pattern) {
      rows.append(ProjectSearchPatternRow(pattern: pattern, inherited: false, locked: false))
    }
    return rows
  }
}
