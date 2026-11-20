import SwiftUI

extension HomeQuickComposeView {
  var composerAgentInstanceID: String? {
    if let instance = draft.selectedAgentInstanceID { return instance }
    if let launchSeed, launchSeed.initialConfiguration != nil, selectedAgent?.kind == launchSeed.initialAgentKind {
      return launchSeed.initialAgentInstanceID
    }
    return selectedAgent?.kind == defaults?.agentKind ? defaults?.agentInstanceID : nil
  }

  var composerSelectionOwner: ModelSelectionOwner? {
    selectedAgent.map { .init(agentKind: $0.kind, agentInstanceID: composerAgentInstanceID,
      presentationMode: draft.presentationMode) }
  }

  var canTogglePlan: Bool {
    let options = composerControlsCatalog.modeOptions(for: composerControlsBinding.wrappedValue.model)
    return options.contains { $0.id == "plan" }
      && RichChatComposerControlCatalog.nonPlanMode(in: options) != nil
  }

  func togglePlan() {
    guard ownsCurrentConnection, canTogglePlan else { return }
    var configuration = composerControlsBinding.wrappedValue
    configuration.mode = RichChatComposerControlCatalog.modeAfterToggling("plan",
      current: configuration.mode, options: composerControlsCatalog.modeOptions(for: configuration.model))
    composerControlsBinding.wrappedValue = configuration
    draft.selector = nil
  }

  var composerControlsCatalog: RichChatComposerControlCatalog {
    RichChatComposerControlCatalog(
      agentStatus: selectedAgent,
      presentationMode: draft.presentationMode,
      configuration: composerControlsBinding.wrappedValue,
      hiddenModels: draft.hiddenModels,
      agentInstanceID: composerAgentInstanceID,
      modelPreferences: composerSelectionOwner.map { draft.preferences.modelPreferences(for: $0) } ?? [:]
    )
  }

  @ViewBuilder
  var configurationRows: some View {
    Section(HomeStrings.model) {
      NavigationLink(value: HomeComposerDestination.models) {
        HStack(spacing: 10) {
          HomeProviderIcon(kind: selectedAgent?.kind ?? "", agentLabel: selectedAgent?.label)
            .frame(width: 20, height: 20)
          VStack(alignment: .leading, spacing: 3) {
            Text(composerControlsCatalog.modelLabel(composerControlsBinding.wrappedValue.model))
            if let label = selectedAgent?.label {
              Text(label).font(.caption).foregroundStyle(.secondary)
            }
          }
        }
      }
      .accessibilityLabel(HomeStrings.model)
      .accessibilityIdentifier("native-e2e.new-thread-controls.model")
    }
    RichChatComposerConfigurationFields(
      draft: composerControlsBinding, catalog: composerControlsCatalog,
      showsModelSelector: false, bindingsReadOnly: true
    )
  }
}
