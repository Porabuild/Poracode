import Foundation
import Observation

struct RichChatComposerDraftKey: Hashable, Sendable {
  let connectionID: ClientConnectionID
  let threadID: String
}

struct RichChatComposerDraft: Equatable {
  var text: String
  var attachments: [RichChatUploadedAttachment]
  var skills: [RichChatSelectedSkill] = []
  var mcps: [RichChatSelectedMCP] = []
  var segments: [RichPromptSegment] = []
  var configuration: ThreadConfig? = nil

  var isEmpty: Bool {
    text.isEmpty && attachments.isEmpty && skills.isEmpty && mcps.isEmpty && segments.isEmpty
  }
}

/// In-memory parking for launched-thread composer content, matching the PWA's
/// navigation-scoped draft behavior. A host identity is part of every key so
/// provider thread IDs can never expose content from another paired desktop.
@MainActor
@Observable
final class RichChatComposerDraftStore {
  private final class ActiveDraft {
    weak var state: RichChatThreadDraftState?
    var owners = 0

    init(state: RichChatThreadDraftState) {
      self.state = state
    }
  }

  private var drafts: [RichChatComposerDraftKey: RichChatComposerDraft] = [:]
  private var queuedSegments: [RichChatComposerDraftKey: [RichPromptSegment]] = [:]
  private var activeDrafts: [RichChatComposerDraftKey: ActiveDraft] = [:]
  private(set) var revision: UInt64 = 0

  /// Two page trees can overlap briefly during an adaptive layout transition.
  /// Both must bind to one draft until the departing page releases it.
  func acquireState(for key: RichChatComposerDraftKey) -> RichChatThreadDraftState {
    activeDrafts = activeDrafts.filter { $0.value.state != nil }
    if let entry = activeDrafts[key], let state = entry.state {
      entry.owners += 1
      return state
    }
    let state = RichChatThreadDraftState(store: self)
    let entry = ActiveDraft(state: state)
    entry.owners = 1
    activeDrafts[key] = entry
    return state
  }

  func releaseState(_ state: RichChatThreadDraftState, for key: RichChatComposerDraftKey) {
    guard let entry = activeDrafts[key], entry.state === state, entry.owners > 0 else { return }
    entry.owners -= 1
    if entry.owners == 0 { state.park() }
  }

  func save(_ draft: RichChatComposerDraft, for key: RichChatComposerDraftKey) {
    if draft.isEmpty {
      drafts.removeValue(forKey: key)
    } else {
      drafts[key] = draft
    }
  }

  /// Restored drafts are consumed while their composer is mounted. The owning
  /// thread view parks the latest content again when it leaves the hierarchy.
  func take(for key: RichChatComposerDraftKey, consumingQueuedSegments: Bool = true) -> RichChatComposerDraft? {
    var draft =
      drafts.removeValue(forKey: key)
      ?? RichChatComposerDraft(text: "", attachments: [])
    if consumingQueuedSegments { draft.segments.append(contentsOf: takeQueuedSegments(for: key)) }
    return draft.isEmpty ? nil : draft
  }

  func clear(_ key: RichChatComposerDraftKey) {
    drafts.removeValue(forKey: key)
    queuedSegments.removeValue(forKey: key)
  }

  func clear(connectionID: ClientConnectionID) {
    drafts = drafts.filter { $0.key.connectionID != connectionID }
    queuedSegments = queuedSegments.filter { $0.key.connectionID != connectionID }
    activeDrafts = activeDrafts.filter { $0.key.connectionID != connectionID }
  }

  func clearAll() {
    drafts.removeAll()
    queuedSegments.removeAll()
    activeDrafts.removeAll()
  }

  func enqueue(_ segment: RichPromptSegment, for key: RichChatComposerDraftKey) {
    queuedSegments[key, default: []].append(segment)
    revision &+= 1
  }

  func hasDraft(for key: RichChatComposerDraftKey) -> Bool {
    drafts[key]?.isEmpty == false || queuedSegments[key]?.isEmpty == false
  }

  func takeQueuedSegments(for key: RichChatComposerDraftKey) -> [RichPromptSegment] {
    queuedSegments.removeValue(forKey: key) ?? []
  }
}
