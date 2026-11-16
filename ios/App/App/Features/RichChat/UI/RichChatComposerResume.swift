import Foundation

/// The page's resume wiring for the composer: what the empty composer offers
/// for a cut-off turn, the relaunch for a send the host refused because it lost
/// the thread's session, and the hook every send reports to.
struct RichChatComposerResumeContext {
  var plan: RichChatResumePlan?
  var relaunchRefused: @MainActor (_ prompt: String, _ configuration: ThreadConfig) async -> Bool =
    { _, _ in false }
  var sendSettled: @MainActor (_ succeeded: Bool) -> Void = { _ in }
}

/// The empty composer's resume for a cut-off turn. It sends through the same
/// conversation send operation as a typed message, so a failure leaves the
/// plan (and the action) in place to retry.
extension RichChatComposerView {
  /// Typing, a context chip, or an attachment restores the normal send button.
  func resumeAction(canSend: Bool) -> RichChatComposerResumeAction? {
    guard let plan = resumeContext.plan,
      let label = RichChatResumePlanner.label(for: plan, composerHasContent: canSend)
    else { return nil }
    return RichChatComposerResumeAction(
      label: label,
      perform: { resumeInterruptedTurn(plan) }
    )
  }

  func resumeInterruptedTurn(_ plan: RichChatResumePlan) {
    let input = RichChatResumePlanner.sendInput(for: plan, config: configuration.richChatObject)
    let context = resumeContext
    let sentConfiguration = configuration
    Task {
      guard await declinePendingApproval() else {
        context.sendSettled(false)
        return
      }
      var succeeded = await controller.send(input)
      // A host that lost the thread's session refuses the send before any
      // effect; the page then relaunches the thread with the same prompt.
      if !succeeded {
        succeeded = await context.relaunchRefused(input.prompt, sentConfiguration)
      }
      context.sendSettled(succeeded)
    }
  }

  /// Prose in the composer declines a regular pending approval before the
  /// next turn starts; false when that approval could not be declined.
  func declinePendingApproval() async -> Bool {
    guard let activeRequest,
      let denial = RichChatPresentation.composerDenyResolution(for: activeRequest)
    else { return true }
    guard canResolveRequests else { return false }
    return await requestController.resolve(denial, request: activeRequest)
  }
}
