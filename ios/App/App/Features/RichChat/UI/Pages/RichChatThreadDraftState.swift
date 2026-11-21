import Foundation
import Observation

/// Owns the navigation-scoped composer state for one thread page. Keeping this
/// state in a focused observable isolates draft typing from the transcript and
/// responsive page layout while preserving the PWA's park/restore behavior.
@MainActor
@Observable
final class RichChatThreadDraftState {
  let turnClock = RichChatLiveTurnClock()
  var text = ""
  var attachments: [RichChatUploadedAttachment] = []
  var skills: [RichChatSelectedSkill] = []
  var mcps: [RichChatSelectedMCP] = []
  var segments: [RichPromptSegment] = []
  var configuration: ThreadConfig?
  var crews: SavedCrewsController?
  var crewRoster: CrewRosterDraft?
  var composerControlDestination: RichChatComposerControlsPresentation?
  var providerHandoffRequest: ThreadProviderHandoffRequest?
  var connectionID: ClientConnectionID? { activeKey?.connectionID }
  private(set) var restoredPromptOrder: RichChatRestoredPromptOrder?

  private let store: RichChatComposerDraftStore
  private var activeKey: RichChatComposerDraftKey?
  private var submittingKey: RichChatComposerDraftKey?
  private var discardsOnDisappear = false

  init(store: RichChatComposerDraftStore) {
    self.store = store
  }

  func prepare(for key: RichChatComposerDraftKey, baseConfiguration: ThreadConfig?) {
    guard activeKey != key else {
      if let saved = store.take(for: key, consumingQueuedSegments: false) {
        restore(saved, baseConfiguration: baseConfiguration)
      }
      if configuration == nil { configuration = baseConfiguration }
      return
    }

    park()
    crewRoster = nil
    composerControlDestination = nil
    providerHandoffRequest = nil
    crews = nil
    activeKey = key
    discardsOnDisappear = false
    // The page explicitly consumes the inbox after preparation so it can
    // expand and focus the editor for a newly inserted quote.
    if let saved = store.take(for: key, consumingQueuedSegments: false) {
      restore(saved, baseConfiguration: baseConfiguration)
    } else {
      reset(configuration: baseConfiguration)
    }
  }

  func synchronizeConfiguration(previous: ThreadConfig?, current: ThreadConfig?) {
    if configuration == nil || configuration == previous { configuration = current }
  }

  @discardableResult
  func consumeQueuedSegments() -> Bool {
    guard let activeKey else { return false }
    let incoming = store.takeQueuedSegments(for: activeKey)
    guard !incoming.isEmpty else { return false }
    segments.append(contentsOf: incoming)
    return true
  }

  func park() {
    guard !discardsOnDisappear, submittingKey == nil, let activeKey else { return }
    store.save(draft, for: activeKey)
  }

  func beginSubmission() {
    guard let activeKey else { return }
    submittingKey = activeKey
    store.clearInput(activeKey)
  }

  func finishSubmission(succeeded: Bool) {
    guard let submittingKey else { return }
    self.submittingKey = nil
    if succeeded {
      store.clearInput(submittingKey)
      store.setAlternateDraft(nil, for: submittingKey)
      restoredPromptOrder = nil
    } else {
      store.save(draft, for: submittingKey)
    }
  }

  var pendingRevertedPromptID: UUID? {
    guard submittingKey == nil, !discardsOnDisappear, let activeKey else { return nil }
    return store.revertedPromptID(for: activeKey)
  }

  var alternateDraftIsRevertedPrompt: Bool? {
    guard let activeKey else { return nil }
    return store.alternateDraft(for: activeKey)?.isRevertedPrompt
  }

  @discardableResult
  func restoreRevertedPrompt(availableSkills: [RichChatSelectedSkill]) -> Bool {
    guard submittingKey == nil, !discardsOnDisappear, let activeKey,
      let prompt = store.takeRevertedPrompt(for: activeKey)
    else { return false }
    let restored = prompt.draft(availableSkills: availableSkills)
    guard !restored.isEmpty else { return false }
    consumeQueuedSegments()
    let previous = draft
    store.setAlternateDraft(previous.isEmpty ? nil : .init(draft: previous, isRevertedPrompt: false), for: activeKey)
    restoreContent(restored)
    return true
  }

  func switchRestoredDraft() {
    guard submittingKey == nil, let activeKey, let alternate = store.alternateDraft(for: activeKey)
    else { return }
    store.setAlternateDraft(.init(draft: draft, isRevertedPrompt: !alternate.isRevertedPrompt), for: activeKey)
    restoreContent(alternate.draft)
  }

  func discard() {
    providerHandoffRequest = nil
    discardsOnDisappear = true
    if let activeKey { store.clear(activeKey) }
    if let submittingKey { store.clear(submittingKey) }
    submittingKey = nil
    reset(configuration: nil)
  }

  private var draft: RichChatComposerDraft {
    RichChatComposerDraft(
      text: text,
      attachments: attachments,
      skills: skills,
      mcps: mcps,
      segments: segments,
      configuration: configuration,
      restoredOrder: restoredPromptOrder
    )
  }

  private func restore(
    _ saved: RichChatComposerDraft,
    baseConfiguration: ThreadConfig?
  ) {
    restoreContent(saved)
    configuration = saved.configuration ?? baseConfiguration
  }

  private func restoreContent(_ saved: RichChatComposerDraft) {
    text = saved.text
    attachments = saved.attachments
    skills = saved.skills
    mcps = saved.mcps
    segments = saved.segments
    restoredPromptOrder = saved.restoredOrder
  }

  private func reset(configuration: ThreadConfig?) {
    text = ""
    attachments = []
    skills = []
    mcps = []
    segments = []
    restoredPromptOrder = nil
    self.configuration = configuration
  }
}
