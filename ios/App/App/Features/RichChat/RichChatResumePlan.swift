import Foundation

/// What the empty composer's resume action sends for a cut-off turn. When the
/// agent never answered the latest message, that message is sent again; once
/// it had started answering, the agent is asked to continue.
enum RichChatResumePlan: Equatable, Sendable {
  case resend(prompt: String)
  case continueResponse
}

/// Mirrors the desktop `threadResumeState.ts` rules over the loaded transcript.
enum RichChatResumePlanner {
  /// Host markers for a turn cut off by an error or a restart (never by Stop).
  private static let interruptions: Set<String> = ["error", "restart"]
  private static let turnActiveStatuses: Set<String> = [
    "launching", "working", "needs_approval", "needs_reply",
  ]
  /// Rows that are not the agent's own work on the turn.
  private static let nonOutputItemTypes: Set<String> = [RichItemType.error, "provider_handoff"]

  static func isInterrupted(_ thread: RemoteThread?) -> Bool {
    guard let marker = thread?.interruptedTurn else { return false }
    return interruptions.contains(marker)
  }

  /// The plan a chat thread's composer offers, or nil. The composer withholds
  /// it while the draft has content (`label(for:composerHasContent:)`), so
  /// draft edits never invalidate the page that computes this. `suppressedRow`
  /// is the row a successful send was made against: the host has the turn now,
  /// so the action stays hidden until the host restates the row. A failed send
  /// never sets it, so the action stays available to retry.
  static func offer(
    thread: RemoteThread?,
    items: [RichRuntimeItem],
    canSubmit: Bool,
    isTurnActive: Bool,
    suppressedRow: RemoteThread? = nil
  ) -> RichChatResumePlan? {
    guard let thread, isInterrupted(thread) else { return nil }
    guard !ThreadPresentationFilter.isTerminalPresentation(thread.presentationMode) else {
      return nil
    }
    guard canSubmit, !isTurnActive else { return nil }
    guard !turnActiveStatuses.contains(thread.status) else { return nil }
    if let suppressedRow, suppressedRow == thread { return nil }
    return plan(items: items)
  }

  /// The resume button's spoken label, or nil while the draft has content:
  /// typing, a context chip, or an attachment restores the send button.
  static func label(for plan: RichChatResumePlan?, composerHasContent: Bool) -> String? {
    guard !composerHasContent, let plan else { return nil }
    switch plan {
    case .resend: return RichChatStrings.resendLastMessage
    case .continueResponse: return RichChatStrings.resumeResponse
    }
  }

  /// Row to suppress the action for after a submission made against `rowAtSubmit`.
  static func suppression(
    afterSubmitSucceeded succeeded: Bool,
    rowAtSubmit: RemoteThread?,
    previous: RemoteThread?
  ) -> RemoteThread? {
    succeeded ? rowAtSubmit : previous
  }

  /// Whether the transcript's open turn still counts. A settled host row with a
  /// cut-off marker outranks it: the provider closed without a `turn.completed`
  /// (an unexpected transport close), so that turn is stale and must not keep
  /// Stop up or hide the action. Desktop gates both on the row's status.
  static func countsOpenTurn(_ hasOpenTurn: Bool, thread: RemoteThread?) -> Bool {
    guard hasOpenTurn else { return false }
    guard let thread, isInterrupted(thread) else { return true }
    return turnActiveStatuses.contains(thread.status)
  }

  /// The host's typed refusal of a send for a thread it holds no session for
  /// (`src/shared/threadSessionRefusal.ts`): a definite 422, proven pre-effect.
  static let sessionAbsenceRefusalCode = "unknown_thread_session"

  /// Whether a resume send that failed with `failure` relaunches `latest`
  /// instead: only on the host's typed refusal for a thread it holds no session
  /// for (it restarted since the turn was cut off), which is proven pre-effect,
  /// so nothing was delivered. Like desktop, only a row that can resume its
  /// session qualifies, never one whose turn is running again, and never after
  /// an ambiguous failure.
  static func relaunches(after failure: RichChatControllerFailure?, latest: RemoteThread?) -> Bool {
    guard case .rejected(_, let code)? = failure, code == sessionAbsenceRefusalCode,
      let latest, !turnActiveStatuses.contains(latest.status)
    else { return false }
    return latest.sessionRef != nil || latest.canResumeWithConfig == true
  }

