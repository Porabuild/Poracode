import Observation

/// Owns the navigation-scoped composer state for one thread page. Keeping this
/// state in a focused observable isolates draft typing from the transcript and
/// responsive page layout while preserving the PWA's park/restore behavior.
@MainActor
@Observable
final class RichChatThreadDraftState {
  var text = ""
  var attachments: [RichChatUploadedAttachment] = []
  var skills: [RichChatSelectedSkill] = []
  var mcps: [RichChatSelectedMCP] = []
  var segments: [RichPromptSegment] = []
  var configuration: ThreadConfig?

  private let store: RichChatComposerDraftStore
  private var activeKey: RichChatComposerDraftKey?
  private var submittingKey: RichChatComposerDraftKey?
  private var discardsOnDisappear = false

  init(store: RichChatComposerDraftStore) {
    self.store = store
  }

  func prepare(for key: RichChatComposerDraftKey, baseConfiguration: ThreadConfig?) {
    guard activeKey != key else {
      if let saved = store.take(for: key) {
        restore(saved, baseConfiguration: baseConfiguration)
      }
      if configuration == nil { configuration = baseConfiguration }
      return
    }

    park()
    activeKey = key
    discardsOnDisappear = false
    if let saved = store.take(for: key) {
      restore(saved, baseConfiguration: baseConfiguration)
    } else {
      reset(configuration: baseConfiguration)
    }
  }

  func synchronizeConfiguration(previous: ThreadConfig?, current: ThreadConfig?) {
    if configuration == nil || configuration == previous { configuration = current }
  }

  func consumeQueuedSegments() {
    guard let activeKey else { return }
    segments.append(contentsOf: store.takeQueuedSegments(for: activeKey))
  }

  func park() {
    guard !discardsOnDisappear, submittingKey == nil, let activeKey else { return }
    store.save(draft, for: activeKey)
  }

  func beginSubmission() {
    guard let activeKey else { return }
    submittingKey = activeKey
    store.clear(activeKey)
  }

  func finishSubmission(succeeded: Bool) {
    guard let submittingKey else { return }
    self.submittingKey = nil
    if succeeded {
      store.clear(submittingKey)
    } else {
      store.save(draft, for: submittingKey)
    }
  }

  func discard() {
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
      configuration: configuration
    )
  }

  private func restore(
    _ saved: RichChatComposerDraft,
    baseConfiguration: ThreadConfig?
  ) {
    text = saved.text
    attachments = saved.attachments
    skills = saved.skills
    mcps = saved.mcps
    segments = saved.segments
    configuration = saved.configuration ?? baseConfiguration
  }

  private func reset(configuration: ThreadConfig?) {
    text = ""
    attachments = []
    skills = []
    mcps = []
    segments = []
    self.configuration = configuration
  }
}
