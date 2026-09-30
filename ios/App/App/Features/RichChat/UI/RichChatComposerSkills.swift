import SwiftUI

struct RichChatSelectedSkill: Identifiable, Equatable, Sendable {
  let name: String
  let path: String?
  let invocation: String
  let provider: String
  let scope: ThreadPromptSegment.Scope
  let pluginID: String?
  let pluginName: String?

  var id: String {
    [scope.rawValue, provider, path ?? "", name, pluginID ?? ""].joined(separator: "\u{0}")
  }

  var segment: RichPromptSegment {
    .skill(
      name: name,
      path: path,
      invocation: invocation,
      provider: provider,
      scope: scope.rawValue,
      pluginID: pluginID,
      pluginName: pluginName
    )
  }

  var threadSegment: ThreadPromptSegment {
    .skill(
      name: name,
      path: path,
      invocation: invocation,
      provider: provider,
      scope: scope,
      pluginID: pluginID,
      pluginName: pluginName
    )
  }
}

struct RichChatSkillPickerContext {
  let session: AppSession
  let projectIdentity: ProjectIdentity
  let agentKind: String
}

enum RichChatSkillSelectionFactory {
  static func make(
    skill: SettingsSkillEntry,
    invocationKind: String
  ) -> RichChatSelectedSkill {
    let invocation: String
    let scope: ThreadPromptSegment.Scope
    switch invocationKind {
    case "dollar": invocation = "$\(skill.name)"
    case "skill": invocation = "/skill:\(skill.name)"
    case "prompt": invocation = "Use the \(skill.name) skill."
    default: invocation = "/\(skill.name)"
    }
    switch skill.scope {
    case .global: scope = .global
    case .project: scope = .project
    }
    return RichChatSelectedSkill(
      name: skill.name,
      path: skill.skillFilePath,
      invocation: invocation,
      provider: skill.pluginName ?? skill.providerLabel,
      scope: scope,
      pluginID: skill.pluginID,
      pluginName: skill.pluginName
    )
  }
}

struct RichChatComposerSkillPicker: View {
  @Environment(\.dismiss) private var dismiss

  @Bindable private var session: AppSession
  private let projectIdentity: ProjectIdentity
  private let agentKind: String
  private let embeddedInNavigationStack: Bool
  @Binding private var selection: [RichChatSelectedSkill]

  @State private var accessSource: SettingsIntegrationsSessionAccessSource
  @State private var controller: SettingsIntegrationsSkillsController

  init(
    context: RichChatSkillPickerContext,
    selection: Binding<[RichChatSelectedSkill]>,
    embeddedInNavigationStack: Bool = false
  ) {
    session = context.session
    projectIdentity = context.projectIdentity
    agentKind = context.agentKind
    self.embeddedInNavigationStack = embeddedInNavigationStack
    _selection = selection

    let accessSource = SettingsIntegrationsSessionAccessSource()
    let transport = SettingsIntegrationsExactHostTransportSource(
      credentials: context.session.deps.hostCatalog,
      accessProvider: { @MainActor [weak session = context.session, weak accessSource] in
        guard let session, let access = accessSource?.access,
          session.currentSettingsIntegrationsSelection(
            projectIdentity: access.context.projectIdentity
          )?.access == access
        else { return nil }
        return access
      }
    )
    _accessSource = State(initialValue: accessSource)
    _controller = State(
      initialValue: SettingsIntegrationsSkillsController(
        gateway: SelectedSettingsIntegrationsGateway(source: transport)
      )
    )
  }

  @ViewBuilder
  var body: some View {
    if embeddedInNavigationStack {
      pickerContent
    } else {
      NavigationStack {
        pickerContent
      }
      .presentationDetents([.medium, .large])
    }
  }

  private var pickerContent: some View {
    List {
      switch controller.scanState {
      case .idle, .loading:
        HStack {
          Spacer()
          ProgressView()
          Spacer()
        }
        .listRowBackground(Color.clear)
      case .failed(let failure):
        ContentUnavailableView(
          SettingsIntegrationsStrings.failure(failure),
          systemImage: "exclamationmark.triangle"
        )
        .listRowBackground(Color.clear)
      case .loaded where availableSkills.isEmpty:
        ContentUnavailableView(
          SettingsIntegrationsStrings.noSkills,
          systemImage: "wand.and.stars"
        )
        .listRowBackground(Color.clear)
      case .loaded:
        ForEach(availableSkills) { skill in
          skillButton(skill)
        }
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(SettingsIntegrationsStrings.skills)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if !embeddedInNavigationStack {
        ToolbarItem(placement: .confirmationAction) {
          Button(SettingsUIStrings.done) { dismiss() }
        }
      }
    }
    .task(id: activationIdentity) {
      let access = currentSelection?.access
      accessSource.access = access
      controller.activate(access)
      await controller.loadSkills(agentKind: agentKind)
    }
    .onDisappear {
      accessSource.access = nil
      controller.activate(nil)
    }
  }

  private var currentSelection: SettingsIntegrationsSelection? {
    session.currentSettingsIntegrationsSelection(projectIdentity: projectIdentity)
  }

  private var activationIdentity: String {
    let lease = currentSelection?.access.context.lease
    return
      "\(lease?.connectionID.rawValue ?? "none"):\(lease?.generation ?? 0):\(projectIdentity.id):\(agentKind)"
  }

  private var availableSkills: [SettingsSkillEntry] {
    guard controller.invocation != nil else { return [] }
    return controller.skills
      .filter {
        $0.enabled && $0.valid && controller.effectiveSkillIDs.contains($0.id)
      }
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  private func skillButton(_ skill: SettingsSkillEntry) -> some View {
    let selected = selection.contains { $0.id == selectedSkill(skill)?.id }
    return Button {
      toggle(skill)
    } label: {
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: skill.pluginID == nil ? "wand.and.stars" : "puzzlepiece.extension")
          .foregroundStyle(.secondary)
          .frame(width: 22)
        VStack(alignment: .leading, spacing: 3) {
          Text(skill.name)
            .foregroundStyle(.primary)
          if !skill.descriptionText.isEmpty {
            Text(skill.descriptionText)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(3)
          }
          Text(skill.pluginName ?? skill.providerLabel)
            .font(.caption2)
            .foregroundStyle(.tertiary)
        }
        Spacer(minLength: 8)
        if selected {
          Image(systemName: "checkmark.circle.fill")
            .foregroundStyle(.tint)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private func toggle(_ skill: SettingsSkillEntry) {
    guard let value = selectedSkill(skill) else { return }
    if let index = selection.firstIndex(where: { $0.id == value.id }) {
      selection.remove(at: index)
    } else {
      selection.append(value)
    }
  }

  private func selectedSkill(_ skill: SettingsSkillEntry) -> RichChatSelectedSkill? {
    guard let invocationKind = controller.invocation else { return nil }
    return RichChatSkillSelectionFactory.make(skill: skill, invocationKind: invocationKind)
  }
}
