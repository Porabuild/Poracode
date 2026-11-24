import Observation
import SwiftUI

/// Window-owned presentation state, separate from canonical transcript data.
/// Adaptive navigation may replace views without closing their disclosures.
@MainActor @Observable final class TranscriptDisclosureStore {
  struct Key: Hashable, Sendable {
    let connectionID: ClientConnectionID
    let threadID: String
    let disclosureID: String
  }
  struct Scope: Hashable { let connectionID: ClientConnectionID; let threadID: String }
  private struct TailChoice {
    let groupID: String
    let isExpanded: Bool
  }
  private var expanded: Set<Key> = []
  private var focused: [Scope: String] = [:]
  private var tailChoices: [Scope: TailChoice] = [:]
  func contains(_ key: Key) -> Bool { expanded.contains(key) }
  func set(_ value: Bool, for key: Key, focuses: Bool = true) {
    if value { expanded.insert(key) } else { expanded.remove(key) }
    if focuses { applyFocus(value, for: key) }
  }
  private func applyFocus(_ value: Bool, for key: Key) {
    let scope = Scope(connectionID: key.connectionID, threadID: key.threadID)
    if value { focused[scope] = key.disclosureID }
    else if focused[scope] == key.disclosureID { focused.removeValue(forKey: scope) }
  }
  func tailChoice(for key: Key) -> Bool? {
    let scope = Scope(connectionID: key.connectionID, threadID: key.threadID)
    guard let choice = tailChoices[scope], choice.groupID == key.disclosureID else { return nil }
    return choice.isExpanded
  }
  func setTailChoice(_ isExpanded: Bool, for key: Key) {
    let scope = Scope(connectionID: key.connectionID, threadID: key.threadID)
    expanded.remove(key)
    tailChoices[scope] = TailChoice(groupID: key.disclosureID, isExpanded: isExpanded)
    applyFocus(isExpanded, for: key)
  }
  func updateActivityTail(_ groupID: String?, connectionID: ClientConnectionID, threadID: String) {
    let scope = Scope(connectionID: connectionID, threadID: threadID)
    if let choice = tailChoices[scope], choice.groupID != groupID {
      tailChoices.removeValue(forKey: scope)
      if focused[scope] == choice.groupID { focused.removeValue(forKey: scope) }
    }
  }
  func focus(connectionID: ClientConnectionID, threadID: String) -> String? {
    focused[Scope(connectionID: connectionID, threadID: threadID)]
  }
  func clearFocus(connectionID: ClientConnectionID, threadID: String) {
    focused.removeValue(forKey: Scope(connectionID: connectionID, threadID: threadID))
  }
  func retainConnections(_ connections: Set<ClientConnectionID>) {
    expanded = expanded.filter { connections.contains($0.connectionID) }
    focused = focused.filter { connections.contains($0.key.connectionID) }
    tailChoices = tailChoices.filter { connections.contains($0.key.connectionID) }
  }
}

struct TranscriptDisclosureContext: Sendable {
  let store: TranscriptDisclosureStore
  let connectionID: ClientConnectionID
  let threadID: String
  @MainActor var focusID: String? { store.focus(connectionID: connectionID, threadID: threadID) }
  @MainActor func clearFocus() { store.clearFocus(connectionID: connectionID, threadID: threadID) }
  @MainActor func updateActivityTail(_ groupID: String?) {
    store.updateActivityTail(groupID, connectionID: connectionID, threadID: threadID)
  }
  @MainActor func tailBinding(id: String, opensByDefault: Bool) -> Binding<Bool> {
    let key = TranscriptDisclosureStore.Key(connectionID: connectionID, threadID: threadID, disclosureID: id)
    return Binding(
      get: { store.tailChoice(for: key) ?? opensByDefault },
      set: { store.setTailChoice($0, for: key) }
    )
  }
  @MainActor static func binding(
    _ context: Self?, id: String?, fallback: Binding<Bool>, focuses: Bool = true
  ) -> Binding<Bool> {
    guard let context, let id else { return fallback }
    let key = TranscriptDisclosureStore.Key(connectionID: context.connectionID,
      threadID: context.threadID, disclosureID: id)
    return Binding(
      get: { context.store.contains(key) },
      set: { context.store.set($0, for: key, focuses: focuses) }
    )
  }
}

private struct TranscriptDisclosureContextKey: EnvironmentKey {
  static let defaultValue: TranscriptDisclosureContext? = nil
}
extension EnvironmentValues {
  var transcriptDisclosures: TranscriptDisclosureContext? {
    get { self[TranscriptDisclosureContextKey.self] }
    set { self[TranscriptDisclosureContextKey.self] = newValue }
  }
}

struct ToolPresentationEnvironment: ViewModifier {
  let session: AppSession
  let connectionID: ClientConnectionID?
  let threadID: String
  let headings: RichRuntimeItemHeadingController
  func body(content: Content) -> some View {
    let owned = connectionID == session.selectedConnectionId
    let disclosures = owned ? connectionID.map {
      TranscriptDisclosureContext(store: session.transcriptDisclosures, connectionID: $0, threadID: threadID)
    } : nil
    let catalog = owned ? session.state.toolPresentationCatalog : nil
    let providers = owned ? session.state.replay.agentStatuses.ordered : []
    content
      .environment(\.richChatProviderLabels, Dictionary(providers.map { ($0.kind, $0.label) },
        uniquingKeysWith: { first, _ in first }))
      .environment(\.richChatModelLabels, richChatModelLabels(from: providers))
      .environment(\.toolPresentationCatalog, catalog)
      .environment(\.transcriptDisclosures, disclosures)
      .environment(\.runtimeItemHeadings, owned ? headings : nil)
      .environment(\.runtimeItemHeadingSnapshot, [:])
      .environment(\.runtimeToolBodySnapshot, [:])
  }
}
