import Foundation

/// Page state for the empty composer's resume on a thread page.
struct RichChatThreadResumeState {
  /// Row a successful send was made against: the host owns the turn from then
  /// on, so the resume action waits for the host to restate the row.
  var suppressedRow: RemoteThread?
  /// A relaunch replacing a refused send is in flight; the action waits for it.
  var isRelaunching = false
}

/// Desktop's resume launch (`threadRuntimeActions.ts`) for the empty
/// composer's resume. A host that restarted since the turn was cut off holds no
/// session for the thread and refuses the send with the typed
/// `unknown_thread_session` before any effect, so the same prompt relaunches
/// the thread through the Relaunch action's thread-start-existing path.
@MainActor
enum RichChatResumeRelaunch {
  /// Runs `request`, then settles the refusal `conversation` shows: cleared once
  /// the host accepted the relaunch, uncertain (one authoritative read, never a
  /// resend) when its outcome is unknown, and kept with the action to retry
  /// when the relaunch failed too.
  static func relaunch(
    _ request: ThreadStartExistingRequest,
    target: ThreadLifecycleTarget,
    lifecycle: ThreadLifecycleController,
    replacing refusal: RichChatControllerFailure,
    in conversation: RichChatConversationController
  ) async -> Bool {
    lifecycle.activate(target)
    await lifecycle.start(request, target: target)
    switch lifecycle.lastOutcome {
    case .succeeded?:
      await conversation.replaceFailure(refusal, with: nil)
      return true
    case .failed(_, .ambiguousOutcome)?:
      await conversation.replaceFailure(refusal, with: .ambiguousOutcome)
      return false
    case .failed?, nil:
      return false
    }
  }
}

/// The empty composer's resume for a cut-off turn on the thread page, split
/// from the page below its size gate.
extension RichChatThreadView {
  /// A settled row with a cut-off marker outranks a stale open turn, so Stop
  /// does not stay up after an unexpected close.
  var isComposerTurnActive: Bool {
    RichChatResumePlanner.countsOpenTurn(
      suite.transcript.state.transcript?.openTurn == true,
      thread: thread
    ) || threadStatusIsWorking
  }

  /// The composer's resume wiring: the plan, the relaunch for a refused send,
  /// and the hook every send reports to.
  var composerResume: RichChatComposerResumeContext {
    RichChatComposerResumeContext(
      plan: resumePlan,
      relaunchRefused: { prompt, configuration in
        await relaunchRefusedResume(prompt: prompt, configuration: configuration)
      },
      sendSettled: { [rowAtSubmit = thread] succeeded in
        resumeState.suppressedRow = RichChatResumePlanner.suppression(
          afterSubmitSucceeded: succeeded,
          rowAtSubmit: rowAtSubmit,
          previous: resumeState.suppressedRow
        )
      }
    )
  }

  /// A turn cut off by an error or a restart is picked back up from the empty
  /// composer (desktop `threadResumeState.ts`); the composer withholds it once
  /// the draft has content.
  private var resumePlan: RichChatResumePlan? {
    // Checked first so a thread without a marker never walks its transcript.
    guard RichChatResumePlanner.isInterrupted(thread) else { return nil }
    return RichChatResumePlanner.offer(
      thread: thread,
      items: suite.transcript.state.transcript?.itemsInOrder ?? [],
      canSubmit: canOperate && !suite.conversation.state.isSending
        && !resumeState.isRelaunching && suite.transcript.state.loadState != .loading,
      isTurnActive: isComposerTurnActive,
      suppressedRow: resumeState.suppressedRow
    )
  }

  /// Relaunches the latest row with the same prompt when the host refused the
  /// resume send because it lost the thread's session; false otherwise.
  private func relaunchRefusedResume(prompt: String, configuration: ThreadConfig) async -> Bool {
    guard let refusal = suite.conversation.state.failure, let latest = thread,
      RichChatResumePlanner.relaunches(after: refusal, latest: latest),
      let base = session.threadStartExistingRequest(threadID: threadID, prompt: prompt),
      let target = session.threadLifecycleTarget(threadID: threadID)
    else { return false }
    resumeState.isRelaunching = true
    defer { resumeState.isRelaunching = false }
    return await RichChatResumeRelaunch.relaunch(
      RichChatResumePlanner.relaunchRequest(base, latest: latest, configuration: configuration),
      target: target,
      lifecycle: session.makeThreadLifecycleController(),
      replacing: refusal,
      in: suite.conversation
    )
  }
}