  /// The Relaunch action's request for `latest`, carrying the send's
  /// configuration and resuming the row's provider session.
  static func relaunchRequest(
    _ base: ThreadStartExistingRequest,
    latest: RemoteThread,
    configuration: ThreadConfig
  ) -> ThreadStartExistingRequest {
    var request = base
    request.config = configuration.lifecycleLaunchConfiguration
    request.sessionReference = latest.sessionRef.map {
      ThreadSessionReference(
        providerSessionID: $0.providerSessionID,
        discoveredAt: $0.discoveredAt,
        executionIdentity: $0.executionIdentity
      )
    }
    return request
  }

  /// The text the resume action sends for `plan`.
  static func prompt(for plan: RichChatResumePlan) -> String {
    switch plan {
    case .resend(let prompt): return prompt
    case .continueResponse: return RichChatStrings.resumeContinuePrompt
    }
  }

  /// The send for `plan`, shaped like the composer's typed plain-text send so
  /// it goes through the same conversation operation.
  static func sendInput(for plan: RichChatResumePlan, config: [String: RichJSON])
    -> RichChatSendInput
  {
    let text = prompt(for: plan)
    return RichChatSendInput(
      prompt: text.trimmingCharacters(in: .whitespacesAndNewlines),
      config: config,
      segments: [.text(content: text)],
      userMessageItemID: "user-\(UUID().uuidString.lowercased())"
    )
  }

  /// Nil when nothing in the loaded history can be resumed.
  static func plan(items: [RichRuntimeItem]) -> RichChatResumePlan? {
    var sawOutput = false
    for item in items.reversed() {
      // A sub-agent's rows belong to its parent's delegation, which already
      // counts as the agent's work; its prompt is not the user's message.
      if let parent = item.parentItemID, !parent.isEmpty { continue }
      guard item.type == RichItemType.userMessage else {
        if isAgentOutput(item) { sawOutput = true }
        continue
      }
      let payload = item.payload?.objectValue
      // A live voice transcript is not a turn the agent was asked to work on.
      if payload?["turnIndependent"]?.boolValue == true { continue }
      if sawOutput { return .continueResponse }
      if let prompt = resendableText(payload) { return .resend(prompt: prompt) }
      return .continueResponse
    }
    // The latest message scrolled out of the loaded window behind a long reply.
    return sawOutput ? .continueResponse : nil
  }

  /// A reply or reasoning row the provider opened but never filled is not output.
  private static func isAgentOutput(_ item: RichRuntimeItem) -> Bool {
    if nonOutputItemTypes.contains(item.type) { return false }
    if item.streams.values.contains(where: { !isBlank($0) }) { return true }
    let payload = item.payload?.objectValue
    switch item.type {
    case RichItemType.assistantMessage:
      guard let content = payload?["content"]?.arrayValue else { return false }
      return content.contains { block in
        guard let value = block.objectValue else { return true }
        return value["kind"]?.stringValue != "text" || !isBlank(value["text"]?.stringValue ?? "")
      }
    case RichItemType.reasoning:
      return !isBlank(payload?["summary"]?.stringValue ?? "")
    default:
      return true
    }
  }

  /// Only plain typed text is sent again. Attachments, skills, mentions and form
  /// answers cannot be rebuilt from the painted message, so those turns continue.
  private static func resendableText(_ payload: [String: RichJSON]?) -> String? {
    guard let payload, !isTruthy(payload["questionAnswer"]), !isTruthy(payload["replyForm"]),
      let content = payload["content"]?.arrayValue
    else { return nil }
    var text = ""
    for block in content {
      guard let value = block.objectValue, value["kind"]?.stringValue == "text" else { return nil }
      text += value["text"]?.stringValue ?? ""
    }
    return isBlank(text) ? nil : text
  }

  private static func isBlank(_ text: String) -> Bool {
    text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// JavaScript truthiness, as the desktop rule reads these optional payload fields.
  private static func isTruthy(_ value: RichJSON?) -> Bool {
    switch value {
    case nil, .null?: return false
    case .bool(let flag)?: return flag
    case .string(let text)?: return !text.isEmpty
    case .number(let number)?: return number != 0
    case .object?, .array?: return true
    }
  }
}
