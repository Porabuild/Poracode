import SwiftUI

/// One stable presentation owner around the add button, outside its transient menu.
/// Async results remain fenced to the thread and live session that requested them.
struct RichChatSessionActionsControls<Content: View>: View {
  let controller: RichChatSessionActionsController
  let agentKind: String
  let isDisabled: Bool
  let insertIntoComposer: (String) -> Void
  @ViewBuilder let content:
    ([RichChatSessionActionEntryTarget], @escaping (RichChatSessionActionPanelKind) -> Void) ->
      Content

  @State private var openPanel: RichChatSessionActionPanelKind?
  @State private var reviseSuggestion: String?
  @State private var reviseMissingSuggestion = false
  @State private var rulesPhase = RichChatListingPhase.idle

  var body: some View {
    content(entries, open)
      .sheet(item: $openPanel) { panel in
        sheet(for: panel)
          .presentationDetents(panel == .reviseCommand ? [.large] : [.medium, .large])
      }
      .onChange(of: controller.state.target) { resetLocalState() }
      .onChange(of: controller.state.owner) { resetLocalState() }
  }

  private var entries: [RichChatSessionActionEntryTarget] {
    RichChatSessionActionCatalog.contributor(for: agentKind)?
      .entries(inventory: controller.state.actionIDs) ?? []
  }

  private func resetLocalState() {
    openPanel = nil
    reviseSuggestion = nil
    reviseMissingSuggestion = false
    rulesPhase = .idle
  }

  private func open(_ panel: RichChatSessionActionPanelKind) {
    guard !isDisabled, controller.state.pendingActionID == nil,
      let contributor = RichChatSessionActionCatalog.contributor(for: agentKind)
    else { return }
    reviseSuggestion = nil
    reviseMissingSuggestion = false
    openPanel = panel
    if panel == .listRules {
      rulesPhase = .loading
      load(panel, store: { rulesPhase = $0 }) { result in
        .rules(try contributor.ruleEntries(in: result))
      }
    }
  }

  private func load(
    _ panel: RichChatSessionActionPanelKind,
    store: @escaping (RichChatListingPhase) -> Void,
    decode: @escaping ([String: RichJSON]) throws -> RichChatListingPhase
  ) {
    guard let actionID = entries.first(where: { $0.panel == panel })?.actionID else {
      store(.failed)
      return
    }
    let owner = controller.state.owner
    let target = controller.state.target
    Task {
      let result = await controller.invoke(
        actionID: actionID, payload: [:], exclusive: false
      )
      // A retired attempt belongs to a session that is gone; it is dropped
      // instead of writing the new owner's panel state.
      guard controller.state.target == target, controller.state.owner == owner else {
        return
      }
      guard let result else {
        store(.failed)
        return
      }
      do {
        store(try decode(result))
      } catch {
        store(.failed)
      }
    }
  }

  @ViewBuilder
  private func sheet(for panel: RichChatSessionActionPanelKind) -> some View {
    switch panel {
    case .reviseCommand:
      RichChatSessionActionReviseSheet(
        suggestion: reviseSuggestion,
        missingSuggestion: reviseMissingSuggestion,
        isPending: controller.state.pendingActionID != nil,
        isDisabled: isDisabled,
        failureText: controller.state.failure.map { RichChatStrings.failure($0) },
        onCancel: { if controller.state.pendingActionID == nil { openPanel = nil } },
        onSubmit: { command, note in submitRevise(command: command, note: note) },
        onInsert: { suggestion in
          guard !isDisabled else { return }
          insertIntoComposer(suggestion)
          resetLocalState()
        },
        onDiscard: { resetLocalState() }
      )
    case .listRules:
      RichChatSessionActionListingSheet(
        title: RichChatSessionActionStrings.rulesTitle,
        phase: rulesPhase,
        emptyText: RichChatSessionActionStrings.rulesEmpty,
        onDone: { openPanel = nil }
      )
    }
  }

  private func submitRevise(command: String, note: String) {
    guard !isDisabled, controller.state.pendingActionID == nil,
      let actionID = entries.first(where: { $0.panel == .reviseCommand })?.actionID,
      let contributor = RichChatSessionActionCatalog.contributor(for: agentKind)
    else { return }
    let owner = controller.state.owner
    let target = controller.state.target
    Task {
      let result = await controller.invoke(
        actionID: actionID,
        payload: contributor.payload(
          for: .reviseCommand,
          form: .init(command: command, note: note)
        )
      )
      guard controller.state.target == target, controller.state.owner == owner else {
        return
      }
      guard let result else { return }
      if let suggested = contributor.reviseSuggestion(in: result) {
        reviseSuggestion = suggested
      } else {
        // An accepted revise without a suggestion is a contract miss — report
        // it, never fabricate a command.
        reviseMissingSuggestion = true
      }
    }
  }
}
